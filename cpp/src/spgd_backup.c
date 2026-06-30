/*
 * Module 8: Sensorless AO Backup - Sophia-SPGD
 * 
 * Implements:
 *   - Standard SPGD optimization
 *   - Sophia-SPGD with second-order clipped optimization
 *   - Adaptive learning rate and bound scheduling
 *   - Image sharpness metric
 * 
 * References:
 *   - Chen et al. (2025): Sophia-SPGD
 *   - Vorontsov et al.: Stochastic parallel gradient descent
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include "ao_core.h"

/* ============================================================================
 * SPGD INITIALIZATION
 * ============================================================================ */

int ao_spgd_init(ao_spgd_state_t *spgd,
                 uint32_t n_actuators,
                 double learning_rate,
                 uint32_t max_iterations)
{
    if (!spgd || n_actuators == 0) return -1;
    
    spgd->n_actuators = n_actuators;
    spgd->lr = learning_rate;
    spgd->l0 = learning_rate;
    spgd->max_iterations = max_iterations;
    spgd->iteration = 0;
    spgd->beta1 = 0.9;
    spgd->beta2 = 0.99;
    spgd->gamma = 0.01;
    spgd->bound = 1.0;
    spgd->rho0 = 0.01; /* Decay rate */
    spgd->performance_metric = 0.0;
    
    /* Allocate arrays */
    spgd->u = (double*)ao_calloc(n_actuators, sizeof(double));
    spgd->m = (double*)ao_calloc(n_actuators, sizeof(double));
    spgd->h = (double*)ao_calloc(n_actuators, sizeof(double));
    spgd->delta_u = (double*)ao_malloc(n_actuators * sizeof(double));
    
    if (!spgd->u || !spgd->m || !spgd->h || !spgd->delta_u) {
        ao_spgd_free(spgd);
        return -1;
    }
    
    return 0;
}

/* ============================================================================
 * SOPHIA-SPGD UPDATE STEP
 * ============================================================================ */

int ao_sophia_spgd_step(ao_spgd_state_t *spgd,
                        double (*performance_func)(const double*, uint32_t, void*),
                        void *user_data)
{
    if (!spgd || !performance_func) return -1;
    
    uint32_t n = spgd->n_actuators;
    uint32_t k = spgd->iteration;
    
    if (k >= spgd->max_iterations) return 0; /* Done */
    
    /* Decaying learning rate: l_n = l0 / (1 + rho0 * k) */
    spgd->lr = spgd->l0 / (1.0 + spgd->rho0 * (double)k);
    
    /* Adaptive bound: bound = 0.5 * (1 + cos(pi * k / T)) */
    spgd->bound = 0.5 * (1.0 + cos(AO_PI * (double)k / (double)spgd->max_iterations));
    if (spgd->bound < 0.1) spgd->bound = 0.1;
    
    /* Generate random perturbation: Bernoulli +/- sigma */
    double sigma = 0.01; /* Perturbation amplitude */
    for (uint32_t i = 0; i < n; i++) {
        spgd->delta_u[i] = ((rand() % 2) == 0 ? 1.0 : -1.0) * sigma;
    }
    
    /* Evaluate J(u + delta_u) */
    double *u_plus = (double*)ao_malloc(n * sizeof(double));
    if (!u_plus) return -1;
    
    for (uint32_t i = 0; i < n; i++) {
        u_plus[i] = spgd->u[i] + spgd->delta_u[i];
    }
    double J_plus = performance_func(u_plus, n, user_data);
    
    /* Evaluate J(u - delta_u) */
    double *u_minus = (double*)ao_malloc(n * sizeof(double));
    if (!u_minus) {
        ao_free(u_plus);
        return -1;
    }
    
    for (uint32_t i = 0; i < n; i++) {
        u_minus[i] = spgd->u[i] - spgd->delta_u[i];
    }
    double J_minus = performance_func(u_minus, n, user_data);
    
    /* Gradient estimate: g1 = [J+ - J-] * sign(delta_u) */
    double *g1 = (double*)ao_malloc(n * sizeof(double));
    if (!g1) {
        ao_free(u_plus); ao_free(u_minus);
        return -1;
    }
    
    double dJ = J_plus - J_minus;
    for (uint32_t i = 0; i < n; i++) {
        g1[i] = dJ * ((spgd->delta_u[i] > 0) ? 1.0 : -1.0) / (2.0 * sigma);
    }
    
    /* First-order momentum: m_k = beta1 * m_{k-1} + (1-beta1) * g1 */
    for (uint32_t i = 0; i < n; i++) {
        spgd->m[i] = spgd->beta1 * spgd->m[i] + (1.0 - spgd->beta1) * g1[i];
    }
    
    /* Second-order estimate: h_k = beta2 * h_{k-1} + (1-beta2) * |g1| */
    for (uint32_t i = 0; i < n; i++) {
        spgd->h[i] = spgd->beta2 * spgd->h[i] + (1.0 - spgd->beta2) * fabs(g1[i]);
        if (spgd->h[i] < 1e-10) spgd->h[i] = 1e-10; /* Prevent division by zero */
    }
    
    /* Sophia update: u = u + lr * clip(m / max(gamma*h, eps), -bound, bound) */
    for (uint32_t i = 0; i < n; i++) {
        double update = spgd->m[i] / (spgd->gamma * spgd->h[i]);
        
        /* Clipping */
        if (update > spgd->bound) update = spgd->bound;
        if (update < -spgd->bound) update = -spgd->bound;
        
        spgd->u[i] += spgd->lr * update;
        
        /* Soft bound on control amplitude */
        double max_u = 1.0;
        if (spgd->u[i] > max_u) spgd->u[i] = max_u;
        if (spgd->u[i] < -max_u) spgd->u[i] = -max_u;
    }
    
    /* Store performance metric */
    spgd->performance_metric = (J_plus + J_minus) * 0.5;
    
    spgd->iteration++;
    
    ao_free(u_plus); ao_free(u_minus); ao_free(g1);
    
    return 0;
}

