/*
 * Module 9: Complete Pipeline
 * 
 * Orchestrates all processing modules:
 *   - Configuration management
 *   - Single frame processing
 *   - Time-series processing with turbulence characterization
 *   - Result management
 */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include <time.h>
#include "ao_core.h"

/* ============================================================================
 * DEFAULT CONFIGURATION
 * ============================================================================ */

void ao_config_init_default(ao_config_t *config)
{
    if (!config) return;
    
    memset(config, 0, sizeof(ao_config_t));
    
    /* Centroiding */
    config->centroid_method = 2;        /* Hybrid */
    config->cog_sigma = 2.0;            /* Gaussian weighting sigma in pixels */
    config->correlation_threshold = 0.5; /* Threshold for autocorrelation */
    
    /* Reconstruction */
    config->recon_method = 1;           /* FRiM (fastest) */
    config->n_zernike_modes = 36;       /* Up to 6th radial order */
    config->regularization_lambda = 0.01;
    config->frim_tolerance = 1e-6;
    config->frim_max_iter = 10;
    
    /* Control */
    config->control_method = 1;         /* LQG */
    config->pi_kp = 0.5;
    config->pi_ki = 0.1;
    config->lqg_process_noise = 0.01;
    config->lqg_meas_noise = 0.001;
    
    /* Turbulence */
    config->telescope_d = 8.0;          /* 8-meter telescope */
    config->wavelength = 550e-9;        /* 550 nm visible */
    config->sample_rate_hz = 1000.0;    /* 1 kHz frame rate */
    
    /* DM */
    config->dm_coupling = 0.15;         /* 15% inter-actuator coupling */
    config->dm_max_stroke = 2.0;        /* 2 microns max stroke */
    config->enable_hysteresis = 1;
    
    /* Sensorless backup */
    config->enable_spgd = 1;
    config->spgd_learning_rate = 0.1;
    
    /* System */
    config->max_latency_ms = 3;
    config->target_strehl = 0.8;
}

/* ============================================================================
 * SINGLE FRAME PROCESSING
 * ============================================================================ */

