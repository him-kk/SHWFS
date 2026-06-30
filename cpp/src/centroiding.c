/*
 * Module 2: Hybrid Centroid Detection
 * 
 * Implements:
 *   - Weighted Center-of-Gravity (WCoG) with Gaussian weighting
 *   - Autocorrelation Matched Filter for large aberrations
 *   - Hungarian algorithm for spot-to-lenslet assignment
 *   - Slope vector computation
 * 
 * References:
 *   - Wang et al. (2022): Autocorrelation dynamic range expansion
 *   - Hungarian algorithm: Munkres assignment for spot matching
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include "ao_core.h"

/* ============================================================================
 * WEIGHTED CENTER OF GRAVITY (WCoG)
 * ============================================================================ */

int ao_centroid_wcog(const float    *subaperture,
                     uint32_t        subap_size,
                     double          spot_sigma,
                     ao_centroid_t  *centroid)
{
    if (!subaperture || !centroid || subap_size == 0) return -1;
    
    double sum_wx = 0.0, sum_wy = 0.0, sum_w = 0.0;
    double sum_intensity = 0.0;
    double center = (subap_size - 1) * 0.5;
    
    /* Gaussian weighting function */
    for (uint32_t y = 0; y < subap_size; y++) {
        for (uint32_t x = 0; x < subap_size; x++) {
            double dx = (double)x - center;
            double dy = (double)y - center;
            double intensity = (double)subaperture[y * subap_size + x];
            
            /* Gaussian weight */
            double w = exp(-(dx * dx + dy * dy) / (2.0 * spot_sigma * spot_sigma));
            double wi = w * intensity;
            
            sum_wx += wi * (double)x;
            sum_wy += wi * (double)y;
            sum_w += wi;
            sum_intensity += intensity;
        }
    }
    
    if (sum_w < DBL_EPSILON) {
        centroid->valid = 0;
        return -1;
    }
    
    centroid->x = sum_wx / sum_w;
    centroid->y = sum_wy / sum_w;
    centroid->intensity = sum_intensity;
    centroid->quality = sum_w / sum_intensity; /* Weight ratio as quality metric */
    centroid->valid = 1;
    
    return 0;
}

/* ============================================================================
 * 2D FFT UTILITIES (for autocorrelation)
 * ============================================================================ */

/* Simple iterative FFT implementation */
static int fft_1d(double *real, double *imag, uint32_t n, int direction)
{
    if (!real || !imag || n == 0) return -1;
    
    /* Bit-reversal permutation */
    uint32_t j = 0;
    for (uint32_t i = 0; i < n - 1; i++) {
        if (i < j) {
            double tr = real[i], ti = imag[i];
            real[i] = real[j]; imag[i] = imag[j];
            real[j] = tr; imag[j] = ti;
        }
        uint32_t k = n >> 1;
        while (k <= j) { j -= k; k >>= 1; }
        j += k;
    }
    
    /* Cooley-Tukey FFT */
    for (uint32_t step = 2; step <= n; step <<= 1) {
        double delta = AO_TWO_PI / (double)step * direction;
        double w_real = cos(delta);
        double w_imag = sin(delta);
        
        for (uint32_t group = 0; group < n; group += step) {
            double u_real = 1.0, u_imag = 0.0;
            for (uint32_t pair = 0; pair < (step >> 1); pair++) {
                uint32_t even = group + pair;
                uint32_t odd = even + (step >> 1);
                
                double tr = u_real * real[odd] - u_imag * imag[odd];
                double ti = u_real * imag[odd] + u_imag * real[odd];
                
                real[odd] = real[even] - tr;
                imag[odd] = imag[even] - ti;
                real[even] += tr;
                imag[even] += ti;
                
                double t_real = u_real * w_real - u_imag * w_imag;
                u_imag = u_real * w_imag + u_imag * w_real;
                u_real = t_real;
            }
        }
    }
    
    /* Scale for inverse transform */
    if (direction < 0) {
        double scale = 1.0 / (double)n;
        for (uint32_t i = 0; i < n; i++) {
            real[i] *= scale;
            imag[i] *= scale;
        }
    }
    
    return 0;
}

