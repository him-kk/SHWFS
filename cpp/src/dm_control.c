/*
 * Module 5: Deformable Mirror Actuator Mapping
 * 
 * Implements:
 *   - Fried geometry alignment
 *   - Gaussian influence function computation
 *   - Influence function matrix H construction
 *   - Regularized command calculation (with modal covariance + Laplacian)
 *   - Stroke constraints and clipping
 *   - Waffle mode detection and suppression
 * 
 * References:
 *   - Dubra (2007): Wavefront sensor and corrector matching
 *   - Fried (1977): Geometry definitions
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include "ao_core.h"

/* ============================================================================
 * FRIED GEOMETRY ALIGNMENT
 * ============================================================================ */

int ao_dm_align_fried(const ao_subap_config_t *subap_cfg,
                      ao_dm_config_t          *dm_config,
                      double                   magnification)
{
    if (!subap_cfg || !dm_config) return -1;
    
    /* In Fried geometry, actuators are at lenslet corners */
    /* Optimal: ~1.5-2 lenslets per actuator */
    dm_config->geometry = 0; /* Fried */
    
    uint32_t nx = subap_cfg->grid_x;
    uint32_t ny = subap_cfg->grid_y;
    
    /* Compute actuator grid size */
    /* With Fried geometry: actuators = lenslets + 1 in each dimension */
    dm_config->grid_x = nx + 1;
    dm_config->grid_y = ny + 1;
    dm_config->n_actuators = dm_config->grid_x * dm_config->grid_y;
    
    /* Pitch ratio: approximately 1.03x */
    dm_config->pitch = subap_cfg->pitch_meters / magnification;
    
    /* Allocate actuator array */
    dm_config->actuators = (ao_actuator_t*)ao_malloc(
        dm_config->n_actuators * sizeof(ao_actuator_t));
    if (!dm_config->actuators) return -1;
    
    /* Position actuators in Fried geometry */
    double half_pitch = dm_config->pitch * 0.5;
    double total_width = (dm_config->grid_x - 1) * dm_config->pitch;
    double total_height = (dm_config->grid_y - 1) * dm_config->pitch;
    
    for (uint32_t iy = 0; iy < dm_config->grid_y; iy++) {
        for (uint32_t ix = 0; ix < dm_config->grid_x; ix++) {
            uint32_t idx = iy * dm_config->grid_x + ix;
            dm_config->actuators[idx].x = ix * dm_config->pitch - total_width * 0.5;
            dm_config->actuators[idx].y = iy * dm_config->pitch - total_height * 0.5;
            dm_config->actuators[idx].command = 0.0;
            dm_config->actuators[idx].voltage = 0.0;
            dm_config->actuators[idx].enabled = 1;
        }
    }
    
    return 0;
}

/* ============================================================================
 * INFLUENCE FUNCTION
 * ============================================================================ */

double ao_influence_function(double x, double y,
                             double x_act, double y_act,
                             double sigma)
{
    double dx = x - x_act;
    double dy = y - y_act;
    double r2 = dx * dx + dy * dy;
    double sigma2 = sigma * sigma;
    
    return exp(-r2 / (2.0 * sigma2));
}

/* Build influence function matrix H */
int ao_build_influence_matrix(const ao_dm_config_t    *dm,
                              const ao_subap_config_t *subap_cfg,
                              double                  *H_matrix)
{
    if (!dm || !subap_cfg || !H_matrix) return -1;
    
    uint32_t n_subaps = subap_cfg->grid_x * subap_cfg->grid_y;
    uint32_t n_act = dm->n_actuators;
    double pitch = subap_cfg->pitch_meters;
    double sigma = dm->sigma_if * dm->pitch;
    
    /* H[i,j] = influence of actuator j at sub-aperture i */
    for (uint32_t iy = 0; iy < subap_cfg->grid_y; iy++) {
        for (uint32_t ix = 0; ix < subap_cfg->grid_x; ix++) {
            uint32_t subap_idx = iy * subap_cfg->grid_x + ix;
            
            /* Sub-aperture center position */
            double x_subap = (ix - (subap_cfg->grid_x - 1) * 0.5) * pitch;
            double y_subap = (iy - (subap_cfg->grid_y - 1) * 0.5) * pitch;
            
            for (uint32_t j = 0; j < n_act; j++) {
                double x_act = dm->actuators[j].x;
                double y_act = dm->actuators[j].y;
                
                H_matrix[subap_idx * n_act + j] = ao_influence_function(
                    x_subap, y_subap, x_act, y_act, sigma);
            }
        }
    }
    
    return 0;
}

/* ============================================================================
 * DM COMMAND COMPUTATION
 * ============================================================================ */

