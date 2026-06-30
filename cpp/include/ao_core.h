/*
 * AO-Pro: Adaptive Optics Processing System
 * Core Header - Data Structures, Constants, and Function Declarations
 * 
 * Implements complete SH-WFS pipeline:
 *   - Preprocessing & Centroid Detection
 *   - Wavefront Reconstruction (Modal SVD, Zonal FRiM, Compressive Sensing)
 *   - Turbulence Characterization (r0, tau0)
 *   - DM Actuator Mapping & Hysteresis Compensation
 *   - Real-Time LQG Control
 *   - Sophia-SPGD Sensorless Backup
 */

#ifndef AO_CORE_H
#define AO_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * CONSTANTS AND CONFIGURATION
 * ============================================================================ */

#define AO_MAX_SUBAPERTURES     256
#define AO_MAX_ACTUATORS        256
#define AO_MAX_ZERNIKE_MODES    65
#define AO_MAX_FRAMES           1024
#define AO_IMAGE_SIZE           512
#define AO_SUBAP_SIZE           16
#define AO_PI                   3.14159265358979323846
#define AO_TWO_PI               6.28318530717958647692
#define AO_DEFAULT_WAVELENGTH   550e-9
#define AO_DEFAULT_TELESCOPE_D  8.0

/* Turbulence model constants (Kolmogorov) */
#define AO_KOLMOGOROV_CONST     0.4226

/* ============================================================================
 * DATA STRUCTURES
 * ============================================================================ */

/* Frame metadata */
typedef struct {
    uint32_t width;
    uint32_t height;
    uint32_t bit_depth;
    double exposure_ms;
    double timestamp;
    double gain;
    double readout_noise;
} ao_frame_metadata_t;

/* Sub-aperture configuration */
typedef struct {
    uint32_t grid_x;           /* Number of sub-apertures in X */
    uint32_t grid_y;           /* Number of sub-apertures in Y */
    uint32_t subap_size;       /* Pixels per sub-aperture */
    double   pitch_pixels;     /* Lenslet pitch in pixels */
    double   pitch_meters;     /* Lenslet pitch in meters */
    double   focal_length;     /* Lenslet focal length */
} ao_subap_config_t;

/* Centroid data */
typedef struct {
    double x;                  /* Centroid X position */
    double y;                  /* Centroid Y position */
    double intensity;          /* Spot intensity */
    double quality;            /* Spot quality metric (0-1) */
    uint8_t valid;             /* Valid flag */
} ao_centroid_t;

/* Slope vector */
typedef struct {
    double *gx;                /* X slopes [n_subaps] */
    double *gy;                /* Y slopes [n_subaps] */
    uint32_t n_subaps;
} ao_slope_vector_t;

/* Zernike mode coefficients */
typedef struct {
    double *coeffs;            /* Zernike coefficients [n_modes] */
    double *variance;          /* Coefficient variance [n_modes] */
    uint32_t n_modes;
    double rms;                /* RMS wavefront error */
} ao_zernike_t;

/* Wavefront map */
typedef struct {
    double *phase;             /* Phase values [n_x * n_y] */
    uint32_t n_x;
    uint32_t n_y;
    double rms;
    double pv;                 /* Peak-to-valley */
    double strehl;             /* Estimated Strehl ratio */
} ao_wavefront_t;

/* Turbulence parameters */
typedef struct {
    double r0;                 /* Fried parameter [meters] */
    double tau0;               /* Coherence time [seconds] */
    double theta0;             /* Isoplanatic angle [arcsec] */
    double wind_speed;         /* Wind speed [m/s] */
    double cn2;                /* Refractive index structure constant */
    double fwhm_seeing;        /* Seeing FWHM [arcsec] */
} ao_turbulence_params_t;

/* DM actuator */
typedef struct {
    double x;                  /* X position */
    double y;                  /* Y position */
    double command;            /* Current command */
    double voltage;            /* Applied voltage */
    uint8_t enabled;           /* Enabled flag */
} ao_actuator_t;

/* DM configuration */
typedef struct {
    ao_actuator_t *actuators;
    uint32_t n_actuators;
    uint32_t grid_x;
    uint32_t grid_y;
    double pitch;              /* Actuator pitch [meters] */
    double coupling;           /* Inter-actuator coupling coefficient */
    double sigma_if;           /* Influence function width */
    double max_stroke;         /* Maximum actuator stroke */
    uint32_t geometry;         /* 0=Fried, 1=Hudgin */
} ao_dm_config_t;

