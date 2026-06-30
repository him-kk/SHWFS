// Landing Page Config Interfaces
export interface LandingHeroConfig {
  eyebrow: string
  titleLines: string[]
  leadText: string
  supportingNotes: string[]
}

export interface LandingManifestoConfig {
  videoPath: string
  text: string
}

export interface LandingModuleItem {
  slug: string
  name: string
  code: string
  address: string
  status: string
  email: string
  phone: string
  ctaText: string
  ctaHref: string
  image: string
  utcOffset: number
  article: {
    title: string
    paragraphs: string[]
  }
}

export interface LandingModulesConfig {
  sectionLabel: string
  items: LandingModuleItem[]
}

export interface LandingObservationConfig {
  sectionLabel: string
  videoPath: string
  statusText: string
  latLabel: string
  lonLabel: string
  initialLat: number
  initialLon: number
}

export interface LandingArchiveItem {
  src: string
  label: string
}

export interface LandingArchivesConfig {
  sectionLabel: string
  vaultTitle: string
  closeText: string
  items: LandingArchiveItem[]
}

export interface LandingFooterConfig {
  copyrightText: string
  statusText: string
}

export interface SiteConfig {
  language: string
  siteTitle: string
  siteDescription: string
}

export interface NavigationLink {
  label: string
  href: string
}

export interface NavigationConfig {
  brandName: string
  links: NavigationLink[]
}

export interface ModuleConfig {
  id: string
  label: string
  status: 'active' | 'standby' | 'error' | 'processing'
  description: string
}

export interface MetricConfig {
  id: string
  label: string
  value: string
  unit: string
  target: string
  trend: 'up' | 'down' | 'stable'
}

export interface AlgorithmConfig {
  id: string
  name: string
  trl: number
  trlLabel: string
  status: 'deployable' | 'proven' | 'lab-validated' | 'research'
  description: string
  source: string
  year: string
}

export interface CalibrationStep {
  id: string
  label: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'error'
}

export interface ProcessingRun {
  id: string
  timestamp: string
  duration: string
  modules: string[]
  strehl: number
  rms: number
  r0: number
  status: 'success' | 'warning' | 'error'
}

export const siteConfig: SiteConfig = {
  language: 'en',
  siteTitle: 'AO Wavefront Control System',
  siteDescription: 'Shack-Hartmann Wavefront Sensor data processing system for wavefront reconstruction, turbulence characterization, and deformable mirror control.',
}

export const navigationConfig: NavigationConfig = {
  brandName: 'AO-WFS',
  links: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Processing', href: '/processing' },
    { label: 'Results', href: '/results' },
    { label: 'History', href: '/history' },
    { label: 'Calibration', href: '/calibration' },
    { label: 'Docs', href: '/documentation' },
  ],
}

export const modules: ModuleConfig[] = [
  { id: 'preprocess', label: 'Preprocessing', status: 'active', description: 'Dark/flat correction, bad pixel masking' },
  { id: 'centroid', label: 'Centroiding', status: 'active', description: 'Hybrid CoG + autocorrelation' },
  { id: 'modal', label: 'Modal Reconstruction', status: 'active', description: 'Zernike SVD with adaptive Tikhonov' },
  { id: 'zonal', label: 'Zonal Reconstruction', status: 'standby', description: 'FRiM iterative PCG' },
  { id: 'turbulence', label: 'Turbulence Char.', status: 'active', description: 'r0, tau0 estimation' },
  { id: 'dm', label: 'DM Actuator Map', status: 'active', description: 'Fried geometry, coupling, hysteresis' },
  { id: 'control', label: 'LQG Control', status: 'active', description: 'Adaptive Kalman filter' },
  { id: 'sensorless', label: 'Sensorless Backup', status: 'standby', description: 'Sophia-SPGD optimization' },
  { id: 'metrics', label: 'Quality Metrics', status: 'active', description: 'Strehl, RMS, latency monitoring' },
]