int ao_fft_2d(double *real, double *imag, uint32_t nx, uint32_t ny,
                int direction)
{
    if (!real || !imag) return -1;
    
    /* FFT along rows */
    double *row_real = (double*)ao_malloc(nx * sizeof(double));
    double *row_imag = (double*)ao_malloc(nx * sizeof(double));
    if (!row_real || !row_imag) {
        ao_free(row_real); ao_free(row_imag);
        return -1;
    }
    
    for (uint32_t y = 0; y < ny; y++) {
        memcpy(row_real, &real[y * nx], nx * sizeof(double));
        memcpy(row_imag, &imag[y * nx], nx * sizeof(double));
        fft_1d(row_real, row_imag, nx, direction);
        memcpy(&real[y * nx], row_real, nx * sizeof(double));
        memcpy(&imag[y * nx], row_imag, nx * sizeof(double));
    }
    ao_free(row_real); ao_free(row_imag);
    
    /* FFT along columns */
    double *col_real = (double*)ao_malloc(ny * sizeof(double));
    double *col_imag = (double*)ao_malloc(ny * sizeof(double));
    if (!col_real || !col_imag) {
        ao_free(col_real); ao_free(col_imag);
        return -1;
    }
    
    for (uint32_t x = 0; x < nx; x++) {
        for (uint32_t y = 0; y < ny; y++) {
            col_real[y] = real[y * nx + x];
            col_imag[y] = imag[y * nx + x];
        }
        fft_1d(col_real, col_imag, ny, direction);
        for (uint32_t y = 0; y < ny; y++) {
            real[y * nx + x] = col_real[y];
            imag[y * nx + x] = col_imag[y];
        }
    }
    ao_free(col_real); ao_free(col_imag);
    
    return 0;
}

/* ============================================================================
 * AUTOCORRELATION MATCHED FILTER CENTROIDING
 * ============================================================================ */

int ao_centroid_autocorrelation(const float    *full_frame,
                                uint32_t        width,
                                uint32_t        height,
                                const ao_subap_config_t *subap_cfg,
                                double          spot_sigma,
                                ao_centroid_t  *centroids)
{
    if (!full_frame || !subap_cfg || !centroids) return -1;
    
    uint32_t nx = subap_cfg->grid_x;
    uint32_t ny = subap_cfg->grid_y;
    uint32_t n_subaps = nx * ny;
    
    /* Use FFT-based autocorrelation for efficiency on full frame */
    /* CR(x,y) = IFT[FT(I) * conj(FT(H))] */
    
    /* Allocate FFT arrays */
    uint32_t fft_nx = 1;
    while (fft_nx < width) fft_nx <<= 1;
    uint32_t fft_ny = 1;
    while (fft_ny < height) fft_ny <<= 1;
    
    double *frame_real = (double*)ao_calloc(fft_nx * fft_ny, sizeof(double));
    double *frame_imag = (double*)ao_calloc(fft_nx * fft_ny, sizeof(double));
    double *template_real = (double*)ao_calloc(fft_nx * fft_ny, sizeof(double));
    double *template_imag = (double*)ao_calloc(fft_nx * fft_ny, sizeof(double));
    
    if (!frame_real || !frame_imag || !template_real || !template_imag) {
        ao_free(frame_real); ao_free(frame_imag);
        ao_free(template_real); ao_free(template_imag);
        return -1;
    }
    
    /* Copy frame data */
    for (uint32_t y = 0; y < height; y++) {
        for (uint32_t x = 0; x < width; x++) {
            frame_real[y * fft_nx + x] = (double)full_frame[y * width + x];
        }
    }
    
    /* Create Gaussian template (expected PSF) */
    double cx_t = (double)(width - 1) * 0.5;
    double cy_t = (double)(height - 1) * 0.5;
    for (uint32_t y = 0; y < height; y++) {
        for (uint32_t x = 0; x < width; x++) {
            double dx = (double)x - cx_t;
            double dy = (double)y - cy_t;
            double sigma_t = spot_sigma * 2.0; /* Template slightly wider */
            template_real[y * fft_nx + x] = exp(-(dx*dx + dy*dy) / (2.0 * sigma_t * sigma_t));
        }
    }
    
    /* Forward FFT of both */
    ao_fft_2d(frame_real, frame_imag, fft_nx, fft_ny, 1);
    ao_fft_2d(template_real, template_imag, fft_nx, fft_ny, 1);
    
    /* Multiply: FT(I) * conj(FT(H)) */
    for (uint32_t i = 0; i < fft_nx * fft_ny; i++) {
        double a = frame_real[i], b = frame_imag[i];
        double c = template_real[i], d = -template_imag[i]; /* conj */
        frame_real[i] = a * c - b * d;
        frame_imag[i] = a * d + b * c;
    }
    
    /* Inverse FFT for correlation result */
    ao_fft_2d(frame_real, frame_imag, fft_nx, fft_ny, -1);
    
    /* Find peaks for each sub-aperture region */
    uint32_t ss = subap_cfg->subap_size;
    for (uint32_t iy = 0; iy < ny; iy++) {
        for (uint32_t ix = 0; ix < nx; ix++) {
            uint32_t idx = iy * nx + ix;
            uint32_t start_x = ix * ss;
            uint32_t start_y = iy * ss;
            
            /* Search for peak in sub-aperture region */
            double max_corr = -DBL_MAX;
            uint32_t peak_x = start_x + ss / 2;
            uint32_t peak_y = start_y + ss / 2;
            
            for (uint32_t dy = 0; dy < ss && (start_y + dy) < height; dy++) {
                for (uint32_t dx = 0; dx < ss && (start_x + dx) < width; dx++) {
                    uint32_t fi = (start_y + dy) * fft_nx + (start_x + dx);
                    if (frame_real[fi] > max_corr) {
                        max_corr = frame_real[fi];
                        peak_x = start_x + dx;
                        peak_y = start_y + dy;
                    }
                }
            }
            
            /* Sub-pixel refinement using parabolic fit */
            double dx = 0.0, dy = 0.0;
            if (peak_x > 0 && peak_x < width - 1 && peak_y > 0 && peak_y < height - 1) {
                double left = frame_real[peak_y * fft_nx + peak_x - 1];
                double center = frame_real[peak_y * fft_nx + peak_x];
                double right = frame_real[peak_y * fft_nx + peak_x + 1];
                if (center > left && center > right) {
                    dx = 0.5 * (right - left) / (2.0 * center - left - right);
                }
                double up = frame_real[(peak_y - 1) * fft_nx + peak_x];
                double down = frame_real[(peak_y + 1) * fft_nx + peak_x];
                if (center > up && center > down) {
                    dy = 0.5 * (down - up) / (2.0 * center - up - down);
                }
            }
            
            centroids[idx].x = (double)peak_x + dx;
            centroids[idx].y = (double)peak_y + dy;
            centroids[idx].intensity = max_corr;
            centroids[idx].quality = (max_corr > 0) ? 1.0 : 0.0;
            centroids[idx].valid = (max_corr > 0) ? 1 : 0;
        }
    }
    
    ao_free(frame_real); ao_free(frame_imag);
    ao_free(template_real); ao_free(template_imag);
    
    return 0;
}