/* Preisach hysteresis model */
typedef struct {
    double *mu;                /* Weight density function [M x M] */
    double *history_alpha;     /* Past input extrema (alpha) */
    double *history_beta;      /* Past input extrema (beta) */
    int    *history_states;    /* Relay states */
    uint32_t M;                /* Discretization level */
    uint32_t n_history;        /* Number of stored extrema */
    double u_min;              /* Minimum input */
    double u_max;              /* Maximum input */
} ao_preisach_model_t;

/* LQG controller state */
typedef struct {
    double *x_hat;             /* Estimated state [n_states] */
    double *P;                 /* Error covariance [n_states x n_states] */
    double *K;                 /* Kalman gain [n_states x n_meas] */
    double *A;                 /* State transition [n_states x n_states] */
    double *B;                 /* Control input [n_states x n_ctrl] */
    double *C;                 /* Observation [n_meas x n_states] */
    double *Q;                 /* Process noise covariance [n_states x n_states] */
    double *R;                 /* Measurement noise covariance [n_meas x n_meas] */
    uint32_t n_states;
    uint32_t n_meas;
    uint32_t n_ctrl;
    double loop_gain;          /* Adaptive loop gain */
    double correlation_lock;   /* Correlation-locking parameter lambda */
} ao_lqg_state_t;

/* SPGD optimization state */
typedef struct {
    double *u;                 /* Current DM commands [n_actuators] */
    double *m;                 /* First-order momentum */
    double *h;                 /* Second-order estimate */
    double *delta_u;           /* Random perturbation */
    double lr;                 /* Learning rate */
    double beta1;              /* Momentum coefficient */
    double beta2;              /* Second-order coefficient */
    double gamma;              /* Clip parameter */
    double bound;              /* Adaptive bound */
    double l0;                 /* Initial learning rate */
    double rho0;               /* Decay rate */
    uint32_t iteration;
    uint32_t max_iterations;
    uint32_t n_actuators;
    double performance_metric; /* Current performance (e.g., sharpness) */
} ao_spgd_state_t;

/* Processing configuration */
typedef struct {
    /* Centroiding */
    uint32_t centroid_method;  /* 0=WCoG, 1=Autocorrelation, 2=Hybrid */
    double   cog_sigma;        /* Gaussian weighting sigma */
    double   correlation_threshold;
    
    /* Reconstruction */
    uint32_t recon_method;     /* 0=Modal SVD, 1=Zonal FRiM, 2=Compressive */
    uint32_t n_zernike_modes;  /* Number of Zernike modes */
    double   regularization_lambda;
    double   frim_tolerance;   /* PCG convergence tolerance */
    uint32_t frim_max_iter;    /* Maximum PCG iterations */
    
    /* Control */
    uint32_t control_method;   /* 0=PI, 1=LQG */
    double   pi_kp;            /* Proportional gain */
    double   pi_ki;            /* Integral gain */
    double   lqg_process_noise;
    double   lqg_meas_noise;
    
    /* Turbulence */
    double   telescope_d;      /* Telescope diameter [m] */
    double   wavelength;       /* Wavelength [m] */
    double   sample_rate_hz;   /* Frame rate [Hz] */
    
    /* DM */
    double   dm_coupling;      /* Inter-actuator coupling */
    double   dm_max_stroke;    /* Max stroke [microns] */
    uint32_t enable_hysteresis;/* Enable Preisach compensation */
    
    /* Sensorless backup */
    uint32_t enable_spgd;      /* Enable SPGD backup */
    double   spgd_learning_rate;
    
    /* System */
    uint32_t max_latency_ms;   /* Target latency */
    double   target_strehl;    /* Target Strehl ratio */
} ao_config_t;

/* Pipeline result */
typedef struct {
    ao_centroid_t          *centroids;
    ao_slope_vector_t      slopes;
    ao_zernike_t           zernike;
    ao_wavefront_t         wavefront;
    ao_turbulence_params_t turbulence;
    ao_actuator_t          *dm_commands;
    double                 *influence_matrix;  /* H matrix */
    double                 strehl_ratio;
    double                 rms_error;
    double                 loop_bandwidth_hz;
    double                 latency_ms;
    double                 processing_time_ms;
    uint32_t               n_centroids_valid;
    uint32_t               status;             /* 0=OK, 1=Warning, 2=Error */
} ao_pipeline_result_t;

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 1: PREPROCESSING
 * ============================================================================ */

