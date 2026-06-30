/*
 * Module 4: Turbulence Characterization
 * 
 * Implements:
 *   - r0 estimation from Zernike coefficient variance
 *   - r0 estimation from phase structure function
 *   - tau0 estimation from temporal autocorrelation
 *   - Layer-resolved tau0 (ground + high altitude)
 * 
 * References:
 *   - Noll (1976): Zernike variances for Kolmogorov turbulence
 *   - Fried (1966): r0 definition and structure function
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include "ao_core.h"

/* ============================================================================
 * R0 ESTIMATION FROM ZERNIKE VARIANCE
 * ============================================================================ */

int ao_estimate_r0_zernike(const ao_zernike_t      *zernike_history,
                           uint32_t                 n_frames,
                           double                   telescope_d,
                           double                  *r0)
{
    if (!zernike_history || !r0 || n_frames == 0) return -1;
    
    uint32_t n_modes = zernike_history[0].n_modes;
    
    /* Coefficients for Noll-ordered Zernike modes (from Noll 1976) */
    double C_noll[] = {
        0.0,          /* Piston */
        1.030, 1.030, /* Tip, tilt */
        0.582,        /* Defocus */
        0.134, 0.134, /* Astigmatism */
        0.065, 0.065, /* Coma */
        0.064,        /* Spherical */
        0.039, 0.039, /* Trefoil */
        0.025, 0.025, /* Secondary astigmatism */
        0.021, 0.021, /* Secondary coma */
        0.014,        /* Secondary spherical */
        0.012, 0.012, /* Tetrafoil */
    };
    uint32_t n_coeffs = sizeof(C_noll) / sizeof(C_noll[0]);
    
    /* Use modes 2-15 (exclude piston, focus on low-order) */
    uint32_t first_mode = 2;  /* Skip piston */
    uint32_t last_mode = (n_modes < 16) ? n_modes : 16;
    
    /* Compute variance for each mode across frames */
    double *variance = (double*)ao_malloc(n_modes * sizeof(double));
    double *mean = (double*)ao_malloc(n_modes * sizeof(double));
    if (!variance || !mean) {
        ao_free(variance); ao_free(mean);
        return -1;
    }
    
    memset(mean, 0, n_modes * sizeof(double));
    memset(variance, 0, n_modes * sizeof(double));
    
    /* Compute means */
    for (uint32_t frame = 0; frame < n_frames; frame++) {
        for (uint32_t mode = first_mode; mode < last_mode; mode++) {
            mean[mode] += zernike_history[frame].coeffs[mode];
        }
    }
    for (uint32_t mode = first_mode; mode < last_mode; mode++) {
        mean[mode] /= n_frames;
    }
    
    /* Compute variances */
    for (uint32_t frame = 0; frame < n_frames; frame++) {
        for (uint32_t mode = first_mode; mode < last_mode; mode++) {
            double diff = zernike_history[frame].coeffs[mode] - mean[mode];
            variance[mode] += diff * diff;
        }
    }
    for (uint32_t mode = first_mode; mode < last_mode; mode++) {
        variance[mode] /= (n_frames - 1);
    }
    
    /* Weighted least-squares fit: log(sigma^2) = log(C_k) + (5/3)*log(D/r0) */
    double sum_w = 0.0, sum_wx = 0.0, sum_wy = 0.0, sum_wxy = 0.0, sum_wx2 = 0.0;
    
    for (uint32_t mode = first_mode; mode < last_mode; mode++) {
        double C_k = (mode < n_coeffs) ? C_noll[mode] : 0.001 * pow((double)mode, -5.0/3.0);
        
        if (C_k < DBL_EPSILON || variance[mode] < DBL_EPSILON) continue;
        
        double log_var = log(variance[mode]);
        double log_C = log(C_k);
        
        /* Weight by SNR (higher for low-order modes) */
        double weight = sqrt(C_k);
        
        sum_w += weight;
        sum_wx += weight * log_C;
        sum_wy += weight * log_var;
        sum_wxy += weight * log_C * log_var;
        sum_wx2 += weight * log_C * log_C;
    }
    
    if (sum_w < DBL_EPSILON) {
        ao_free(variance); ao_free(mean);
        return -1;
    }
    
    /* Slope = 5/3, intercept gives r0 */
    double slope = (sum_w * sum_wxy - sum_wx * sum_wy) / 
                   (sum_w * sum_wx2 - sum_wx * sum_wx);
    
    if (fabs(slope) < DBL_EPSILON) {
        ao_free(variance); ao_free(mean);
        return -1;
    }
    
    /* slope = 5/3 => (D/r0)^(5/3) scaling */
    /* From fit: log(variance) = log(C_k) + (5/3)*log(D/r0) */
    /* We extract: (5/3)*log(D/r0) from the offset */
    double intercept = (sum_wy - slope * sum_wx) / sum_w;
    
    /* Average across modes: variance ≈ C_k * (D/r0)^(5/3) */
    double avg_D_over_r0 = 0.0;
    uint32_t count = 0;
    
    for (uint32_t mode = first_mode; mode < last_mode; mode++) {
        double C_k = (mode < n_coeffs) ? C_noll[mode] : 0.001 * pow((double)mode, -5.0/3.0);
        
        if (C_k > DBL_EPSILON && variance[mode] > DBL_EPSILON) {
            double D_over_r0 = pow(variance[mode] / C_k, 3.0 / 5.0);
            avg_D_over_r0 += D_over_r0;
            count++;
        }
    }
    
    if (count > 0) {
        avg_D_over_r0 /= count;
        *r0 = telescope_d / avg_D_over_r0;
    } else {
        *r0 = 0.1; /* Default to 10 cm */
    }
    
    /* Sanity check */
    if (*r0 < 0.01) *r0 = 0.01;  /* Min 1 cm */
    if (*r0 > 2.0) *r0 = 2.0;    /* Max 2 m */
    
    ao_free(variance); ao_free(mean);
    return 0;
}