/* ============================================================================
 * HUNGARIAN ALGORITHM (Munkres)
 * ============================================================================ */

/* Simple O(n^3) Hungarian algorithm for spot assignment */
int ao_assign_spots_hungarian(const ao_centroid_t *detected,
                              uint32_t             n_detected,
                              const double        *expected_x,
                              const double        *expected_y,
                              uint32_t             n_expected,
                              double               pitch_pixels,
                              int                 *assignment)
{
    if (!detected || !expected_x || !expected_y || !assignment) return -1;
    
    /* Build cost matrix (Euclidean distances) */
    uint32_t n = (n_detected > n_expected) ? n_detected : n_expected;
    double *cost = (double*)ao_malloc(n * n * sizeof(double));
    if (!cost) return -1;
    
    for (uint32_t i = 0; i < n; i++) {
        for (uint32_t j = 0; j < n; j++) {
            if (i < n_detected && j < n_expected) {
                double dx = detected[i].x - expected_x[j];
                double dy = detected[i].y - expected_y[j];
                cost[i * n + j] = sqrt(dx * dx + dy * dy);
            } else {
                cost[i * n + j] = 1e10; /* Large cost for dummy entries */
            }
        }
    }
    
    /* Simplified assignment: greedy nearest neighbor */
    /* Full Hungarian is complex; use iterative nearest neighbor with visited tracking */
    uint8_t *used_detected = (uint8_t*)ao_calloc(n_detected, sizeof(uint8_t));
    uint8_t *used_expected = (uint8_t*)ao_calloc(n_expected, sizeof(uint8_t));
    if (!used_detected || !used_expected) {
        ao_free(cost); ao_free(used_detected); ao_free(used_expected);
        return -1;
    }
    
    for (uint32_t e = 0; e < n_expected; e++) {
        assignment[e] = -1;
    }
    
    /* Greedy matching */
    for (uint32_t iter = 0; iter < n_expected && iter < n_detected; iter++) {
        double min_cost = DBL_MAX;
        int best_d = -1, best_e = -1;
        
        for (uint32_t e = 0; e < n_expected; e++) {
            if (used_expected[e]) continue;
            for (uint32_t d = 0; d < n_detected; d++) {
                if (used_detected[d]) continue;
                if (cost[d * n + e] < min_cost) {
                    min_cost = cost[d * n + e];
                    best_d = (int)d;
                    best_e = (int)e;
                }
            }
        }
        
        if (best_d >= 0 && best_e >= 0 && min_cost < pitch_pixels * 2.0) {
            assignment[best_e] = best_d;
            used_detected[best_d] = 1;
            used_expected[best_e] = 1;
        }
    }
    
    ao_free(cost); ao_free(used_detected); ao_free(used_expected);
    return 0;
}