/* Frame preprocessing */
int ao_preprocess_frame(const uint16_t *raw_frame,
                        const uint16_t *dark_frame,
                        const float    *flat_frame,
                        const ao_frame_metadata_t *meta,
                        float          *output_frame);

int ao_bad_pixel_mask(float *frame, uint32_t width, uint32_t height,
                      uint8_t *bad_pixel_map);

int ao_photon_noise_estimate(const float *frame, uint32_t width, uint32_t height,
                             double gain, double *noise_map);

int ao_adaptive_threshold(const float *frame, uint32_t width, uint32_t height,
                          const ao_subap_config_t *subap_cfg,
                          float *threshold_map);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 2: CENTROID DETECTION
 * ============================================================================ */

int ao_centroid_wcog(const float    *subaperture,
                     uint32_t        subap_size,
                     double          spot_sigma,
                     ao_centroid_t  *centroid);

int ao_centroid_autocorrelation(const float    *full_frame,
                                uint32_t        width,
                                uint32_t        height,
                                const ao_subap_config_t *subap_cfg,
                                double          spot_sigma,
                                ao_centroid_t  *centroids);

int ao_hybrid_centroiding(const float    *frame,
                          uint32_t        width,
                          uint32_t        height,
                          const ao_subap_config_t *subap_cfg,
                          const ao_config_t *config,
                          ao_centroid_t  *centroids,
                          uint32_t       *n_valid);

/* Hungarian algorithm for spot-to-lenslet assignment */
int ao_assign_spots_hungarian(const ao_centroid_t *detected,
                              uint32_t             n_detected,
                              const double        *expected_x,
                              const double        *expected_y,
                              uint32_t             n_expected,
                              double               pitch_pixels,
                              int                 *assignment);

/* Convert centroids to slope vectors */
int ao_centroids_to_slopes(const ao_centroid_t    *centroids,
                           const ao_subap_config_t *subap_cfg,
                           double                   reference_x,
                           double                   reference_y,
                           ao_slope_vector_t       *slopes);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 3: WAVEFRONT RECONSTRUCTION
 * ============================================================================ */

/* Modal reconstruction (Zernike SVD) */
int ao_build_zernike_matrix(const ao_subap_config_t *subap_cfg,
                            uint32_t                 n_modes,
                            double                  *D_matrix);

int ao_zernike_covariance_kolmogorov(uint32_t  n_modes,
                                      double    D_over_r0,
                                      double   *cov_matrix);

int ao_reconstruct_modal(const ao_slope_vector_t *slopes,
                         const double            *D_matrix,
                         const double            *cov_inv,
                         uint32_t                 n_modes,
                         double                   lambda,
                         ao_zernike_t            *result);

/* Zonal reconstruction (Southwell least-squares) */
int ao_reconstruct_zonal_southwell(const ao_slope_vector_t *slopes,
                                   const ao_subap_config_t *subap_cfg,
                                   ao_wavefront_t          *wavefront);

/* FRiM - Fractal Iterative Method */
int ao_frim_reconstruct(const ao_slope_vector_t *slopes,
                        const ao_subap_config_t *subap_cfg,
                        double                   r0_estimate,
                        double                   wavelength,
                        double                   tolerance,
                        uint32_t                 max_iterations,
                        ao_wavefront_t          *wavefront);

int ao_frim_pcgsolve(const double *A_data, const int *A_indices, const int *A_ptr,
                     uint32_t n, const double *b,
                     const double *precond, double tol, uint32_t max_iter,
                     double *x, uint32_t *iterations);

/* Fractal operator for turbulence prior */
int ao_fractal_operator(const double *x, double *y, uint32_t n, double r0);
int ao_fractal_operator_transpose(const double *x, double *y, uint32_t n, double r0);
int ao_fractal_operator_inverse(const double *x, double *y, uint32_t n, double r0);

