/*
 * Module 7: Real-Time Control
 * 
 * Implements:
 *   - PI (Proportional-Integral) control
 *   - LQG (Linear Quadratic Gaussian) control with Kalman filter
 *   - Modified LQG with correlation-locking for non-stationary turbulence
 *   - Turbulence state-space model (AR1)
 * 
 * References:
 *   - Sivo et al. (2013): MOAO LQG on CANARY
 *   - Deo et al. (2021): Correlation-locking adaptive filtering
 *   - Sengupta (2020): Kalman filtering for tip-tilt correction
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include "ao_core.h"

/* ============================================================================
 * PI CONTROL
 * ============================================================================ */

static double *pi_integral = NULL;
static uint32_t pi_n_outputs = 0;
static double pi_kp = 1.0;
static double pi_ki = 0.1;

int ao_pi_control_init(double kp, double ki, uint32_t n_outputs)
{
    pi_kp = kp;
    pi_ki = ki;
    pi_n_outputs = n_outputs;
    
    ao_free(pi_integral);
    pi_integral = (double*)ao_calloc(n_outputs, sizeof(double));
    if (!pi_integral) return -1;
    
    return 0;
}

int ao_pi_control_update(const double *error,
                         uint32_t n_outputs,
                         double *control_output)
{
    if (!error || !control_output || !pi_integral) return -1;
    
    if (n_outputs > pi_n_outputs) n_outputs = pi_n_outputs;
    
    for (uint32_t i = 0; i < n_outputs; i++) {
        /* Integral accumulation */
        pi_integral[i] += error[i];
        
        /* Anti-windup: limit integral */
        double max_integral = 10.0 / (pi_ki + 1e-10);
        if (pi_integral[i] > max_integral) pi_integral[i] = max_integral;
        if (pi_integral[i] < -max_integral) pi_integral[i] = -max_integral;
        
        /* PI output */
        control_output[i] = pi_kp * error[i] + pi_ki * pi_integral[i];
    }
    
    return 0;
}

void ao_pi_control_reset(void)
{
    if (pi_integral && pi_n_outputs > 0) {
        memset(pi_integral, 0, pi_n_outputs * sizeof(double));
    }
}

/* ============================================================================
 * LQG CONTROL
 * ============================================================================ */

int ao_lqg_init(ao_lqg_state_t *lqg,
                uint32_t n_states, uint32_t n_meas, uint32_t n_ctrl,
                double process_noise, double meas_noise)
{
    if (!lqg || n_states == 0 || n_meas == 0) return -1;
    
    lqg->n_states = n_states;
    lqg->n_meas = n_meas;
    lqg->n_ctrl = n_ctrl;
    lqg->loop_gain = 1.0;
    lqg->correlation_lock = 1.0;
    
    /* Allocate matrices */
    lqg->x_hat = (double*)ao_calloc(n_states, sizeof(double));
    lqg->P = (double*)ao_calloc(n_states * n_states, sizeof(double));
    lqg->K = (double*)ao_calloc(n_states * n_meas, sizeof(double));
    lqg->A = (double*)ao_malloc(n_states * n_states * sizeof(double));
    lqg->B = (double*)ao_malloc(n_states * n_ctrl * sizeof(double));
    lqg->C = (double*)ao_malloc(n_meas * n_states * sizeof(double));
    lqg->Q = (double*)ao_malloc(n_states * n_states * sizeof(double));
    lqg->R = (double*)ao_malloc(n_meas * n_meas * sizeof(double));
    
    if (!lqg->x_hat || !lqg->P || !lqg->K || !lqg->A || !lqg->B || 
        !lqg->C || !lqg->Q || !lqg->R) {
        ao_lqg_free(lqg);
        return -1;
    }
    
    /* Initialize state transition A as diagonal with AR1 coefficients */
    memset(lqg->A, 0, n_states * n_states * sizeof(double));
    double ar1_coeff = 0.99; /* Slightly less than 1 for stability */
    for (uint32_t i = 0; i < n_states; i++) {
        lqg->A[i * n_states + i] = ar1_coeff;
        if (i + 2 < n_states) {
            /* Weak coupling between adjacent modes */
            lqg->A[i * n_states + (i + 2)] = 0.01;
            lqg->A[(i + 2) * n_states + i] = 0.01;
        }
    }
    
    /* Initialize B as identity (control directly affects state) */
    memset(lqg->B, 0, n_states * n_ctrl * sizeof(double));
    uint32_t min_dim = (n_ctrl < n_states) ? n_ctrl : n_states;
    for (uint32_t i = 0; i < min_dim; i++) {
        lqg->B[i * n_ctrl + i] = 1.0;
    }
    
    /* Initialize C as identity (measure states directly) */
    memset(lqg->C, 0, n_meas * n_states * sizeof(double));
    min_dim = (n_meas < n_states) ? n_meas : n_states;
    for (uint32_t i = 0; i < min_dim; i++) {
        lqg->C[i * n_states + i] = 1.0;
    }
    
    /* Process noise covariance Q */
    memset(lqg->Q, 0, n_states * n_states * sizeof(double));
    for (uint32_t i = 0; i < n_states; i++) {
        /* Higher noise for higher-order modes (Kolmogorov spectrum) */
        double mode_noise = process_noise / (1.0 + 0.1 * (double)i);
        lqg->Q[i * n_states + i] = mode_noise * mode_noise;
    }
    
    /* Measurement noise covariance R */
    memset(lqg->R, 0, n_meas * n_meas * sizeof(double));
    for (uint32_t i = 0; i < n_meas; i++) {
        lqg->R[i * n_meas + i] = meas_noise * meas_noise;
    }
    
    /* Initialize error covariance P */
    memset(lqg->P, 0, n_states * n_states * sizeof(double));
    for (uint32_t i = 0; i < n_states; i++) {
        lqg->P[i * n_states + i] = 1.0; /* Initial uncertainty */
    }
    
    /* Compute initial Kalman gain */
    /* K = P * C^T * (C * P * C^T + R)^{-1} */
    /* For diagonal P, C = I: K = P * (P + R)^{-1} */
    for (uint32_t i = 0; i < n_states && i < n_meas; i++) {
        double denom = lqg->P[i * n_states + i] + lqg->R[i * n_meas + i];
        if (denom > DBL_EPSILON) {
            lqg->K[i * n_meas + i] = lqg->P[i * n_states + i] / denom;
        }
    }
    
    return 0;
}

