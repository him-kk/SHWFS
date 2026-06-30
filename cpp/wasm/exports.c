/*
 * WebAssembly C Exports for AO-Pro
 * Simple C API callable from JavaScript via ccall/cwrap
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include "ao_core.h"

/* ============================================================================
 * MEMORY MANAGEMENT
 * ============================================================================ */

uint8_t* ao_wasm_alloc(size_t size) {
    return (uint8_t*)ao_malloc(size);
}

void ao_wasm_free(uint8_t* ptr) {
    ao_free(ptr);
}

/* ============================================================================
 * CONFIGURATION
 * ============================================================================ */

ao_config_t* ao_config_create_default(void) {
    ao_config_t* cfg = (ao_config_t*)ao_malloc(sizeof(ao_config_t));
    if (cfg) {
        ao_config_init_default(cfg);
    }
    return cfg;
}

void ao_config_destroy(ao_config_t* cfg) {
    ao_free(cfg);
}

void ao_config_set_centroid_method(ao_config_t* cfg, int method) {
    if (cfg) cfg->centroid_method = method;
}

void ao_config_set_recon_method(ao_config_t* cfg, int method) {
    if (cfg) cfg->recon_method = method;
}

void ao_config_set_control_method(ao_config_t* cfg, int method) {
    if (cfg) cfg->control_method = method;
}

void ao_config_set_n_zernike(ao_config_t* cfg, int n_modes) {
    if (cfg) cfg->n_zernike_modes = n_modes;
}

void ao_config_set_lambda(ao_config_t* cfg, double lambda) {
    if (cfg) cfg->regularization_lambda = lambda;
}

void ao_config_set_telescope_d(ao_config_t* cfg, double d) {
    if (cfg) cfg->telescope_d = d;
}

void ao_config_set_wavelength(ao_config_t* cfg, double wl) {
    if (cfg) cfg->wavelength = wl;
}

void ao_config_set_sample_rate(ao_config_t* cfg, double rate) {
    if (cfg) cfg->sample_rate_hz = rate;
}

void ao_config_set_dm_stroke(ao_config_t* cfg, double stroke) {
    if (cfg) cfg->dm_max_stroke = stroke;
}

void ao_config_set_dm_coupling(ao_config_t* cfg, double coupling) {
    if (cfg) cfg->dm_coupling = coupling;
}

/* ============================================================================
 * SUBAPERTURE CONFIGURATION
 * ============================================================================ */

ao_subap_config_t* ao_subap_create(int gridX, int gridY, int subapSize,
                                    double pitchPixels, double pitchMeters,
                                    double focalLength) {
    ao_subap_config_t* cfg = (ao_subap_config_t*)ao_malloc(sizeof(ao_subap_config_t));
    if (cfg) {
        memset(cfg, 0, sizeof(ao_subap_config_t));
        cfg->grid_x = gridX;
        cfg->grid_y = gridY;
        cfg->subap_size = subapSize;
        cfg->pitch_pixels = pitchPixels;
        cfg->pitch_meters = pitchMeters;
        cfg->focal_length = focalLength;
    }
    return cfg;
}

void ao_subap_destroy(ao_subap_config_t* cfg) {
    ao_free(cfg);
}

/* ============================================================================
 * FRAME METADATA
 * ============================================================================ */

ao_frame_metadata_t* ao_meta_create(int width, int height, double exposure, 
                                     double gain, double readout_noise) {
    ao_frame_metadata_t* meta = (ao_frame_metadata_t*)ao_malloc(sizeof(ao_frame_metadata_t));
    if (meta) {
        memset(meta, 0, sizeof(ao_frame_metadata_t));
        meta->width = width;
        meta->height = height;
        meta->exposure_ms = exposure;
        meta->gain = gain;
        meta->readout_noise = readout_noise;
        meta->bit_depth = 16;
    }
    return meta;
}

void ao_meta_destroy(ao_frame_metadata_t* meta) {
    ao_free(meta);
}

/* ============================================================================
 * PIPELINE PROCESSING
 * ============================================================================ */

ao_pipeline_result_t* ao_result_create(void) {
    ao_pipeline_result_t* result = (ao_pipeline_result_t*)ao_calloc(1, sizeof(ao_pipeline_result_t));
    return result;
}

void ao_result_destroy(ao_pipeline_result_t* result) {
    if (result) {
        ao_free_result(result);
        ao_free(result);
    }
}

int ao_process_single_frame(const uint16_t* frame_data,
                            const uint16_t* dark_data,
                            const float* flat_data,
                            ao_frame_metadata_t* meta,
                            ao_subap_config_t* subap_cfg,
                            ao_config_t* config,
                            ao_pipeline_result_t* result) {
    if (!frame_data || !meta || !subap_cfg || !config || !result) return -1;
    
    return ao_process_pipeline(frame_data, dark_data, flat_data,
                                meta, subap_cfg, config, result);
}