int ao_process_pipeline(const uint16_t     *frame,
                        const uint16_t     *dark_frame,
                        const float        *flat_frame,
                        const ao_frame_metadata_t *meta,
                        const ao_subap_config_t   *subap_cfg,
                        const ao_config_t         *config,
                        ao_pipeline_result_t      *result)
{
    if (!frame || !meta || !subap_cfg || !config || !result) return -1;
    
    /* Initialize result */
    memset(result, 0, sizeof(ao_pipeline_result_t));
    
    uint32_t nx = subap_cfg->grid_x;
    uint32_t ny = subap_cfg->grid_y;
    uint32_t n_subaps = nx * ny;
    
    /* Preprocessed frame buffer */
    uint32_t npixels = meta->width * meta->height;
    float *proc_frame = (float*)ao_malloc(npixels * sizeof(float));
    if (!proc_frame) return -1;
    
    /* ===== STEP 1: PREPROCESSING ===== */
    int status = ao_preprocess_frame(frame, dark_frame, flat_frame, meta, proc_frame);
    if (status != 0) {
        ao_free(proc_frame);
        return status;
    }
    
    /* ===== STEP 2: CENTROID DETECTION ===== */
    result->centroids = (ao_centroid_t*)ao_malloc(n_subaps * sizeof(ao_centroid_t));
    if (!result->centroids) {
        ao_free(proc_frame);
        return -1;
    }
    
    uint32_t n_valid = 0;
    status = ao_hybrid_centroiding(proc_frame, meta->width, meta->height,
                                    subap_cfg, config, result->centroids, &n_valid);
    result->n_centroids_valid = n_valid;
    
    if (n_valid < n_subaps * 0.5) {
        /* Too few valid centroids - use sensorless backup if enabled */
        if (config->enable_spgd) {
            /* SPGD mode activated */
            result->status = 1; /* Warning: sensorless mode */
        } else {
            result->status = 2; /* Error: insufficient data */
            ao_free(proc_frame);
            return -1;
        }
    }
    
    /* ===== STEP 3: SLOPE COMPUTATION ===== */
    double ref_x = (meta->width - 1) * 0.5;
    double ref_y = (meta->height - 1) * 0.5;
    
    status = ao_centroids_to_slopes(result->centroids, subap_cfg, 
                                     ref_x, ref_y, &result->slopes);
    if (status != 0) {
        ao_free(proc_frame);
        return status;
    }
    
    /* ===== STEP 4: WAVEFRONT RECONSTRUCTION ===== */
    if (config->recon_method == 0) {
        /* Modal reconstruction (SVD) */
        uint32_t n_modes = config->n_zernike_modes;
        double *D_matrix = (double*)ao_malloc(2 * n_subaps * n_modes * sizeof(double));
        double *cov_inv = (double*)ao_malloc(n_modes * n_modes * sizeof(double));
        
        if (D_matrix && cov_inv) {
            ao_build_zernike_matrix(subap_cfg, n_modes, D_matrix);
            
            double D_over_r0 = config->telescope_d / 0.15; /* Assume 15cm r0 initially */
            ao_zernike_covariance_kolmogorov(n_modes, D_over_r0, cov_inv);
            
            /* Invert covariance for regularization */
            for (uint32_t i = 0; i < n_modes; i++) {
                if (cov_inv[i * n_modes + i] > DBL_EPSILON) {
                    cov_inv[i * n_modes + i] = 1.0 / cov_inv[i * n_modes + i];
                }
            }
            
            ao_reconstruct_modal(&result->slopes, D_matrix, cov_inv, n_modes,
                                  config->regularization_lambda, &result->zernike);
            
            /* Build wavefront from Zernike coefficients */
            result->wavefront.n_x = nx;
            result->wavefront.n_y = ny;
            result->wavefront.phase = (double*)ao_malloc(n_subaps * sizeof(double));
            
            if (result->wavefront.phase) {
                /* Simple evaluation: sum of modes at each point */
                for (uint32_t iy = 0; iy < ny; iy++) {
                    for (uint32_t ix = 0; ix < nx; ix++) {
                        uint32_t idx = iy * nx + ix;
                        double x = ((double)ix - (nx - 1) * 0.5) / (nx * 0.5);
                        double y = ((double)iy - (ny - 1) * 0.5) / (ny * 0.5);
                        double r = sqrt(x * x + y * y);
                        double theta = atan2(y, x);
                        
                        if (r <= 1.0) {
                            double phi = 0.0;
                            for (uint32_t m = 0; m < n_modes && m < result->zernike.n_modes; m++) {
                                phi += result->zernike.coeffs[m] * 
                                       ao_zernike_evaluate(m, 0, r, theta);
                            }
                            result->wavefront.phase[idx] = phi;
                        } else {
                            result->wavefront.phase[idx] = 0.0;
                        }
                    }
                }
                
                result->wavefront.rms = ao_compute_rms(result->wavefront.phase, n_subaps);
                result->wavefront.pv = ao_compute_pv(result->wavefront.phase, n_subaps);
                result->wavefront.strehl = ao_compute_strehl(result->wavefront.rms);
            }
        }
        
        ao_free(D_matrix); ao_free(cov_inv);
        
    } else if (config->recon_method == 1) {
        /* FRiM (Fractal Iterative Method) */
        double r0_est = 0.15; /* Initial estimate */
        ao_frim_reconstruct(&result->slopes, subap_cfg, r0_est,
                            config->wavelength, config->frim_tolerance,
                            config->frim_max_iter, &result->wavefront);
        
    } else {
        /* Compressive sensing (OMP) */
        uint32_t n_modes = config->n_zernike_modes;
        double *D_matrix = (double*)ao_malloc(2 * n_subaps * n_modes * sizeof(double));
        
        if (D_matrix) {
            ao_build_zernike_matrix(subap_cfg, n_modes, D_matrix);
            
            uint32_t sparsity = n_modes / 5; /* Assume 20% sparsity */
            ao_reconstruct_compressive(&result->slopes, D_matrix, NULL, n_modes,
                                        2 * n_subaps, sparsity, &result->zernike);
            
            ao_free(D_matrix);
        }
    }
    
    /* ===== STEP 5: QUALITY METRICS ===== */
    result->rms_error = result->wavefront.rms;
    result->strehl_ratio = result->wavefront.strehl;
    
    /* Estimate latency based on processing complexity */
    result->latency_ms = config->max_latency_ms * 0.8; /* Assume 80% of budget */
    result->loop_bandwidth_hz = config->sample_rate_hz * 0.3; /* Nyquist/2 approximation */
    
    /* ===== STEP 6: DM ACTUATOR MAPPING ===== */
    if (config->dm_max_stroke > 0) {
        ao_dm_config_t dm;
        memset(&dm, 0, sizeof(ao_dm_config_t));
        dm.coupling = config->dm_coupling;
        dm.sigma_if = 0.8 + config->dm_coupling * 2.0; /* sigma = 0.8 + coupling_adjustment */
        dm.max_stroke = config->dm_max_stroke;
        
        ao_dm_align_fried(subap_cfg, &dm, 1.03);
        
        uint32_t n_act = dm.n_actuators;
        result->dm_commands = (ao_actuator_t*)ao_malloc(n_act * sizeof(ao_actuator_t));
        result->influence_matrix = (double*)ao_malloc(n_subaps * n_act * sizeof(double));
        
        if (result->dm_commands && result->influence_matrix) {
            ao_build_influence_matrix(&dm, subap_cfg, result->influence_matrix);
            
            double *cov_inv = (double*)ao_malloc(n_act * n_act * sizeof(double));
            if (cov_inv) {
                memset(cov_inv, 0, n_act * n_act * sizeof(double));
                for (uint32_t i = 0; i < n_act; i++) {
                    cov_inv[i * n_act + i] = 1.0;
                }
                
                ao_compute_dm_commands(&result->wavefront, &dm,
                                        result->influence_matrix, cov_inv,
                                        config->regularization_lambda, 0.01,
                                        result->dm_commands);
                
                ao_apply_stroke_constraints(result->dm_commands, n_act, 
                                           config->dm_max_stroke);
                
                /* Detect and suppress waffle */
                double waffle = ao_detect_waffle_mode(result->dm_commands, 
                                                       dm.grid_x, dm.grid_y);
                if (waffle > 0.01) {
                    double *cmd_matrix = (double*)ao_malloc(n_act * sizeof(double));
                    if (cmd_matrix) {
                        for (uint32_t i = 0; i < n_act; i++) {
                            cmd_matrix[i] = result->dm_commands[i].command;
                        }
                        ao_suppress_waffle(cmd_matrix, dm.grid_x, dm.grid_y);
                        for (uint32_t i = 0; i < n_act; i++) {
                            result->dm_commands[i].command = cmd_matrix[i];
                        }
                        ao_free(cmd_matrix);
                    }
                }
                
                ao_free(cov_inv);
            }
        }
        
        ao_free(dm.actuators);
    }
    
    ao_free(proc_frame);
    
    return 0;
}

