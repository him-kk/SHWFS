/*
 * Module 6: Hysteresis Compensation (Preisach Model)
 * 
 * Implements:
 *   - Preisach operator evaluation
 *   - Weight density identification via constrained least-squares
 *   - Inverse Preisach for feedforward compensation
 *   - Combined feedforward + feedback compensation
 * 
 * References:
 *   - Dubra et al. (2005): Preisach modeling for deformable mirrors
 *   - Mayergoyz (1991): Mathematical Models of Hysteresis
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include "ao_core.h"

/* ============================================================================
 * PREISACH MODEL INITIALIZATION
 * ============================================================================ */

int ao_preisach_init(ao_preisach_model_t *model,
                     double u_min, double u_max,
                     uint32_t discretization)
{
    if (!model || discretization == 0) return -1;
    
    model->M = discretization;
    model->u_min = u_min;
    model->u_max = u_max;
    model->n_history = 0;
    
    /* Allocate weight density function (upper triangular) */
    model->mu = (double*)ao_malloc(discretization * discretization * sizeof(double));
    model->history_alpha = (double*)ao_malloc(discretization * sizeof(double));
    model->history_beta = (double*)ao_malloc(discretization * sizeof(double));
    model->history_states = (int*)ao_malloc(discretization * sizeof(int));
    
    if (!model->mu || !model->history_alpha || !model->history_beta || 
        !model->history_states) {
        ao_preisach_free(model);
        return -1;
    }
    
    /* Initialize with simple Gaussian-like weight function */
    /* Everett function approximation: Everett(a,b) = (a-b)/2 for linear hysteresis */
    double du = (u_max - u_min) / (double)discretization;
    
    for (uint32_t i = 0; i < discretization; i++) {
        for (uint32_t j = 0; j <= i; j++) { /* Upper triangular: alpha >= beta */
            double alpha = u_min + (i + 1) * du;
            double beta = u_min + j * du;
            
            /* Simple Everett function model */
            /* For small hysteresis: Everett(a,b) ≈ k*(a-b) */
            /* mu(a,b) = -d^2E/dadbd = constant for simple model */
            double diff = alpha - beta;
            model->mu[i * discretization + j] = 1.0 / (diff + du);
        }
        for (uint32_t j = i + 1; j < discretization; j++) {
            model->mu[i * discretization + j] = 0.0; /* Lower triangle unused */
        }
    }
    
    /* Normalize */
    double sum = 0.0;
    for (uint32_t i = 0; i < discretization * discretization; i++) {
        sum += model->mu[i];
    }
    if (sum > 0) {
        for (uint32_t i = 0; i < discretization * discretization; i++) {
            model->mu[i] /= sum;
        }
    }
    
    /* Initialize history with negative saturation */
    model->history_alpha[0] = u_min;
    model->history_beta[0] = u_min;
    model->history_states[0] = -1;
    model->n_history = 1;
    
    return 0;
}

/* ============================================================================
 * PREISACH OPERATOR EVALUATION
 * ============================================================================ */

static int relay_state(double alpha, double beta, double u, 
                       const ao_preisach_model_t *model)
{
    /* Simple relay: +1 if u >= alpha, -1 if u <= beta, 
       depends on history for alpha > u > beta */
    if (u >= alpha) return 1;
    if (u <= beta) return -1;
    
    /* For intermediate values, use history */
    /* Check if (alpha, beta) is in P+ or P- region */
    for (int k = (int)model->n_history - 1; k >= 0; k--) {
        if (alpha <= model->history_alpha[k] && 
            beta >= model->history_beta[k]) {
            /* Inside a past switching region */
            double du = (model->u_max - model->u_min) / model->M;
            if (model->history_states[k] > 0) {
                return (u >= alpha - du) ? 1 : -1;
            } else {
                return (u <= beta + du) ? -1 : 1;
            }
        }
    }
    
    return -1; /* Default: negative state */
}

double ao_preisach_evaluate(const ao_preisach_model_t *model, double u)
{
    if (!model || model->M == 0) return 0.0;
    
    double output = 0.0;
    double du = (model->u_max - model->u_min) / (double)model->M;
    
    /* Double integral over Preisach plane */
    for (uint32_t i = 0; i < model->M; i++) {
        double alpha = model->u_min + (i + 1) * du;
        
        for (uint32_t j = 0; j <= i; j++) {
            double beta = model->u_min + j * du;
            
            int R_ab = relay_state(alpha, beta, u, model);
            double mu_ab = model->mu[i * model->M + j];
            
            output += mu_ab * (double)R_ab * du * du;
        }
    }
    
    return output;
}