export const liveMetrics: MetricConfig[] = [
  { id: 'strehl', label: 'Strehl Ratio', value: '0.84', unit: '', target: '>0.80', trend: 'up' },
  { id: 'rms', label: 'RMS WFE', value: '127', unit: 'nm', target: '<λ/10', trend: 'down' },
  { id: 'r0', label: 'Fried Param', value: '18.3', unit: 'cm', target: '>15 cm', trend: 'stable' },
  { id: 'tau0', label: 'Coherence Time', value: '8.2', unit: 'ms', target: '>5 ms', trend: 'up' },
  { id: 'latency', label: 'Loop Latency', value: '2.8', unit: 'ms', target: '<3 ms', trend: 'stable' },
  { id: 'bandwidth', label: 'Bandwidth', value: '347', unit: 'Hz', target: '>50 Hz', trend: 'up' },
]

export const algorithms: AlgorithmConfig[] = [
  {
    id: '1',
    name: 'Adaptive Tikhonov Regularization',
    trl: 8,
    trlLabel: 'TRL 8',
    status: 'deployable',
    description: 'λ adjusted based on real-time r₀ estimate. Prevents noise fitting into high-order modes while maintaining correction bandwidth.',
    source: 'This work',
    year: '2025',
  },
  {
    id: '2',
    name: 'FRiM Iterative Reconstruction',
    trl: 9,
    trlLabel: 'TRL 9',
    status: 'proven',
    description: 'O(N) iterative minimum-variance solver using preconditioned conjugate gradient with fractal operator. 5-10 iterations for any system size.',
    source: 'Thiebaut & Tallon, JOSA A 27, 1046-1059',
    year: '2010',
  },
  {
    id: '3',
    name: 'Layer-Resolved τ₀ Estimation',
    trl: 7,
    trlLabel: 'TRL 7',
    status: 'deployable',
    description: 'Separate ground/high-altitude coherence times using cross-correlation between Zernike mode groups.',
    source: 'This work',
    year: '2025',
  },
  {
    id: '4',
    name: 'Combined Hysteresis Compensation',
    trl: 8,
    trlLabel: 'TRL 8',
    status: 'proven',
    description: 'Feedforward Preisach inverse + feedback SH-WFS residual correction. Reduces open-loop error from 20% RMS to ~3% RMS.',
    source: 'Dubra et al., Opt. Express 13, 9062-9070',
    year: '2005',
  },
  {
    id: '5',
    name: 'Modified LQG with Correlation-Locking',
    trl: 6,
    trlLabel: 'TRL 6',
    status: 'lab-validated',
    description: 'Adaptive Kalman gain via correlation-locking. Maintains stability where standard LQG diverges under non-stationary turbulence.',
    source: 'Deo et al., A&A (2021)',
    year: '2021',
  },
  {
    id: '6',
    name: 'Sophia-SPGD Sensorless Backup',
    trl: 5,
    trlLabel: 'TRL 5',
    status: 'lab-validated',
    description: 'Second-order clipped stochastic optimization. 35-80% speedup over standard SPGD for sensorless AO.',
    source: 'Chen et al. (2025)',
    year: '2025',
  },
  {
    id: '7',
    name: 'Autocorrelation Matched Filter',
    trl: 7,
    trlLabel: 'TRL 7',
    status: 'deployable',
    description: 'Dynamic range expansion 62-184% over WCoG. Eliminates microlens boundary limitations. 33 fps CPU, >1000 fps GPU.',
    source: 'Wang et al., Sensors 22, 6270',
    year: '2022',
  },
  {
    id: '8',
    name: 'Compressive Sensing Reconstruction',
    trl: 4,
    trlLabel: 'TRL 4',
    status: 'research',
    description: 'OMP/CoSAMP sparse reconstruction from 5-20% subsampled SH-WFS data. For future ELT sparse apertures.',
    source: 'Polans et al.',
    year: '2015',
  },
  {
    id: '9',
    name: 'Learned Influence Functions',
    trl: 5,
    trlLabel: 'TRL 5',
    status: 'research',
    description: 'Physics-informed neural operators for DM response prediction and real-time influence matrix updates.',
    source: 'Research direction',
    year: '2025',
  },
]