/* Kalman prediction step */
int ao_lqg_predict(ao_lqg_state_t *lqg)
{
    if (!lqg || !lqg->x_hat || !lqg->A || !lqg->P) return -1;
    
    uint32_t n = lqg->n_states;
    double *x_pred = (double*)ao_malloc(n * sizeof(double));
    double *P_pred = (double*)ao_malloc(n * n * sizeof(double));
    double *AP = (double*)ao_malloc(n * n * sizeof(double));
    
    if (!x_pred || !P_pred || !AP) {
        ao_free(x_pred); ao_free(P_pred); ao_free(AP);
        return -1;
    }
    
    /* x_pred = A * x_hat */
    for (uint32_t i = 0; i < n; i++) {
        x_pred[i] = 0.0;
        for (uint32_t j = 0; j < n; j++) {
            x_pred[i] += lqg->A[i * n + j] * lqg->x_hat[j];
        }
    }
    
    /* P_pred = A * P * A^T + Q */
    /* First: AP = A * P */
    for (uint32_t i = 0; i < n; i++) {
        for (uint32_t j = 0; j < n; j++) {
            AP[i * n + j] = 0.0;
            for (uint32_t k = 0; k < n; k++) {
                AP[i * n + j] += lqg->A[i * n + k] * lqg->P[k * n + j];
            }
        }
    }
    
    /* P_pred = AP * A^T + Q */
    for (uint32_t i = 0; i < n; i++) {
        for (uint32_t j = 0; j < n; j++) {
            P_pred[i * n + j] = lqg->Q[i * n + j];
            for (uint32_t k = 0; k < n; k++) {
                P_pred[i * n + j] += AP[i * n + k] * lqg->A[j * n + k];
            }
        }
    }
    
    /* Copy predictions */
    memcpy(lqg->x_hat, x_pred, n * sizeof(double));
    memcpy(lqg->P, P_pred, n * n * sizeof(double));
    
    ao_free(x_pred); ao_free(P_pred); ao_free(AP);
    
    return 0;
}

/* Kalman update step */
int ao_lqg_update(ao_lqg_state_t *lqg, const double *measurement)
{
    if (!lqg || !lqg->x_hat || !lqg->P || !lqg->K || !lqg->C || !measurement) return -1;
    
    uint32_t n = lqg->n_states;
    uint32_t m = lqg->n_meas;
    
    /* Innovation: y - C * x_hat */
    double *innovation = (double*)ao_malloc(m * sizeof(double));
    if (!innovation) return -1;
    
    for (uint32_t i = 0; i < m; i++) {
        double Cx = 0.0;
        for (uint32_t j = 0; j < n; j++) {
            Cx += lqg->C[i * n + j] * lqg->x_hat[j];
        }
        innovation[i] = measurement[i] - Cx;
    }
    
    /* x_hat = x_hat + K * innovation */
    for (uint32_t i = 0; i < n; i++) {
        double Ki_y = 0.0;
        for (uint32_t j = 0; j < m; j++) {
            Ki_y += lqg->K[i * m + j] * innovation[j];
        }
        lqg->x_hat[i] += Ki_y;
    }
    
    /* Update P = (I - K * C) * P */
    /* Simplified: P = P - K * C * P */
    double *KCP = (double*)ao_malloc(n * n * sizeof(double));
    if (KCP) {
        for (uint32_t i = 0; i < n; i++) {
            for (uint32_t j = 0; j < n; j++) {
                KCP[i * n + j] = 0.0;
                for (uint32_t k = 0; k < m; k++) {
                    for (uint32_t l = 0; l < n; l++) {
                        KCP[i * n + j] += lqg->K[i * m + k] * lqg->C[k * n + l] * lqg->P[l * n + j];
                    }
                }
                lqg->P[i * n + j] -= KCP[i * n + j];
            }
        }
        ao_free(KCP);
    }
    
    ao_free(innovation);
    
    /* Adaptive gain: correlation-locking */
    ao_lqg_adaptive_gain(lqg, innovation, m);
    
    return 0;
}