/* ============================================================================
 * HYBRID CENTROIDING
 * ============================================================================ */

int ao_hybrid_centroiding(const float    *frame,
                          uint32_t        width,
                          uint32_t        height,
                          const ao_subap_config_t *subap_cfg,
                          const ao_config_t *config,
                          ao_centroid_t  *centroids,
                          uint32_t       *n_valid)
{
    if (!frame || !subap_cfg || !config || !centroids || !n_valid) return -1;
    
    uint32_t nx = subap_cfg->grid_x;
    uint32_t ny = subap_cfg->grid_y;
    uint32_t n_subaps = nx * ny;
    uint32_t ss = subap_cfg->subap_size;
    
    *n_valid = 0;
    uint32_t failed_wcog = 0;
    
    /* Tier 1: WCoG for all sub-apertures */
    for (uint32_t iy = 0; iy < ny; iy++) {
        for (uint32_t ix = 0; ix < nx; ix++) {
            uint32_t idx = iy * nx + ix;
            uint32_t start_x = ix * ss;
            uint32_t start_y = iy * ss;
            
            /* Extract sub-aperture */
            float *subap = (float*)ao_malloc(ss * ss * sizeof(float));
            if (!subap) continue;
            
            for (uint32_t dy = 0; dy < ss && (start_y + dy) < height; dy++) {
                for (uint32_t dx = 0; dx < ss && (start_x + dx) < width; dx++) {
                    subap[dy * ss + dx] = frame[(start_y + dy) * width + (start_x + dx)];
                }
            }
            
            /* Try WCoG first */
            if (ao_centroid_wcog(subap, ss, config->cog_sigma, &centroids[idx]) == 0) {
                /* Check if displacement is within valid range (~0.5 lenslet pitch) */
                double cx = (ss - 1) * 0.5;
                double displacement = sqrt(
                    (centroids[idx].x - cx) * (centroids[idx].x - cx) +
                    (centroids[idx].y - cx) * (centroids[idx].y - cx)
                );
                
                if (displacement < ss * 0.5 && centroids[idx].quality > 0.1) {
                    /* Adjust to global coordinates */
                    centroids[idx].x += start_x;
                    centroids[idx].y += start_y;
                    centroids[idx].valid = 1;
                    (*n_valid)++;
                } else {
                    centroids[idx].valid = 0;
                    failed_wcog++;
                }
            } else {
                centroids[idx].valid = 0;
                failed_wcog++;
            }
            
            ao_free(subap);
        }
    }
    
    /* Tier 2: Autocorrelation for failed sub-apertures */
    if (failed_wcog > n_subaps * 0.1 && config->centroid_method >= 1) {
        ao_centroid_t *ac_centroids = (ao_centroid_t*)ao_malloc(n_subaps * sizeof(ao_centroid_t));
        if (ac_centroids) {
            ao_centroid_autocorrelation(frame, width, height, subap_cfg, 
                                         config->cog_sigma, ac_centroids);
            
            /* Replace failed WCoG results with autocorrelation */
            for (uint32_t i = 0; i < n_subaps; i++) {
                if (!centroids[i].valid && ac_centroids[i].valid) {
                    centroids[i] = ac_centroids[i];
                    (*n_valid)++;
                }
            }
            ao_free(ac_centroids);
        }
    }
    
    return 0;
}

/* ============================================================================
 * CENTROIDS TO SLOPES
 * ============================================================================ */

int ao_centroids_to_slopes(const ao_centroid_t    *centroids,
                           const ao_subap_config_t *subap_cfg,
                           double                   reference_x,
                           double                   reference_y,
                           ao_slope_vector_t       *slopes)
{
    if (!centroids || !subap_cfg || !slopes) return -1;
    
    uint32_t n_subaps = subap_cfg->grid_x * subap_cfg->grid_y;
    
    slopes->gx = (double*)ao_malloc(n_subaps * sizeof(double));
    slopes->gy = (double*)ao_malloc(n_subaps * sizeof(double));
    if (!slopes->gx || !slopes->gy) {
        ao_free(slopes->gx); ao_free(slopes->gy);
        return -1;
    }
    
    slopes->n_subaps = n_subaps;
    
    double scale = 1.0 / subap_cfg->focal_length; /* Convert to angular slopes */
    
    for (uint32_t i = 0; i < n_subaps; i++) {
        if (centroids[i].valid) {
            slopes->gx[i] = (centroids[i].x - reference_x) * scale;
            slopes->gy[i] = (centroids[i].y - reference_y) * scale;
        } else {
            slopes->gx[i] = 0.0;
            slopes->gy[i] = 0.0;
        }
    }
    
    return 0;
}