int ao_compute_dm_commands(const ao_wavefront_t    *wavefront,
                           const ao_dm_config_t    *dm,
                           const double            *H_matrix,
                           const double            *cov_inv,
                           double                   lambda,
                           double                   gamma,
                           ao_actuator_t           *commands)
{
    if (!wavefront || !dm || !H_matrix || !commands) return -1;
    
    uint32_t n_subaps = wavefront->n_x * wavefront->n_y;
    uint32_t n_act = dm->n_actuators;
    
    /* Build system: (H^T * H + lambda * C^{-1} + gamma * L^T * L) * v = H^T * phi */
    double *HtH = (double*)ao_malloc(n_act * n_act * sizeof(double));
    double *Htb = (double*)ao_malloc(n_act * sizeof(double));
    double *reg_matrix = (double*)ao_malloc(n_act * n_act * sizeof(double));
    double *rhs = (double*)ao_malloc(n_act * sizeof(double));
    double *solution = (double*)ao_malloc(n_act * sizeof(double));
    
    if (!HtH || !Htb || !reg_matrix || !rhs || !solution) {
        ao_free(HtH); ao_free(Htb); ao_free(reg_matrix); ao_free(rhs); ao_free(solution);
        return -1;
    }
    
    /* Compute H^T * H */
    for (uint32_t i = 0; i < n_act; i++) {
        for (uint32_t j = 0; j < n_act; j++) {
            double sum = 0.0;
            for (uint32_t k = 0; k < n_subaps; k++) {
                sum += H_matrix[k * n_act + i] * H_matrix[k * n_act + j];
            }
            HtH[i * n_act + j] = sum;
        }
    }
    
    /* Compute H^T * phi (target wavefront) */
    for (uint32_t i = 0; i < n_act; i++) {
        double sum = 0.0;
        for (uint32_t k = 0; k < n_subaps; k++) {
            sum += H_matrix[k * n_act + i] * wavefront->phase[k];
        }
        Htb[i] = sum;
    }
    
    /* Build regularized matrix: HtH + lambda * C^{-1} + gamma * Laplacian */
    memcpy(reg_matrix, HtH, n_act * n_act * sizeof(double));
    
    /* Add modal covariance regularization */
    if (cov_inv && lambda > 0) {
        for (uint32_t i = 0; i < n_act && i < AO_MAX_ACTUATORS; i++) {
            for (uint32_t j = 0; j < n_act && j < AO_MAX_ACTUATORS; j++) {
                reg_matrix[i * n_act + j] += lambda * cov_inv[i * AO_MAX_ACTUATORS + j];
            }
        }
    }
    
    /* Add Laplacian smoothness penalty for waffle suppression */
    if (gamma > 0) {
        uint32_t gx = dm->grid_x;
        uint32_t gy = dm->grid_y;
        
        for (uint32_t iy = 0; iy < gy; iy++) {
            for (uint32_t ix = 0; ix < gx; ix++) {
                uint32_t idx = iy * gx + ix;
                
                /* Diagonal: +4 * gamma */
                reg_matrix[idx * n_act + idx] += 4.0 * gamma;
                
                /* Neighbors: -gamma */
                if (ix > 0) {
                    uint32_t left = iy * gx + (ix - 1);
                    reg_matrix[idx * n_act + left] -= gamma;
                }
                if (ix + 1 < gx) {
                    uint32_t right = iy * gx + (ix + 1);
                    reg_matrix[idx * n_act + right] -= gamma;
                }
                if (iy > 0) {
                    uint32_t below = (iy - 1) * gx + ix;
                    reg_matrix[idx * n_act + below] -= gamma;
                }
                if (iy + 1 < gy) {
                    uint32_t above = (iy + 1) * gx + ix;
                    reg_matrix[idx * n_act + above] -= gamma;
                }
            }
        }
    }
    
    /* Copy RHS */
    memcpy(rhs, Htb, n_act * sizeof(double));
    
    /* Solve regularized system */
    int status = ao_solve_linear_system(reg_matrix, rhs, n_act, solution);
    
    /* Copy solution to commands */
    for (uint32_t i = 0; i < n_act; i++) {
        commands[i].command = solution[i];
        commands[i].x = dm->actuators[i].x;
        commands[i].y = dm->actuators[i].y;
    }
    
    ao_free(HtH); ao_free(Htb); ao_free(reg_matrix); ao_free(rhs); ao_free(solution);
    
    return status;
}

/* ============================================================================
 * STROKE CONSTRAINTS
 * ============================================================================ */