export const calibrationSteps: CalibrationStep[] = [
  { id: 'dark', label: 'Dark Frame', description: 'Acquire dark frame and compute master dark', status: 'completed' },
  { id: 'flat', label: 'Flat Field', description: 'Uniform illumination flat field correction', status: 'completed' },
  { id: 'badpix', label: 'Bad Pixel Map', description: 'Identify and interpolate bad pixels', status: 'completed' },
  { id: 'influence', label: 'Influence Matrix', description: 'Measure DM actuator influence functions', status: 'in-progress' },
  { id: 'fried', label: 'Fried Geometry', description: 'Align lenslet array to DM actuator grid', status: 'pending' },
  { id: 'hysteresis', label: 'Hysteresis Model', description: 'Identify Preisach model parameters', status: 'pending' },
]

export const processingHistory: ProcessingRun[] = [
  { id: 'run-001', timestamp: '2025-06-25T14:32:00Z', duration: '2.4s', modules: ['preprocess', 'centroid', 'modal', 'control'], strehl: 0.84, rms: 127, r0: 18.3, status: 'success' },
  { id: 'run-002', timestamp: '2025-06-25T14:30:00Z', duration: '2.1s', modules: ['preprocess', 'centroid', 'modal', 'control'], strehl: 0.81, rms: 142, r0: 16.7, status: 'success' },
  { id: 'run-003', timestamp: '2025-06-25T14:28:00Z', duration: '2.6s', modules: ['preprocess', 'centroid', 'zonal', 'control'], strehl: 0.79, rms: 156, r0: 14.2, status: 'warning' },
  { id: 'run-004', timestamp: '2025-06-25T14:26:00Z', duration: '1.9s', modules: ['preprocess', 'centroid', 'modal', 'control'], strehl: 0.85, rms: 118, r0: 19.8, status: 'success' },
  { id: 'run-005', timestamp: '2025-06-25T14:24:00Z', duration: '3.2s', modules: ['preprocess', 'centroid', 'modal', 'dm', 'control'], strehl: 0.76, rms: 168, r0: 12.1, status: 'warning' },
  { id: 'run-006', timestamp: '2025-06-25T14:22:00Z', duration: '2.3s', modules: ['preprocess', 'centroid', 'modal', 'control'], strehl: 0.83, rms: 131, r0: 17.5, status: 'success' },
  { id: 'run-007', timestamp: '2025-06-25T14:20:00Z', duration: '4.1s', modules: ['preprocess', 'centroid', 'sensorless'], strehl: 0.52, rms: 287, r0: 8.3, status: 'error' },
  { id: 'run-008', timestamp: '2025-06-25T14:18:00Z', duration: '2.2s', modules: ['preprocess', 'centroid', 'modal', 'control'], strehl: 0.86, rms: 115, r0: 20.4, status: 'success' },
]

export const references = [
  'Thiebaut, E. & Tallon, M. "Fast minimum variance wavefront reconstruction for extremely large telescopes." JOSA A 27, 1046-1059 (2010).',
  'Dubra, A. "Wavefront sensor and wavefront corrector matching in adaptive optics." Opt. Express 15, 2762-2772 (2007).',
  'Aller-Carpentier, E. et al. "High order test bench for extreme adaptive optics system." Proc. SPIE (2008).',
  'Berdeu, A. et al. "EvWaCo AO bench: optimised phase plate and DM characterisation." Proc. SPIE (2022).',
  'Bifano, T. et al. "Microelectromechanical deformable mirrors." IEEE JSTQE 5, 83-89 (1999).',
  'Dubra, A. et al. "Preisach classical and nonlinear modeling of hysteresis in piezoceramic deformable mirrors." Opt. Express 13, 9062-9070 (2005).',
  'Sengupta, A.R. "Kalman Filtering for Tip-tilt Correction in Adaptive Optics." Res. Notes AAS (2020).',
  'Sivo, G. et al. "MOAO Real-Time LQG implementation on CANARY." AO4ELT (2013).',
  'Deo, V. et al. "A correlation-locking adaptive filtering technique for minimum variance integral control in adaptive optics." A&A (2021).',
  'Basden, A. "The Durham adaptive optics real-time controller." Appl. Opt. 49, 6354-6363 (2010).',
  'Guyon, O. et al. "Adaptive optics real-time control with CACAO software." SPIE (2018).',
  'Wang, W. et al. "A Method Used to Improve the Dynamic Range of Shack-Hartmann Wavefront Sensor." Sensors 22, 6270 (2022).',
  'Chen, Y. et al. "Sophia-SPGD: Second-Order Optimization for Sensorless Adaptive Optics." (2025).',
  'Ma, J. et al. "Hysteresis compensation of piezoelectric deformable mirror." Opt. Commun. 423, 81-87 (2018).',
]