/* ============================================================================
 * SPGD MOMENTUM UPDATE (for manual control)
 * ============================================================================ */

int ao_spgd_update_momentum(ao_spgd_state_t *spgd,
                            double J_plus, double J_minus)
{
    if (!spgd) return -1;
    
    uint32_t n = spgd->n_actuators;
    uint32_t k = spgd->iteration;
    
    /* Gradient estimate */
    double dJ = J_plus - J_minus;
    double sigma = 0.01;
    
    /* Momentum update */
    for (uint32_t i = 0; i < n; i++) {
        double g1 = dJ * ((spgd->delta_u[i] > 0) ? 1.0 : -1.0) / (2.0 * sigma);
        spgd->m[i] = spgd->beta1 * spgd->m[i] + (1.0 - spgd->beta1) * g1;
    }
    
    return 0;
}

/* ============================================================================
 * IMAGE SHARPNESS METRIC
 * ============================================================================ */

double ao_spgd_default_sharpness(const double *frame,
                                 uint32_t width, uint32_t height)
{
    if (!frame || width == 0 || height == 0) return 0.0;
    
    /* Sharpness metric: sum of squared gradients (Tenengrad) */
    double sharpness = 0.0;
    uint32_t count = 0;
    
    for (uint32_t y = 1; y < height - 1; y++) {
        for (uint32_t x = 1; x < width - 1; x++) {
            /* Sobel-like gradient computation */
            double gx = frame[y * width + (x + 1)] - frame[y * width + (x - 1)];
            double gy = frame[(y + 1) * width + x] - frame[(y - 1) * width + x];
            
            sharpness += gx * gx + gy * gy;
            count++;
        }
    }
    
    if (count > 0) {
        sharpness /= count;
    }
    
    /* Normalize to [0, 1] range */
    double normalized = sharpness / (1.0 + sharpness);
    
    return normalized;
}

/* ============================================================================
 * CLEANUP
 * ============================================================================ */

void ao_spgd_free(ao_spgd_state_t *spgd)
{
    if (!spgd) return;
    
    ao_free(spgd->u);
    ao_free(spgd->m);
    ao_free(spgd->h);
    ao_free(spgd->delta_u);
    
    spgd->u = NULL;
    spgd->m = NULL;
    spgd->h = NULL;
    spgd->delta_u = NULL;
    spgd->n_actuators = 0;
}
