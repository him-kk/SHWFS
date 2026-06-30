/*
 * Module 1: Preprocessing
 * 
 * Implements:
 *   - Dark frame subtraction
 *   - Flat field correction
 *   - Bad pixel masking (3x3 median filter)
 *   - Photon noise estimation
 *   - Adaptive thresholding per sub-aperture
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include "ao_core.h"

/* ============================================================================
 * FRAME PREPROCESSING
 * ============================================================================ */

int ao_preprocess_frame(const uint16_t *raw_frame,
                        const uint16_t *dark_frame,
                        const float    *flat_frame,
                        const ao_frame_metadata_t *meta,
                        float          *output_frame)
{
    if (!raw_frame || !output_frame || !meta) return -1;
    
    uint32_t width = meta->width;
    uint32_t height = meta->height;
    uint32_t npixels = width * height;
    
    for (uint32_t i = 0; i < npixels; i++) {
        /* Step 1: Dark frame subtraction */
        double corrected = (double)raw_frame[i];
        if (dark_frame) {
            corrected -= (double)dark_frame[i];
        }
        
        /* Ensure non-negative */
        if (corrected < 0.0) corrected = 0.0;
        
        /* Step 2: Flat field correction */
        if (flat_frame && flat_frame[i] > 0.0) {
            corrected /= (double)flat_frame[i];
        }
        
        /* Step 3: Convert to photons if gain available */
        if (meta->gain > 0.0) {
            corrected *= meta->gain;
        }
        
        output_frame[i] = (float)corrected;
    }
    
    /* Step 4: Bad pixel masking */
    uint8_t *bad_pixel_map = (uint8_t*)ao_malloc(npixels * sizeof(uint8_t));
    if (bad_pixel_map) {
        memset(bad_pixel_map, 0, npixels * sizeof(uint8_t));
        ao_bad_pixel_mask(output_frame, width, height, bad_pixel_map);
        ao_free(bad_pixel_map);
    }
    
    return 0;
}

/* 3x3 median filter for bad pixel masking */
static float median3x3(const float *frame, uint32_t width, uint32_t height,
                       uint32_t cx, uint32_t cy)
{
    float neighbors[9];
    uint32_t count = 0;
    
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            int x = (int)cx + dx;
            int y = (int)cy + dy;
            
            if (x >= 0 && x < (int)width && y >= 0 && y < (int)height) {
                neighbors[count++] = frame[y * width + x];
            }
        }
    }
    
    /* Simple insertion sort for median */
    for (uint32_t i = 1; i < count; i++) {
        float key = neighbors[i];
        int j = (int)i - 1;
        while (j >= 0 && neighbors[j] > key) {
            neighbors[j + 1] = neighbors[j];
            j--;
        }
        neighbors[j + 1] = key;
    }
    
    return (count % 2 == 1) ? neighbors[count / 2] 
                            : (neighbors[count / 2 - 1] + neighbors[count / 2]) * 0.5f;
}

int ao_bad_pixel_mask(float *frame, uint32_t width, uint32_t height,
                      uint8_t *bad_pixel_map)
{
    if (!frame || !bad_pixel_map) return -1;
    
    uint32_t npixels = width * height;
    float *temp = (float*)ao_malloc(npixels * sizeof(float));
    if (!temp) return -1;
    memcpy(temp, frame, npixels * sizeof(float));
    
    /* Detect hot pixels (more than 5 sigma from local median) */
    for (uint32_t y = 1; y < height - 1; y++) {
        for (uint32_t x = 1; x < width - 1; x++) {
            uint32_t idx = y * width + x;
            float median = median3x3(temp, width, height, x, y);
            
            /* Estimate local standard deviation */
            float mad = 0.0f; /* Median absolute deviation */
            float neighbors[9];
            uint32_t n_count = 0;
            for (int dy = -1; dy <= 1; dy++) {
                for (int dx = -1; dx <= 1; dx++) {
                    uint32_t ni = (y + dy) * width + (x + dx);
                    neighbors[n_count] = fabsf(temp[ni] - median);
                    n_count++;
                }
            }
            for (uint32_t i = 1; i < n_count; i++) {
                float key = neighbors[i];
                int j = (int)i - 1;
                while (j >= 0 && neighbors[j] > key) {
                    neighbors[j + 1] = neighbors[j];
                    j--;
                }
                neighbors[j + 1] = key;
            }
            mad = (n_count % 2 == 1) ? neighbors[n_count / 2]
                                     : (neighbors[n_count / 2 - 1] + neighbors[n_count / 2]) * 0.5f;
            
            float sigma_est = mad * 1.4826f; /* Convert MAD to sigma */
            if (sigma_est < 1.0f) sigma_est = 1.0f;
            
            if (fabsf(temp[idx] - median) > 5.0f * sigma_est) {
                bad_pixel_map[idx] = 1;
                frame[idx] = median; /* Replace with median */
            }
        }
    }
    
    ao_free(temp);
    return 0;
}

int ao_photon_noise_estimate(const float *frame, uint32_t width, uint32_t height,
                             double gain, double *noise_map)
{
    if (!frame || !noise_map) return -1;
    
    uint32_t npixels = width * height;
    
    /* Photon noise: sigma = sqrt(N_photons) / gain */
    for (uint32_t i = 0; i < npixels; i++) {
        double photons = (double)frame[i];
        if (photons > 0.0) {
            noise_map[i] = sqrt(photons) / gain;
        } else {
            noise_map[i] = 0.0;
        }
    }
    
    return 0;
}

/* ============================================================================
 * ADAPTIVE THRESHOLDING
 * ============================================================================ */

int ao_adaptive_threshold(const float *frame, uint32_t width, uint32_t height,
                          const ao_subap_config_t *subap_cfg,
                          float *threshold_map)
{
    if (!frame || !subap_cfg || !threshold_map) return -1;
    
    uint32_t nx = subap_cfg->grid_x;
    uint32_t ny = subap_cfg->grid_y;
    uint32_t ss = subap_cfg->subap_size;
    
    /* Compute local statistics per sub-aperture */
    for (uint32_t iy = 0; iy < ny; iy++) {
        for (uint32_t ix = 0; ix < nx; ix++) {
            uint32_t start_x = ix * ss;
            uint32_t start_y = iy * ss;
            
            /* Compute local mean and std */
            double sum = 0.0, sumsq = 0.0;
            uint32_t count = 0;
            
            for (uint32_t dy = 0; dy < ss && (start_y + dy) < height; dy++) {
                for (uint32_t dx = 0; dx < ss && (start_x + dx) < width; dx++) {
                    float val = frame[(start_y + dy) * width + (start_x + dx)];
                    sum += val;
                    sumsq += val * val;
                    count++;
                }
            }
            
            double mean = (count > 0) ? sum / count : 0.0;
            double variance = (count > 1) ? (sumsq - sum * sum / count) / (count - 1) : 0.0;
            double std = sqrt(variance);
            
            /* threshold = mu + k*sigma, k=3 for 99.7% detection */
            double threshold = mean + 3.0 * std;
            
            /* Fill threshold map for this sub-aperture */
            for (uint32_t dy = 0; dy < ss && (start_y + dy) < height; dy++) {
                for (uint32_t dx = 0; dx < ss && (start_x + dx) < width; dx++) {
                    threshold_map[(start_y + dy) * width + (start_x + dx)] = (float)threshold;
                }
            }
        }
    }
    
    return 0;
}