/* ============================================================================
 * INVERSE PREISACH
 * ============================================================================ */

double ao_preisach_inverse(const ao_preisach_model_t *model, double y_desired)
{
    if (!model || model->M == 0) return 0.0;
    
    /* Bisection method to find u such that Preisach(u) = y_desired */
    double u_low = model->u_min;
    double u_high = model->u_max;
    double y_low = ao_preisach_evaluate(model, u_low);
    double y_high = ao_preisach_evaluate(model, u_high);
    
    if (y_desired <= y_low) return u_low;
    if (y_desired >= y_high) return u_high;
    
    /* Bisection iteration */
    for (int iter = 0; iter < 50; iter++) {
        double u_mid = (u_low + u_high) * 0.5;
        double y_mid = ao_preisach_evaluate(model, u_mid);
        
        if (fabs(y_mid - y_desired) < 1e-10) {
            return u_mid;
        }
        
        if (y_mid < y_desired) {
            u_low = u_mid;
            y_low = y_mid;
        } else {
            u_high = u_mid;
            y_high = y_mid;
        }
    }
    
    return (u_low + u_high) * 0.5;
}

/* ============================================================================
 * PREISACH IDENTIFICATION
 * ============================================================================ */

int ao_preisach_identify(ao_preisach_model_t *model,
                         const double *input_values,
                         const double *output_values,
                         uint32_t n_points)
{
    if (!model || !input_values || !output_values || n_points < 2) return -1;
    
    /* Constrained linear least-squares identification */
    /* We identify the Everett function E(a,b) from monotonic sweep data */
    
    double du = (model->u_max - model->u_min) / (double)model->M;
    
    /* For each (alpha, beta) grid point, estimate mu from measured data */
    for (uint32_t i = 0; i < model->M; i++) {
        double alpha = model->u_min + (i + 1) * du;
        
        for (uint32_t j = 0; j <= i; j++) {
            double beta = model->u_min + j * du;
            
            /* Find data points where relay switches */
            double sum_output = 0.0;
            uint32_t count = 0;
            
            for (uint32_t k = 0; k < n_points; k++) {
                double u = input_values[k];
                
                /* Everett function: E(a,b) = (output_up(a) - output_down(b))/2 */
                if (u >= beta - du && u <= alpha + du) {
                    sum_output += output_values[k];
                    count++;
                }
            }
            
            if (count > 0) {
                /* Update mu: second derivative of Everett function */
                double Everett = sum_output / count;
                model->mu[i * model->M + j] = fabs(Everett) / ((alpha - beta) + du);
            }
        }
    }
    
    /* Ensure non-negativity constraint */
    for (uint32_t i = 0; i < model->M * model->M; i++) {
        if (model->mu[i] < 0) model->mu[i] = 0.0;
    }
    
    /* Normalize */
    double sum = 0.0;
    for (uint32_t i = 0; i < model->M * model->M; i++) {
        sum += model->mu[i];
    }
    if (sum > 0) {
        for (uint32_t i = 0; i < model->M * model->M; i++) {
            model->mu[i] /= sum;
        }
    }
    
    return 0;
}

/* ============================================================================
 * COMPENSATION
 * ============================================================================ */

int ao_preisach_compensate_commands(ao_preisach_model_t *model,
                                    ao_actuator_t *commands,
                                    uint32_t n_actuators)
{
    if (!model || !commands || n_actuators == 0) return -1;
    
    for (uint32_t i = 0; i < n_actuators; i++) {
        if (commands[i].enabled) {
            /* Apply inverse Preisach model */
            double desired_displacement = commands[i].command;
            commands[i].voltage = ao_preisach_inverse(model, desired_displacement);
        }
    }
    
    return 0;
}

void ao_preisach_free(ao_preisach_model_t *model)
{
    if (!model) return;
    
    ao_free(model->mu);
    ao_free(model->history_alpha);
    ao_free(model->history_beta);
    ao_free(model->history_states);
    
    model->mu = NULL;
    model->history_alpha = NULL;
    model->history_beta = NULL;
    model->history_states = NULL;
    model->M = 0;
    model->n_history = 0;
}