/* Compressive sensing (OMP) */
int ao_reconstruct_compressive(const ao_slope_vector_t *slopes,
                               const double            *D_matrix,
                               const double            *psi_basis,
                               uint32_t                 n_modes,
                               uint32_t                 n_measurements,
                               uint32_t                 sparsity,
                               ao_zernike_t            *result);

/* Orthogonal Matching Pursuit */
int ao_omp_solve(const double *Phi, const double *y,
                 uint32_t m, uint32_t n, uint32_t sparsity,
                 double *x, uint32_t *support);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 4: TURBULENCE CHARACTERIZATION
 * ============================================================================ */

/* r0 estimation from Zernike variance */
int ao_estimate_r0_zernike(const ao_zernike_t      *zernike_history,
                           uint32_t                 n_frames,
                           double                   telescope_d,
                           double                  *r0);

/* r0 estimation from phase structure function */
int ao_estimate_r0_structure_function(const ao_wavefront_t *wavefronts,
                                      uint32_t              n_frames,
                                      double               *r0);

/* tau0 estimation from temporal autocorrelation */
int ao_estimate_tau0_autocorrelation(const double *coeff_time_series,
                                       uint32_t      n_samples,
                                       double        sample_interval,
                                       double       *tau0);

/* Layer-resolved tau0 estimation */
int ao_estimate_tau0_layers(const double *tt_coeffs,    /* Tip/tilt */
                            const double *ho_coeffs,    /* High-order */
                            uint32_t      n_samples,
                            double        sample_interval,
                            double       *tau0_ground,
                            double       *tau0_high);

/* Complete turbulence characterization */
int ao_characterize_turbulence(const ao_zernike_t      *zernike_series,
                               const ao_wavefront_t    *wavefront_series,
                               uint32_t                 n_frames,
                               double                   sample_interval,
                               double                   telescope_d,
                               ao_turbulence_params_t  *params);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 5: DM ACTUATOR MAPPING
 * ============================================================================ */

/* Fried geometry alignment */
int ao_dm_align_fried(const ao_subap_config_t *subap_cfg,
                      ao_dm_config_t          *dm_config,
                      double                   magnification);

/* Gaussian influence function */
double ao_influence_function(double x, double y,
                             double x_act, double y_act,
                             double sigma);

/* Build influence function matrix H */
int ao_build_influence_matrix(const ao_dm_config_t    *dm,
                              const ao_subap_config_t *subap_cfg,
                              double                  *H_matrix);

/* Actuator command calculation with regularization */
int ao_compute_dm_commands(const ao_wavefront_t    *wavefront,
                           const ao_dm_config_t    *dm,
                           const double            *H_matrix,
                           const double            *cov_inv,
                           double                   lambda,
                           double                   gamma,
                           ao_actuator_t           *commands);

/* Stroke constraints and clipping */
int ao_apply_stroke_constraints(ao_actuator_t *commands,
                                uint32_t       n_actuators,
                                double         max_stroke);

int ao_stroke_minimization_qp(const double *H, const double *phi_target,
                              uint32_t n_meas, uint32_t n_act,
                              double max_stroke, double epsilon,
                              double *commands);

/* Waffle mode detection and suppression */
double ao_detect_waffle_mode(const ao_actuator_t *commands,
                             uint32_t grid_x, uint32_t grid_y);

int ao_suppress_waffle(double *command_matrix, uint32_t grid_x, uint32_t grid_y);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 6: HYSTERESIS COMPENSATION
 * ============================================================================ */

/* Preisach model */
int ao_preisach_init(ao_preisach_model_t *model,
                     double u_min, double u_max,
                     uint32_t discretization);

int ao_preisach_identify(ao_preisach_model_t *model,
                         const double *input_values,
                         const double *output_values,
                         uint32_t n_points);

double ao_preisach_evaluate(const ao_preisach_model_t *model, double u);

double ao_preisach_inverse(const ao_preisach_model_t *model, double y_desired);

int ao_preisach_compensate_commands(ao_preisach_model_t *model,
                                    ao_actuator_t *commands,
                                    uint32_t n_actuators);

void ao_preisach_free(ao_preisach_model_t *model);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 7: REAL-TIME CONTROL
 * ============================================================================ */

/* PI control */
int ao_pi_control_init(double kp, double ki, uint32_t n_outputs);

int ao_pi_control_update(const double *error,
                         uint32_t n_outputs,
                         double *control_output);