/* ============================================================================
 * R0 ESTIMATION FROM PHASE STRUCTURE FUNCTION
 * ============================================================================ */

int ao_estimate_r0_structure_function(const ao_wavefront_t *wavefronts,
                                      uint32_t              n_frames,
                                      double               *r0)
{
    if (!wavefronts || !r0 || n_frames == 0) return -1;
    
    uint32_t nx = wavefronts[0].n_x;
    uint32_t ny = wavefronts[0].n_y;
    
    /* Compute structure function at various separations */
    uint32_t max_sep = (nx < ny) ? nx / 2 : ny / 2;
    max_sep = (max_sep > 50) ? 50 : max_sep;
    
    double *D_avg = (double*)ao_malloc(max_sep * sizeof(double));
    uint32_t *counts = (uint32_t*)ao_malloc(max_sep * sizeof(uint32_t));
    if (!D_avg || !counts) {
        ao_free(D_avg); ao_free(counts);
        return -1;
    }
    
    memset(D_avg, 0, max_sep * sizeof(double));
    memset(counts, 0, max_sep * sizeof(uint32_t));
    
    /* Average structure function across frames */
    for (uint32_t frame = 0; frame < n_frames; frame++) {
        const double *phase = wavefronts[frame].phase;
        
        for (uint32_t sep = 1; sep < max_sep; sep++) {
            /* Horizontal separations */
            for (uint32_t y = 0; y < ny; y++) {
                for (uint32_t x = 0; x + sep < nx; x++) {
                    double diff = phase[y * nx + (x + sep)] - phase[y * nx + x];
                    D_avg[sep] += diff * diff;
                    counts[sep]++;
                }
            }
            
            /* Vertical separations */
            for (uint32_t y = 0; y + sep < ny; y++) {
                for (uint32_t x = 0; x < nx; x++) {
                    double diff = phase[(y + sep) * nx + x] - phase[y * nx + x];
                    D_avg[sep] += diff * diff;
                    counts[sep]++;
                }
            }
        }
    }
    
    /* Average */
    for (uint32_t sep = 1; sep < max_sep; sep++) {
        if (counts[sep] > 0) {
            D_avg[sep] /= counts[sep];
        }
    }
    
    /* Fit power law: D(r) = 6.88 * (r/r0)^(5/3) */
    /* In log-log: log(D) = log(6.88) + (5/3)*log(r) - (5/3)*log(r0) */
    double sum_x = 0.0, sum_y = 0.0, sum_xy = 0.0, sum_x2 = 0.0;
    uint32_t n_points = 0;
    
    for (uint32_t sep = 1; sep < max_sep / 2; sep++) {
        if (D_avg[sep] > DBL_EPSILON) {
            double log_r = log((double)sep);
            double log_D = log(D_avg[sep]);
            
            sum_x += log_r;
            sum_y += log_D;
            sum_xy += log_r * log_D;
            sum_x2 += log_r * log_r;
            n_points++;
        }
    }
    
    if (n_points < 2) {
        ao_free(D_avg); ao_free(counts);
        return -1;
    }
    
    double slope = (n_points * sum_xy - sum_x * sum_y) / 
                   (n_points * sum_x2 - sum_x * sum_x);
    
    /* Expected slope: 5/3 */
    double intercept = (sum_y - slope * sum_x) / n_points;
    
    /* intercept = log(6.88) - (5/3)*log(r0) */
    /* log(r0) = (log(6.88) - intercept) / (5/3) */
    double log_r0 = (log(6.88) - intercept) / slope;
    *r0 = exp(log_r0);
    
    /* Sanity check */
    if (*r0 < 0.01) *r0 = 0.01;
    if (*r0 > 2.0) *r0 = 2.0;
    
    ao_free(D_avg); ao_free(counts);
    return 0;
}