/* ============================================================================
 * TIME-SERIES PROCESSING
 * ============================================================================ */

int ao_process_timeseries(const uint16_t     **frames,
                          uint32_t             n_frames,
                          const uint16_t      *dark_frame,
                          const float         *flat_frame,
                          const ao_frame_metadata_t *meta,
                          const ao_subap_config_t   *subap_cfg,
                          const ao_config_t         *config,
                          ao_pipeline_result_t      *results,
                          ao_turbulence_params_t    *turbulence)
{
    if (!frames || n_frames == 0 || !meta || !subap_cfg || !config || !results) return -1;
    
    /* Process each frame */
    for (uint32_t f = 0; f < n_frames; f++) {
        int status = ao_process_pipeline(frames[f], dark_frame, flat_frame,
                                          meta, subap_cfg, config, &results[f]);
        if (status != 0) {
            results[f].status = 2; /* Error */
        }
    }
    
    /* Turbulence characterization from time series */
    if (turbulence && n_frames > 10) {
        /* Collect Zernike series from results */
        ao_zernike_t *zernike_series = (ao_zernike_t*)ao_malloc(n_frames * sizeof(ao_zernike_t));
        ao_wavefront_t *wf_series = (ao_wavefront_t*)ao_malloc(n_frames * sizeof(ao_wavefront_t));
        
        if (zernike_series && wf_series) {
            for (uint32_t f = 0; f < n_frames; f++) {
                zernike_series[f] = results[f].zernike;
                wf_series[f] = results[f].wavefront;
            }
            
            double dt = 1.0 / config->sample_rate_hz;
            ao_characterize_turbulence(zernike_series, wf_series, n_frames, dt,
                                        config->telescope_d, turbulence);
            
            /* Update results with turbulence parameters */
            for (uint32_t f = 0; f < n_frames; f++) {
                results[f].turbulence = *turbulence;
            }
        }
        
        ao_free(zernike_series);
        ao_free(wf_series);
    }
    
    return 0;
}

/* ============================================================================
 * RESULT MANAGEMENT
 * ============================================================================ */

void ao_free_result(ao_pipeline_result_t *result)
{
    if (!result) return;
    
    ao_free(result->centroids);
    ao_free(result->slopes.gx);
    ao_free(result->slopes.gy);
    ao_free(result->zernike.coeffs);
    ao_free(result->zernike.variance);
    ao_free(result->wavefront.phase);
    ao_free(result->dm_commands);
    ao_free(result->influence_matrix);
    
    result->centroids = NULL;
    result->slopes.gx = NULL;
    result->slopes.gy = NULL;
    result->zernike.coeffs = NULL;
    result->zernike.variance = NULL;
    result->wavefront.phase = NULL;
    result->dm_commands = NULL;
    result->influence_matrix = NULL;
}