/* ============================================================================
 * RESULT ACCESSORS
 * ============================================================================ */

double ao_result_get_strehl(ao_pipeline_result_t* result) {
    return result ? result->strehl_ratio : 0.0;
}

double ao_result_get_rms(ao_pipeline_result_t* result) {
    return result ? result->rms_error : 0.0;
}

double ao_result_get_latency(ao_pipeline_result_t* result) {
    return result ? result->latency_ms : 0.0;
}

double ao_result_get_bandwidth(ao_pipeline_result_t* result) {
    return result ? result->loop_bandwidth_hz : 0.0;
}

int ao_result_get_n_valid(ao_pipeline_result_t* result) {
    return result ? (int)result->n_centroids_valid : 0;
}

int ao_result_get_status(ao_pipeline_result_t* result) {
    return result ? (int)result->status : 2;
}

/* Get wavefront phase data */
const double* ao_result_get_wavefront(ao_pipeline_result_t* result, int* nx, int* ny) {
    if (!result || !result->wavefront.phase) return NULL;
    *nx = result->wavefront.n_x;
    *ny = result->wavefront.n_y;
    return result->wavefront.phase;
}

/* Get DM commands */
const double* ao_result_get_dm_commands(ao_pipeline_result_t* result, int* n_actuators) {
    if (!result || !result->dm_commands) return NULL;
    *n_actuators = result->wavefront.n_x * result->wavefront.n_y; /* Approximate */
    
    /* Extract command values into a flat array */
    static double* cmd_buffer = NULL;
    static size_t cmd_buffer_size = 0;
    
    size_t needed = (*n_actuators) * sizeof(double);
    if (cmd_buffer_size < needed) {
        ao_free(cmd_buffer);
        cmd_buffer = (double*)ao_malloc(needed);
        cmd_buffer_size = needed;
    }
    
    if (cmd_buffer) {
        for (int i = 0; i < *n_actuators; i++) {
            cmd_buffer[i] = result->dm_commands[i].command;
        }
    }
    return cmd_buffer;
}

/* Get centroids */
const double* ao_result_get_centroids(ao_pipeline_result_t* result, int* n_centroids) {
    if (!result || !result->centroids) return NULL;
    *n_centroids = (int)result->slopes.n_subaps;
    
    static double* cent_buffer = NULL;
    static size_t cent_buffer_size = 0;
    
    size_t needed = (*n_centroids) * 3 * sizeof(double);
    if (cent_buffer_size < needed) {
        ao_free(cent_buffer);
        cent_buffer = (double*)ao_malloc(needed);
        cent_buffer_size = needed;
    }
    
    if (cent_buffer) {
        for (int i = 0; i < *n_centroids; i++) {
            cent_buffer[i * 3 + 0] = result->centroids[i].x;
            cent_buffer[i * 3 + 1] = result->centroids[i].y;
            cent_buffer[i * 3 + 2] = result->centroids[i].valid ? 
                                      result->centroids[i].quality : -1.0;
        }
    }
    return cent_buffer;
}

/* Get slopes */
const double* ao_result_get_slopes(ao_pipeline_result_t* result, int* n_subaps) {
    if (!result || !result->slopes.gx || !result->slopes.gy) return NULL;
    *n_subaps = (int)result->slopes.n_subaps;
    
    static double* slope_buffer = NULL;
    static size_t slope_buffer_size = 0;
    
    size_t needed = (*n_subaps) * 2 * sizeof(double);
    if (slope_buffer_size < needed) {
        ao_free(slope_buffer);
        slope_buffer = (double*)ao_malloc(needed);
        slope_buffer_size = needed;
    }
    
    if (slope_buffer) {
        for (int i = 0; i < *n_subaps; i++) {
            slope_buffer[i * 2 + 0] = result->slopes.gx[i];
            slope_buffer[i * 2 + 1] = result->slopes.gy[i];
        }
    }
    return slope_buffer;
}

/* Get Zernike coefficients */
const double* ao_result_get_zernike(ao_pipeline_result_t* result, int* n_modes) {
    if (!result || !result->zernike.coeffs) return NULL;
    *n_modes = (int)result->zernike.n_modes;
    return result->zernike.coeffs;
}

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */

double ao_util_compute_strehl(double rms_wfe) {
    return ao_compute_strehl(rms_wfe);
}

double ao_util_compute_rms(const double* data, int n) {
    return ao_compute_rms(data, (uint32_t)n);
}

double ao_util_compute_pv(const double* data, int n) {
    return ao_compute_pv(data, (uint32_t)n);
}

const char* ao_get_version(void) {
    return "AO-Pro v1.0.0";
}