/* ============================================================================
 * TAU0 ESTIMATION
 * ============================================================================ */

int ao_estimate_tau0_autocorrelation(const double *coeff_time_series,
                                     uint32_t      n_samples,
                                     double        sample_interval,
                                     double       *tau0)
{
    if (!coeff_time_series || !tau0 || n_samples < 10) return -1;
    
    uint32_t max_lag = n_samples / 4;
    if (max_lag < 2) max_lag = 2;
    
    double *acf = (double*)ao_malloc(max_lag * sizeof(double));
    if (!acf) return -1;
    
    ao_compute_autocorrelation(coeff_time_series, n_samples, max_lag, acf);
    
    /* Find decorrelation time where ACF = 1/e */
    double target = 1.0 / M_E;
    uint32_t decorrelation_samples = max_lag;
    
    for (uint32_t lag = 0; lag < max_lag; lag++) {
        if (acf[lag] <= target) {
            decorrelation_samples = lag;
            break;
        }
    }
    
    /* tau0 is the decorrelation time */
    *tau0 = (double)decorrelation_samples * sample_interval;
    
    /* Sanity check */
    if (*tau0 < 0.001) *tau0 = 0.001;
    if (*tau0 > 1.0) *tau0 = 1.0;
    
    ao_free(acf);
    return 0;
}

/* ============================================================================
 * LAYER-RESOLVED TAU0 ESTIMATION
 * ============================================================================ */

int ao_estimate_tau0_layers(const double *tt_coeffs,    /* Tip/tilt (2 x n_samples) */
                            const double *ho_coeffs,    /* High-order modes */
                            uint32_t      n_samples,
                            double        sample_interval,
                            double       *tau0_ground,
                            double       *tau0_high)
{
    if (!tt_coeffs || !ho_coeffs || !tau0_ground || !tau0_high || n_samples < 10) return -1;
    
    /* Tip/tilt dominated by high-altitude layers (fast wind) */
    double tt_combined = (tt_coeffs[0] + tt_coeffs[1]) * 0.5;
    ao_estimate_tau0_autocorrelation(&tt_combined, n_samples / 2, 
                                      sample_interval, tau0_high);
    
    /* High-order modes dominated by ground layer (slow wind) */
    ao_estimate_tau0_autocorrelation(ho_coeffs, n_samples,
                                      sample_interval, tau0_ground);
    
    /* Sanity checks */
    if (*tau0_ground < 0.001) *tau0_ground = 0.001;
    if (*tau0_ground > 1.0) *tau0_ground = 1.0;
    if (*tau0_high < 0.001) *tau0_high = 0.001;
    if (*tau0_high > 1.0) *tau0_high = 1.0;
    
    return 0;
}

