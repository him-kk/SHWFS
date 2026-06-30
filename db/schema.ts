import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  double,
  int,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

/* ============================================================================
 * AO Processing Run - stores each processing session
 * ============================================================================ */
export const processingRuns = mysqlTable("processing_runs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("running"),
  
  /* Configuration */
  centroidMethod: varchar("centroid_method", { length: 50 }).notNull().default("hybrid"),
  reconMethod: varchar("recon_method", { length: 50 }).notNull().default("frim"),
  controlMethod: varchar("control_method", { length: 50 }).notNull().default("lqg"),
  nZernikeModes: int("n_zernike_modes").notNull().default(36),
  regularizationLambda: double("regularization_lambda").notNull().default(0.01),
  telescopeDiameter: double("telescope_diameter").notNull().default(8.0),
  wavelength: double("wavelength").notNull().default(550e-9),
  sampleRateHz: double("sample_rate_hz").notNull().default(1000),
  dmMaxStroke: double("dm_max_stroke").notNull().default(2.0),
  dmCoupling: double("dm_coupling").notNull().default(0.15),
  
  /* Subaperture config */
  subapGridX: int("subap_grid_x").notNull().default(16),
  subapGridY: int("subap_grid_y").notNull().default(16),
  subapSize: int("subap_size").notNull().default(16),
  
  /* Timestamps */
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

/* ============================================================================
 * Processing Result - stores results for each frame
 * ============================================================================ */
export const processingResults = mysqlTable("processing_results", {
  id: serial("id").primaryKey(),
  runId: int("run_id").notNull(),
  frameIndex: int("frame_index").notNull(),
  
  /* Quality metrics */
  strehlRatio: double("strehl_ratio"),
  rmsError: double("rms_error"),
  latencyMs: double("latency_ms"),
  bandwidthHz: double("bandwidth_hz"),
  nValidCentroids: int("n_valid_centroids"),
  
  /* Turbulence parameters */
  friedR0: double("fried_r0"),
  coherenceTime: double("coherence_time"),
  windSpeed: double("wind_speed"),
  cn2: double("cn2"),
  fwhmSeeing: double("fwhm_seeing"),
  
  /* Wavefront data (stored as JSON arrays) */
  wavefrontData: json("wavefront_data"),
  zernikeCoefficients: json("zernike_coefficients"),
  dmCommands: json("dm_commands"),
  centroids: json("centroids"),
  slopes: json("slopes"),
  
  /* Status */
  status: varchar("status", { length: 50 }).notNull().default("ok"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ============================================================================
 * System Status - stores current system state
 * ============================================================================ */
export const systemStatus = mysqlTable("system_status", {
  id: serial("id").primaryKey(),
  
  /* Loop status */
  loopOpen: boolean("loop_open").notNull().default(true),
  frameRate: double("frame_rate").notNull().default(0),
  currentStrehl: double("current_strehl"),
  currentRms: double("current_rms"),
  
  /* Turbulence estimates */
  estimatedR0: double("estimated_r0"),
  estimatedTau0: double("estimated_tau0"),
  estimatedWind: double("estimated_wind"),
  
  /* DM status */
  dmVoltageRms: double("dm_voltage_rms"),
  nActuatorsClipped: int("n_actuators_clipped").notNull().default(0),
  
  /* Sensorless backup */
  spgdActive: boolean("spgd_active").notNull().default(false),
  spgdIteration: int("spgd_iteration").notNull().default(0),
  spgdPerformance: double("spgd_performance"),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ============================================================================
 * Calibration Data - stores dark/flat frames and influence matrices
 * ============================================================================ */
export const calibrationData = mysqlTable("calibration_data", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  calType: varchar("cal_type", { length: 50 }).notNull(), /* dark, flat, influence, hysteresis */
  
  /* Metadata */
  nSubapertures: int("n_subapertures"),
  nActuators: int("n_actuators"),
  gridX: int("grid_x"),
  gridY: int("grid_y"),
  
  /* Data stored as JSON */
  data: json("data"),
  
  /* Preisach parameters (for hysteresis) */
  preisachUMin: double("preisach_u_min"),
  preisachUMax: double("preisach_u_max"),
  preisachM: int("preisach_m"),
  
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