int ao_apply_stroke_constraints(ao_actuator_t *commands,
                                uint32_t       n_actuators,
                                double         max_stroke)
{
    if (!commands || n_actuators == 0) return -1;
    
    uint32_t clipped = 0;
    
    for (uint32_t i = 0; i < n_actuators; i++) {
        if (commands[i].command > max_stroke) {
            commands[i].command = max_stroke;
            clipped++;
        } else if (commands[i].command < -max_stroke) {
            commands[i].command = -max_stroke;
            clipped++;
        }
    }
    
    /* If more than 10% clipped, signal need for stroke minimization */
    if (clipped > n_actuators / 10) {
        return 1; /* Warning: significant clipping */
    }
    
    return 0;
}

/* Simple stroke minimization using gradient projection */
int ao_stroke_minimization_qp(const double *H, const double *phi_target,
                              uint32_t n_meas, uint32_t n_act,
                              double max_stroke, double epsilon,
                              double *commands)
{
    if (!H || !phi_target || !commands) return -1;
    
    /* Start with minimum norm solution */
    double *HtH = (double*)ao_malloc(n_act * n_act * sizeof(double));
    double *Htb = (double*)ao_malloc(n_act * sizeof(double));
    if (!HtH || !Htb) {
        ao_free(HtH); ao_free(Htb);
        return -1;
    }
    
    /* H^T * H */
    for (uint32_t i = 0; i < n_act; i++) {
        for (uint32_t j = 0; j < n_act; j++) {
            double sum = 0.0;
            for (uint32_t k = 0; k < n_meas; k++) {
                sum += H[k * n_act + i] * H[k * n_act + j];
            }
            HtH[i * n_act + j] = sum;
        }
        if (HtH[i * n_act + i] < 1e-12) HtH[i * n_act + i] = 1e-12;
    }
    
    /* H^T * phi */
    for (uint32_t i = 0; i < n_act; i++) {
        double sum = 0.0;
        for (uint32_t k = 0; k < n_meas; k++) {
            sum += H[k * n_act + i] * phi_target[k];
        }
        Htb[i] = sum;
    }
    
    /* Add regularization for minimum norm */
    for (uint32_t i = 0; i < n_act; i++) {
        HtH[i * n_act + i] += epsilon;
    }
    
    ao_solve_linear_system(HtH, Htb, n_act, commands);
    
    /* Apply clipping */
    for (uint32_t i = 0; i < n_act; i++) {
        if (commands[i] > max_stroke) commands[i] = max_stroke;
        if (commands[i] < -max_stroke) commands[i] = -max_stroke;
    }
    
    ao_free(HtH); ao_free(Htb);
    return 0;
}

/* ============================================================================
 * WAFFLE MODE DETECTION AND SUPPRESSION
 * ============================================================================ */

double ao_detect_waffle_mode(const ao_actuator_t *commands,
                             uint32_t grid_x, uint32_t grid_y)
{
    if (!commands || grid_x == 0 || grid_y == 0) return 0.0;
    
    /* Waffle mode: checkerboard pattern */
    /* Detect by computing alternating sum */
    double waffle_amplitude = 0.0;
    uint32_t count = 0;
    
    for (uint32_t iy = 0; iy < grid_y; iy++) {
        for (uint32_t ix = 0; ix < grid_x; ix++) {
            uint32_t idx = iy * grid_x + ix;
            double sign = ((ix + iy) % 2 == 0) ? 1.0 : -1.0;
            waffle_amplitude += sign * commands[idx].command;
            count++;
        }
    }
    
    if (count > 0) {
        waffle_amplitude /= count;
    }
    
    return fabs(waffle_amplitude);
}

int ao_suppress_waffle(double *command_matrix, uint32_t grid_x, uint32_t grid_y)
{
    if (!command_matrix || grid_x == 0 || grid_y == 0) return -1;
    
    /* Estimate and remove waffle component */
    double waffle_amp = 0.0;
    uint32_t count = 0;
    
    for (uint32_t iy = 0; iy < grid_y; iy++) {
        for (uint32_t ix = 0; ix < grid_x; ix++) {
            uint32_t idx = iy * grid_x + ix;
            double sign = ((ix + iy) % 2 == 0) ? 1.0 : -1.0;
            waffle_amp += sign * command_matrix[idx];
            count++;
        }
    }
    
    if (count > 0) {
        waffle_amp /= count;
    }
    
    /* Subtract waffle */
    for (uint32_t iy = 0; iy < grid_y; iy++) {
        for (uint32_t ix = 0; ix < grid_x; ix++) {
            uint32_t idx = iy * grid_x + ix;
            double sign = ((ix + iy) % 2 == 0) ? 1.0 : -1.0;
            command_matrix[idx] -= sign * waffle_amp;
        }
    }
    
    return 0;
}