/* ============================================================================
 * COMPLETE TURBULENCE CHARACTERIZATION
 * ============================================================================ */

int ao_characterize_turbulence(const ao_zernike_t      *zernike_series,
                               const ao_wavefront_t    *wavefront_series,
                               uint32_t                 n_frames,
                               double                   sample_interval,
                               double                   telescope_d,
                               ao_turbulence_params_t  *params)
{
    if (!zernike_series || !params || n_frames == 0) return -1;
    
    memset(params, 0, sizeof(ao_turbulence_params_t));
    
    /* Estimate r0 from Zernike variance */
    double r0_zernike = 0.0;
    ao_estimate_r0_zernike(zernike_series, n_frames, telescope_d, &r0_zernike);
    
    /* Estimate r0 from structure function */
    double r0_struct = 0.0;
    if (wavefront_series) {
        ao_estimate_r0_structure_function(wavefront_series, n_frames, &r0_struct);
    }
    
    /* Average the two estimates */
    if (r0_zernike > 0 && r0_struct > 0) {
        /* Check agreement within 10% */
        double diff = fabs(r0_zernike - r0_struct) / ((r0_zernike + r0_struct) * 0.5);
        if (diff > 0.5) {
            /* Discrepancy indicates non-Kolmogorov turbulence */
            /* Use Zernike estimate as primary */
            params->r0 = r0_zernike;
        } else {
            params->r0 = (r0_zernike + r0_struct) * 0.5;
        }
    } else if (r0_zernike > 0) {
        params->r0 = r0_zernike;
    } else if (r0_struct > 0) {
        params->r0 = r0_struct;
    } else {
        params->r0 = 0.15; /* Default: 15 cm */
    }
    
    /* Estimate tau0 from first Zernike mode time series */
    double *mode_series = (double*)ao_malloc(n_frames * sizeof(double));
    if (mode_series) {
        for (uint32_t i = 0; i < n_frames; i++) {
            mode_series[i] = zernike_series[i].coeffs[2]; /* Tip mode */
        }
        
        ao_estimate_tau0_autocorrelation(mode_series, n_frames, 
                                          sample_interval, &params->tau0);
        ao_free(mode_series);
    } else {
        params->tau0 = 0.01; /* Default: 10 ms */
    }
    
    /* Compute derived parameters */
    /* FWHM seeing = 0.98 * lambda / r0 [arcsec] */
    double lambda = 0.55e-6; /* 550 nm default */
    params->fwhm_seeing = 0.98 * lambda / params->r0 * (180.0 / AO_PI) * 3600.0;
    
    /* Cn2 from r0: r0 = (0.422 * k^2 * Cn2 * L)^(-3/5) */
    /* Simplified: Cn2 ≈ r0^(-5/3) * scaling */
    params->cn2 = pow(params->r0, -5.0 / 3.0) * 1e-16;
    
    /* Isoplanatic angle: theta0 = 0.314 * r0 / H, H ~ 8000m (mean turbulence height) */
    double H_mean = 8000.0;
    params->theta0 = 0.314 * params->r0 / H_mean * (180.0 / AO_PI) * 3600.0;
    
    /* Estimate wind speed from tau0 and r0: v = r0 / tau0 */
    if (params->tau0 > 0) {
        params->wind_speed = params->r0 / params->tau0;
    } else {
        params->wind_speed = 10.0; /* Default 10 m/s */
    }
    
    return 0;
}