export const performanceTargets = [
  { metric: 'Strehl Ratio (NIR)', definition: 'S = exp(-σ²_WFE)', target: '>0.80' },
  { metric: 'Strehl Ratio (Visible)', definition: 'S = exp(-σ²_WFE)', target: '>0.30' },
  { metric: 'RMS Wavefront Error', definition: 'σ_WFE = sqrt(⟨φ²⟩)', target: '<λ/10' },
  { metric: 'Centroid Precision', definition: 'RMS error in spot position', target: '<0.1 pixel' },
  { metric: 'Loop Bandwidth', definition: 'Frequency where rejection = 0.5', target: '>50 Hz' },
  { metric: 'Total Latency', definition: 'Readout → DM delay', target: '<3 ms' },
]

// Landing Page Configuration
export const landingHeroConfig: LandingHeroConfig = {
  eyebrow: 'SH-WFS Adaptive Optics Control System v2.4',
  titleLines: ['WAVEFRONT', 'RECONSTRUCTION', '& CONTROL'],
  leadText: 'A complete processing pipeline for Shack-Hartmann Wavefront Sensor time-series data, integrating proven techniques (TRL 8-9) with near-term innovations (TRL 5-7) to achieve closed-loop correction bandwidth exceeding 50 Hz.',
  supportingNotes: [
    'FRiM iterative reconstruction achieves O(N) complexity, 5-10 PCG iterations for any system size. Thiebaut & Tallon, JOSA A 27, 1046-1059 (2010).',
    'Modified LQG with correlation-locking handles non-stationary turbulence where standard LQG diverges. Deo et al., A&A (2021).',
    'Autocorrelation matched filter expands dynamic range 62-184% over WCoG centroiding. Wang et al., Sensors 22, 6270 (2022).',
  ],
}

export const landingManifestoConfig: LandingManifestoConfig = {
  videoPath: '/videos/manifesto.mp4',
  text: 'Atmospheric turbulence corrupts wavefronts arriving from distant astronomical sources, limiting angular resolution to ~1 arcsecond regardless of telescope aperture. This system closes the adaptive optics loop in under 3 milliseconds: preprocessing SH-WFS frames through dark/flat correction and hybrid centroiding, reconstructing the wavefront via modal SVD or zonal FRiM iteration, characterizing turbulence parameters r₀ and τ₀ in real time, and commanding a deformable mirror with hysteresis-compensated actuator maps. The result restores diffraction-limited imaging, achieving Strehl ratios above 0.8 in the near-infrared.',
}