void ao_pi_control_reset(void);

/* LQG control */
int ao_lqg_init(ao_lqg_state_t *lqg,
                uint32_t n_states, uint32_t n_meas, uint32_t n_ctrl,
                double process_noise, double meas_noise);

int ao_lqg_predict(ao_lqg_state_t *lqg);

int ao_lqg_update(ao_lqg_state_t *lqg, const double *measurement);

int ao_lqg_compute_control(const ao_lqg_state_t *lqg, double *control);

int ao_lqg_adaptive_gain(ao_lqg_state_t *lqg,
                         const double *residuals,
                         uint32_t n_residuals);

void ao_lqg_free(ao_lqg_state_t *lqg);

/* Build turbulence state-space model (AR1) */
int ao_build_turbulence_model(double r0, double tau0, double sample_time,
                              uint32_t n_modes,
                              double *A_state, double *Q_process);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 8: SENSORLESS BACKUP (Sophia-SPGD)
 * ============================================================================ */

int ao_spgd_init(ao_spgd_state_t *spgd,
                 uint32_t n_actuators,
                 double learning_rate,
                 uint32_t max_iterations);

int ao_sophia_spgd_step(ao_spgd_state_t *spgd,
                        double (*performance_func)(const double*, uint32_t, void*),
                        void *user_data);

int ao_spgd_update_momentum(ao_spgd_state_t *spgd,
                            double J_plus, double J_minus);

double ao_spgd_default_sharpness(const double *frame,
                                 uint32_t width, uint32_t height);

void ao_spgd_free(ao_spgd_state_t *spgd);

/* ============================================================================
 * FUNCTION DECLARATIONS - MODULE 9: UTILITY FUNCTIONS
 * ============================================================================ */

/* Linear algebra utilities */
int ao_svd_solve(const double *A, const double *b,
                 uint32_t m, uint32_t n,
                 double *x, double *s);

int ao_pseudoinverse(const double *A, uint32_t m, uint32_t n, double *A_pinv);

int ao_matrix_multiply(const double *A, const double *B, double *C,
                       uint32_t m, uint32_t k, uint32_t n);

int ao_matrix_transpose(const double *A, double *At,
                        uint32_t m, uint32_t n);

int ao_solve_linear_system(const double *A, const double *b,
                           uint32_t n, double *x);

/* Zernike polynomials */
double ao_zernike_evaluate(uint32_t n, uint32_t m, double r, double theta);
int ao_zernike_derivative(uint32_t n, uint32_t m, double r, double theta,
                          double *dz_dx, double *dz_dy);

/* Statistics utilities */
double ao_compute_strehl(double rms_wfe);
double ao_compute_rms(const double *data, uint32_t n);
double ao_compute_pv(const double *data, uint32_t n);
double ao_compute_autocorrelation(const double *signal, uint32_t n,
                                  uint32_t max_lag, double *acf);

/* FFT utilities (for autocorrelation) */
int ao_fft_2d(double *real, double *imag, uint32_t nx, uint32_t ny,
                int direction);

/* Memory allocation */
void* ao_malloc(size_t size);
void* ao_calloc(size_t nmemb, size_t size);
void ao_free(void *ptr);

/* ============================================================================
 * COMPLETE PIPELINE
 * ============================================================================ */

/* Initialize default configuration */
void ao_config_init_default(ao_config_t *config);

/* Run complete processing pipeline */
int ao_process_pipeline(const uint16_t     *frame,
                        const uint16_t     *dark_frame,
                        const float        *flat_frame,
                        const ao_frame_metadata_t *meta,
                        const ao_subap_config_t   *subap_cfg,
                        const ao_config_t         *config,
                        ao_pipeline_result_t      *result);

/* Process time series */
int ao_process_timeseries(const uint16_t     **frames,
                          uint32_t             n_frames,
                          const uint16_t      *dark_frame,
                          const float         *flat_frame,
                          const ao_frame_metadata_t *meta,
                          const ao_subap_config_t   *subap_cfg,
                          const ao_config_t         *config,
                          ao_pipeline_result_t      *results,
                          ao_turbulence_params_t    *turbulence);

/* Free pipeline result memory */
void ao_free_result(ao_pipeline_result_t *result);

#ifdef __cplusplus
}
#endif

#endif /* AO_CORE_H */