/* Compute optimal control: u = -K_lqr * x_hat */
int ao_lqg_compute_control(const ao_lqg_state_t *lqg, double *control)
{
    if (!lqg || !lqg->x_hat || !control) return -1;
    
    /* Simplified LQR: proportional control with loop gain */
    for (uint32_t i = 0; i < lqg->n_ctrl && i < lqg->n_states; i++) {
        control[i] = -lqg->loop_gain * lqg->x_hat[i];
    }
    
    return 0;
}

/* Correlation-locking adaptive gain */
int ao_lqg_adaptive_gain(ao_lqg_state_t *lqg,
                         const double *residuals,
                         uint32_t n_residuals)
{
    if (!lqg || !residuals || n_residuals == 0) return -1;
    
    /* Compute residual correlation */
    double correlation = 0.0;
    double var = 0.0;
    
    for (uint32_t i = 1; i < n_residuals; i++) {
        correlation += residuals[i] * residuals[i - 1];
        var += residuals[i] * residuals[i];
    }
    
    if (var > DBL_EPSILON) {
        double rho = correlation / var;
        
        /* If residuals are correlated (|rho| > 0.1), increase adaptation */
        if (fabs(rho) > 0.1) {
            lqg->correlation_lock = 1.0 + 0.5 * fabs(rho);
            lqg->loop_gain *= lqg->correlation_lock;
            
            /* Limit gain */
            if (lqg->loop_gain > 2.0) lqg->loop_gain = 2.0;
        } else {
            /* Decrease slowly back to 1.0 */
            lqg->correlation_lock = 0.95 * lqg->correlation_lock + 0.05 * 1.0;
            lqg->loop_gain = 0.95 * lqg->loop_gain + 0.05 * 1.0;
        }
    }
    
    return 0;
}

/* Build turbulence AR1 state-space model */
int ao_build_turbulence_model(double r0, double tau0, double sample_time,
                              uint32_t n_modes,
                              double *A_state, double *Q_process)
{
    if (!A_state || !Q_process || tau0 <= 0) return -1;
    
    /* AR1 coefficient: a = exp(-dt / tau0) */
    double a = exp(-sample_time / tau0);
    
    /* Process noise variance: sigma^2 = (1 - a^2) * (D/r0)^(5/3) * C_k */
    double D_over_r0 = 1.0 / r0; /* Normalized */
    double kolmogorov_power = pow(D_over_r0, 5.0 / 3.0);
    
    memset(A_state, 0, n_modes * n_modes * sizeof(double));
    memset(Q_process, 0, n_modes * n_modes * sizeof(double));
    
    for (uint32_t i = 0; i < n_modes; i++) {
        A_state[i * n_modes + i] = a;
        
        /* Kolmogorov spectrum for mode variances */
        double C_k = 1.0 / (1.0 + 0.5 * (double)i);
        double mode_variance = (1.0 - a * a) * kolmogorov_power * C_k;
        Q_process[i * n_modes + i] = mode_variance;
    }
    
    return 0;
}

void ao_lqg_free(ao_lqg_state_t *lqg)
{
    if (!lqg) return;
    
    ao_free(lqg->x_hat);
    ao_free(lqg->P);
    ao_free(lqg->K);
    ao_free(lqg->A);
    ao_free(lqg->B);
    ao_free(lqg->C);
    ao_free(lqg->Q);
    ao_free(lqg->R);
    
    lqg->x_hat = NULL;
    lqg->P = NULL;
    lqg->K = NULL;
    lqg->A = NULL;
    lqg->B = NULL;
    lqg->C = NULL;
    lqg->Q = NULL;
    lqg->R = NULL;
    lqg->n_states = 0;
    lqg->n_meas = 0;
    lqg->n_ctrl = 0;
}