export const landingModulesConfig: LandingModulesConfig = {
  sectionLabel: 'Processing Modules',
  items: [
    {
      slug: 'wavefront-sensor',
      name: 'Shack-Hartmann',
      code: 'SH-WFS',
      address: '64 x 64 Subapertures',
      status: 'sCMOS Detector, 347 Hz',
      email: 'Hybrid: CoG + Autocorr.',
      phone: 'TRL 7-9',
      ctaText: 'Configure',
      ctaHref: '/#/dashboard',
      image: '/images/facility-lenslet.jpg',
      utcOffset: 0,
      article: {
        title: 'Wavefront Sensing Pipeline',
        paragraphs: [
          'The Shack-Hartmann Wavefront Sensor divides the incoming wavefront into a grid of subapertures using a microlens array. Each lenslet focuses its portion of the wavefront onto a detector, producing an array of spots.',
          'The hybrid centroiding algorithm combines weighted Center-of-Gravity for standard operation with autocorrelation matched filtering for large aberrations, expanding dynamic range by 62-184%.',
        ],
      },
    },
    {
      slug: 'deformable-mirror',
      name: 'DM Actuator',
      code: 'DM-37',
      address: '37 Hexagonal Actuators',
      status: 'Piezoelectric, 30% Coupling',
      email: 'Preisach Hysteresis Model',
      phone: 'TRL 8',
      ctaText: 'Calibrate',
      ctaHref: '/#/calibration',
      image: '/images/facility-dm.jpg',
      utcOffset: 0,
      article: {
        title: 'Deformable Mirror Control',
        paragraphs: [
          'The deformable mirror uses 37 hexagonally arranged piezoelectric actuators with 30% inter-actuator coupling. Influence functions are modeled as Gaussian with σ_IF = 0.85 actuator pitches.',
          'Hysteresis compensation combines feedforward Preisach inverse modeling with feedback from the WFS, reducing open-loop error from 20% RMS to approximately 3%.',
        ],
      },
    },
    {
      slug: 'reconstruction',
      name: 'Reconstruction',
      code: 'FRiM-PCG',
      address: 'Modal SVD + Zonal FRiM',
      status: 'O(N) Iterative, 5-10 iters',
      email: 'Adaptive Tikhonov λ(r₀)',
      phone: 'TRL 9',
      ctaText: 'Monitor',
      ctaHref: '/#/dashboard',
      image: '/images/facility-observatory.jpg',
      utcOffset: 0,
      article: {
        title: 'Wavefront Reconstruction',
        paragraphs: [
          'Modal reconstruction expands the wavefront in Zernike polynomials with adaptive Tikhonov regularization. The regularization parameter λ is adjusted in real-time based on estimated r₀.',
          'The FRiM (Fractal Iterative Method) achieves O(N) complexity versus O(N³) for direct matrix inversion, enabling ELT-scale systems with 10⁴-10⁵ actuators.',
        ],
      },
    },
    {
      slug: 'control-loop',
      name: 'Control Loop',
      code: 'LQG-ML',
      address: 'Adaptive Kalman Filter',
      status: '347 Hz, 2.8ms Latency',
      email: 'Correlation-Locking Adapt.',
      phone: 'TRL 6',
      ctaText: 'View Results',
      ctaHref: '/#/results',
      image: '/images/facility-lab.jpg',
      utcOffset: 0,
      article: {
        title: 'Real-Time LQG Control',
        paragraphs: [
          'Modified LQG control with correlation-locking adapts the Kalman gain in real-time to handle non-stationary turbulence. Standard LQG diverges when r₀ changes; MLQG maintains stability.',
          'The controller predicts turbulence evolution to compensate loop latency, models vibration as additional states for rejection, and optimally trades measurement noise versus process noise.',
        ],
      },
    },
  ],
}

export const landingObservationConfig: LandingObservationConfig = {
  sectionLabel: 'Live Observation Feed',
  videoPath: '/videos/observation.mp4',
  statusText: 'Closed Loop Active',
  latLabel: 'Strehl',
  lonLabel: 'RMS',
  initialLat: 0.84,
  initialLon: 127,
}

export const landingArchivesConfig: LandingArchivesConfig = {
  sectionLabel: 'Research Archive',
  vaultTitle: 'Open Publication Vault',
  closeText: 'Close Vault',
  items: [
    { src: '/images/archive-wavefront.jpg', label: 'Wavefront Phase Map' },
    { src: '/images/archive-zernike.jpg', label: 'Zernike Mode Decomposition' },
    { src: '/images/archive-turbulence.jpg', label: 'Turbulence Simulation' },
    { src: '/images/archive-psf.jpg', label: 'PSF: Before / After AO' },
  ],
}

export const landingFooterConfig: LandingFooterConfig = {
  copyrightText: 'AO Wavefront Control System 2025',
  statusText: 'SH-WFS v2.4.1 — All Systems Nominal',
}
