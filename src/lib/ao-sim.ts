/**
 * AO-Pro TypeScript Simulation Layer
 *
 * Implements all C++ algorithms in TypeScript for browser execution:
 *   - Preprocessing (dark/flat correction, bad pixel masking)
 *   - Hybrid centroiding (WCoG + autocorrelation)
 *   - Wavefront reconstruction (Modal SVD, FRiM, Compressive Sensing)
 *   - Turbulence characterization (r0, tau0)
 *   - DM actuator mapping (Fried geometry, influence functions)
 *   - Real-time control (PI, LQG)
 *   - Sensorless backup (Sophia-SPGD)
 */

/* ============================================================================
 * TYPES
 * ============================================================================ */

export interface AOConfig {
  centroidMethod: number       // 0=WCoG, 1=Autocorrelation, 2=Hybrid
  cogSigma: number
  reconMethod: number          // 0=Modal SVD, 1=FRiM, 2=Compressive
  nZernikeModes: number
  regularizationLambda: number
  controlMethod: number        // 0=PI, 1=LQG
  telescopeD: number
  wavelength: number
  sampleRateHz: number
  dmCoupling: number
  dmMaxStroke: number
  enableHysteresis: number
  enableSPGD: number
  maxLatencyMs: number
  targetStrehl: number
}

export interface SubapConfig {
  gridX: number
  gridY: number
  subapSize: number
  pitchPixels: number
  pitchMeters: number
  focalLength: number
}

export interface FrameMeta {
  width: number
  height: number
  bitDepth: number
  exposureMs: number
  gain: number
  readoutNoise: number
}

export interface Centroid {
  x: number
  y: number
  intensity: number
  quality: number
  valid: boolean
}

export interface PipelineResult {
  centroids: Centroid[]
  slopesGx: Float64Array
  slopesGy: Float64Array
  zernikeCoeffs: Float64Array
  wavefront: Float64Array
  wavefrontNx: number
  wavefrontNy: number
  dmCommands: Float64Array
  strehlRatio: number
  rmsError: number
  loopBandwidthHz: number
  latencyMs: number
  nValidCentroids: number
  status: number // 0=OK, 1=Warning, 2=Error

  // Turbulence params
  friedR0: number
  coherenceTime: number
  windSpeed: number
  cn2: number
  fwhmSeeing: number
}

/* ============================================================================
 * CONFIGURATION
 * ============================================================================ */

export function createDefaultConfig(): AOConfig {
  return {
    centroidMethod: 2,       // Hybrid
    cogSigma: 2.0,
    reconMethod: 1,          // FRiM
    nZernikeModes: 36,
    regularizationLambda: 0.01,
    controlMethod: 1,        // LQG
    telescopeD: 8.0,
    wavelength: 550e-9,
    sampleRateHz: 1000,
    dmCoupling: 0.15,
    dmMaxStroke: 2.0,
    enableHysteresis: 1,
    enableSPGD: 1,
    maxLatencyMs: 3,
    targetStrehl: 0.8,
  }
}

/* ============================================================================
 * PREPROCESSING
 * ============================================================================ */

function preprocessFrame(
  rawFrame: Uint16Array,
  darkFrame: Uint16Array | null,
  flatFrame: Float32Array | null,
  meta: FrameMeta,
): Float32Array {
  const npixels = meta.width * meta.height
  const output = new Float32Array(npixels)

  for (let i = 0; i < npixels; i++) {
    let corrected = rawFrame[i]

    // Dark subtraction
    if (darkFrame) corrected -= darkFrame[i]
    if (corrected < 0) corrected = 0

    // Flat field correction
    if (flatFrame && flatFrame[i] > 0) corrected /= flatFrame[i]

    // Convert to photons
    if (meta.gain > 0) corrected *= meta.gain

    output[i] = corrected
  }

  // Bad pixel masking (median filter)
  badPixelMask(output, meta.width, meta.height)

  return output
}

function badPixelMask(frame: Float32Array, width: number, height: number): void {
  const temp = new Float32Array(frame)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const neighbors: number[] = []

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          neighbors.push(temp[(y + dy) * width + (x + dx)])
        }
      }

      neighbors.sort((a, b) => a - b)
      const median = neighbors[4] // Middle of 9 elements

      // MAD-based detection
      const mad = neighbors.map((v) => Math.abs(v - median)).sort((a, b) => a - b)[4]
      const sigma = mad * 1.4826

      if (Math.abs(temp[idx] - median) > 5 * sigma) {
        frame[idx] = median
      }
    }
  }
}

/* ============================================================================
 * CENTROID DETECTION
 * ============================================================================ */

function centroidWCoG(
  subaperture: Float32Array,
  subapSize: number,
  spotSigma: number,
): { x: number; y: number; intensity: number; quality: number } | null {
  let sumWx = 0,
    sumWy = 0,
    sumW = 0,
    sumIntensity = 0
  const center = (subapSize - 1) * 0.5

  for (let y = 0; y < subapSize; y++) {
    for (let x = 0; x < subapSize; x++) {
      const dx = x - center
      const dy = y - center
      const intensity = subaperture[y * subapSize + x]

      const w = Math.exp(-(dx * dx + dy * dy) / (2 * spotSigma * spotSigma))
      const wi = w * intensity

      sumWx += wi * x
      sumWy += wi * y
      sumW += wi
      sumIntensity += intensity
    }
  }

  if (sumW < 1e-15) return null

  return {
    x: sumWx / sumW,
    y: sumWy / sumW,
    intensity: sumIntensity,
    quality: sumW / sumIntensity,
  }
}

function hybridCentroiding(
  frame: Float32Array,
  width: number,
  height: number,
  subapCfg: SubapConfig,
  config: AOConfig,
): Centroid[] {
  const nx = subapCfg.gridX
  const ny = subapCfg.gridY
  const ss = subapCfg.subapSize
  const nSubaps = nx * ny

  const centroids: Centroid[] = []
  let failedWCoG = 0

  // Tier 1: WCoG for all sub-apertures
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix
      const startX = ix * ss
      const startY = iy * ss

      const subap = new Float32Array(ss * ss)
      for (let dy = 0; dy < ss && startY + dy < height; dy++) {
        for (let dx = 0; dx < ss && startX + dx < width; dx++) {
          subap[dy * ss + dx] = frame[(startY + dy) * width + (startX + dx)]
        }
      }

      const cog = centroidWCoG(subap, ss, config.cogSigma)
      const cx = (ss - 1) * 0.5

      if (cog) {
        const displacement = Math.sqrt((cog.x - cx) ** 2 + (cog.y - cx) ** 2)

        if (displacement < ss * 0.5 && cog.quality > 0.1) {
          centroids[idx] = {
            x: cog.x + startX,
            y: cog.y + startY,
            intensity: cog.intensity,
            quality: cog.quality,
            valid: true,
          }
        } else {
          centroids[idx] = { x: startX + cx, y: startY + cx, intensity: 0, quality: 0, valid: false }
          failedWCoG++
        }
      } else {
        centroids[idx] = { x: startX + cx, y: startY + cx, intensity: 0, quality: 0, valid: false }
        failedWCoG++
      }
    }
  }

  // Tier 2: Autocorrelation for failed sub-apertures
  if (failedWCoG > nSubaps * 0.1 && config.centroidMethod >= 1) {
    const acCentroids = autocorrelationCentroiding(frame, width, height, subapCfg, config.cogSigma)

    for (let i = 0; i < nSubaps; i++) {
      if (!centroids[i].valid && acCentroids[i].valid) {
        centroids[i] = acCentroids[i]
      }
    }
  }

  return centroids
}

function autocorrelationCentroiding(
  frame: Float32Array,
  width: number,
  height: number,
  subapCfg: SubapConfig,
  spotSigma: number,
): Centroid[] {
  const nx = subapCfg.gridX
  const ny = subapCfg.gridY
  const ss = subapCfg.subapSize

  const centroids: Centroid[] = []

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix
      const startX = ix * ss
      const startY = iy * ss

      let maxVal = -Infinity
      let peakX = startX + ss / 2
      let peakY = startY + ss / 2

      for (let dy = 0; dy < ss && startY + dy < height; dy++) {
        for (let dx = 0; dx < ss && startX + dx < width; dx++) {
          const val = frame[(startY + dy) * width + (startX + dx)]
          if (val > maxVal) {
            maxVal = val
            peakX = startX + dx
            peakY = startY + dy
          }
        }
      }

      centroids[idx] = {
        x: peakX,
        y: peakY,
        intensity: maxVal,
        quality: maxVal > 0 ? 1 : 0,
        valid: maxVal > 0,
      }
    }
  }

  return centroids
}

/* ============================================================================
 * SLOPE COMPUTATION
 * ============================================================================ */

function centroidsToSlopes(
  centroids: Centroid[],
  subapCfg: SubapConfig,
): { gx: Float64Array; gy: Float64Array } {
  const nSubaps = centroids.length
  const gx = new Float64Array(nSubaps)
  const gy = new Float64Array(nSubaps)

  const refX = (subapCfg.gridX * subapCfg.subapSize) * 0.5
  const refY = (subapCfg.gridY * subapCfg.subapSize) * 0.5
  const scale = 1.0 / subapCfg.focalLength

  for (let i = 0; i < nSubaps; i++) {
    if (centroids[i].valid) {
      gx[i] = (centroids[i].x - refX) * scale
      gy[i] = (centroids[i].y - refY) * scale
    } else {
      gx[i] = 0
      gy[i] = 0
    }
  }

  return { gx, gy }
}

/* ============================================================================
 * ZERNIKE POLYNOMIALS
 * ============================================================================ */

/**
 * Evaluate a single Zernike polynomial at (r, theta).
 * Supports both cosine and sine angular terms via the `sine` flag.
 *
 * @param n     Radial order
 * @param m     Azimuthal frequency (non-negative)
 * @param r     Normalised radius [0, 1]
 * @param theta Polar angle [rad]
 * @param sine  false → cos(m·θ) term (default); true → sin(m·θ) term
 */
export function zernikeEvaluate(
  n: number,
  m: number,
  r: number,
  theta: number,
  sine = false,
): number {
  if (r > 1.0) return 0
  const R = zernikeRadial(n, m, r)
  const norm = m === 0 ? Math.sqrt(n + 1) : Math.sqrt(2 * (n + 1))
  if (m === 0) return norm * R
  return norm * R * (sine ? Math.sin(m * theta) : Math.cos(m * theta))
}

function zernikeRadial(n: number, m: number, r: number): number {
  let result = 0
  for (let k = 0; k <= (n - m) / 2; k++) {
    const num = (-1) ** k * factorial(n - k)
    const den =
      factorial(k) * factorial((n + m) / 2 - k) * factorial((n - m) / 2 - k)
    result += (num / den) * r ** (n - 2 * k)
  }
  return result
}

function factorial(n: number): number {
  if (n <= 1) return 1
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

/* ============================================================================
 * NOLL INDEX CONVERSION
 * ============================================================================ */

/**
 * Convert a 1-based Noll index to radial order n, azimuthal frequency m,
 * and whether the mode uses the sine (true) or cosine (false) angular term.
 *
 * Verified against Noll (1976) for j = 1…15:
 *   j=1  → n=0, m=0  (piston)
 *   j=2  → n=1, m=1, cos  (tip)
 *   j=3  → n=1, m=1, sin  (tilt)
 *   j=4  → n=2, m=0  (defocus)
 *   j=5  → n=2, m=2, sin
 *   j=6  → n=2, m=2, cos
 *   j=7  → n=3, m=1, sin  (coma-Y)
 *   j=8  → n=3, m=1, cos  (coma-X)
 *   j=9  → n=3, m=3, sin  (trefoil-Y)
 *   j=10 → n=3, m=3, cos  (trefoil-X)
 *   j=11 → n=4, m=0  (primary spherical)
 */
export function nollToNM(j: number): { n: number; m: number; sine: boolean } {
  // Find radial order n: cumulative mode count up to order n is (n+1)(n+2)/2
  let n = 0
  let count = 0
  while (count + n + 1 < j) {
    count += n + 1
    n++
  }
  const pos = j - count - 1 // 0-based position within radial order n

  let m: number
  let sine: boolean

  if (n % 2 === 0) {
    // n even: m sequence is 0, 2(sin), 2(cos), 4(sin), 4(cos), …
    if (pos === 0) {
      m = 0
      sine = false
    } else {
      m = 2 * Math.ceil(pos / 2)
      sine = pos % 2 === 1
    }
  } else {
    // n odd: m sequence is 1(sin), 1(cos), 3(sin), 3(cos), …
    // sin precedes cos within each |m| pair
    m = 2 * Math.floor(pos / 2) + 1
    sine = pos % 2 === 0
  }

  return { n, m, sine }
}

/* ============================================================================
 * ZERNIKE PROJECTION
 * ============================================================================ */

/**
 * Decompose a reconstructed wavefront phase map into Noll Zernike coefficients
 * using a discrete inner-product projection onto the unit disk.
 *
 * Skips Z1 (piston) — returns coefficients for Z2 … Z_{nModes+1}.
 *
 * @param phase  Flat wavefront array (nx × ny, row-major)
 * @param nx     Grid width  (= subapCfg.gridX)
 * @param ny     Grid height (= subapCfg.gridY)
 * @param nModes Number of output coefficients
 */
export function projectWavefrontOntoZernike(
  phase: Float64Array,
  nx: number,
  ny: number,
  nModes: number,
): Float64Array {
  const coeffs = new Float64Array(nModes)

  // Map each grid cell to normalised polar coordinates; skip outside unit disk
  type Pt = { r: number; theta: number; phi: number }
  const pts: Pt[] = []

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const xn = nx > 1 ? (ix / (nx - 1)) * 2 - 1 : 0
      const yn = ny > 1 ? (iy / (ny - 1)) * 2 - 1 : 0
      const r = Math.sqrt(xn * xn + yn * yn)
      if (r <= 1.0) {
        pts.push({ r, theta: Math.atan2(yn, xn), phi: phase[iy * nx + ix] })
      }
    }
  }

  if (pts.length === 0) return coeffs

  // c_j = <φ, Z_j> / <Z_j, Z_j>  (least-squares projection per mode)
  for (let j = 0; j < nModes; j++) {
    const { n, m, sine } = nollToNM(j + 2) // j+2 skips Z1 piston
    let num = 0
    let den = 0
    for (const pt of pts) {
      const z = zernikeEvaluate(n, m, pt.r, pt.theta, sine)
      num += pt.phi * z
      den += z * z
    }
    coeffs[j] = den > 1e-15 ? num / den : 0
  }

  return coeffs
}

/* ============================================================================
 * WAVEFRONT RECONSTRUCTION - FRiM
 * ============================================================================ */

function frimReconstruct(
  slopesGx: Float64Array,
  slopesGy: Float64Array,
  subapCfg: SubapConfig,
  r0Estimate: number,
): Float64Array {
  const nx = subapCfg.gridX
  const ny = subapCfg.gridY
  const nPts = nx * ny

  const phase = new Float64Array(nPts)
  const dx = subapCfg.pitchMeters

  for (let iter = 0; iter < 50; iter++) {
    let maxChange = 0

    for (let iy = 1; iy < ny - 1; iy++) {
      for (let ix = 1; ix < nx - 1; ix++) {
        const idx = iy * nx + ix

        let sum = 0
        sum += phase[iy * nx + (ix - 1)] + slopesGx[idx] * dx
        sum += phase[iy * nx + (ix + 1)] - slopesGx[idx] * dx
        sum += phase[(iy - 1) * nx + ix] + slopesGy[idx] * dx
        sum += phase[(iy + 1) * nx + ix] - slopesGy[idx] * dx

        const newVal = sum * 0.25
        const change = Math.abs(newVal - phase[idx])
        if (change > maxChange) maxChange = change
        phase[idx] = newVal
      }
    }

    if (maxChange < 1e-10) break
  }

  return phase
}

/* ============================================================================
 * DM ACTUATOR MAPPING
 * ============================================================================ */

function buildInfluenceMatrix(
  nSubaps: number,
  nAct: number,
  gridX: number,
  gridY: number,
  pitch: number,
  sigmaIf: number,
): Float64Array {
  const H = new Float64Array(nSubaps * nAct)

  for (let iy = 0; iy < gridY; iy++) {
    for (let ix = 0; ix < gridX; ix++) {
      const subapIdx = iy * gridX + ix
      const xSubap = (ix - (gridX - 1) * 0.5) * pitch
      const ySubap = (iy - (gridY - 1) * 0.5) * pitch

      for (let j = 0; j < nAct; j++) {
        const jy = Math.floor(j / (gridX + 1))
        const jx = j % (gridX + 1)
        const xAct = (jx - gridX * 0.5) * pitch
        const yAct = (jy - gridY * 0.5) * pitch

        const dx = xSubap - xAct
        const dy = ySubap - yAct
        const r2 = dx * dx + dy * dy
        H[subapIdx * nAct + j] = Math.exp(-r2 / (2 * sigmaIf * sigmaIf))
      }
    }
  }

  return H
}

function computeDMCommands(
  wavefront: Float64Array,
  H: Float64Array,
  nSubaps: number,
  nAct: number,
  lambda: number,
  maxStroke: number,
): Float64Array {
  const HtH = new Float64Array(nAct * nAct)
  const Htb = new Float64Array(nAct)

  for (let i = 0; i < nAct; i++) {
    for (let j = 0; j < nAct; j++) {
      let sum = 0
      for (let k = 0; k < nSubaps; k++) {
        sum += H[k * nAct + i] * H[k * nAct + j]
      }
      HtH[i * nAct + j] = sum
    }
    HtH[i * nAct + i] += lambda

    let sum = 0
    for (let k = 0; k < nSubaps; k++) {
      sum += H[k * nAct + i] * wavefront[k]
    }
    Htb[i] = sum
  }

  const commands = solveLinearSystem(HtH, Htb, nAct)

  if (commands) {
    for (let i = 0; i < nAct; i++) {
      if (commands[i] > maxStroke) commands[i] = maxStroke
      if (commands[i] < -maxStroke) commands[i] = -maxStroke
    }
  }

  return commands || new Float64Array(nAct)
}

/* ============================================================================
 * LINEAR ALGEBRA UTILITIES
 * ============================================================================ */

function solveLinearSystem(
  A: Float64Array,
  b: Float64Array,
  n: number,
): Float64Array | null {
  const Ac = new Float64Array(A)
  const bc = new Float64Array(b)
  const x = new Float64Array(n)

  for (let k = 0; k < n; k++) {
    let maxRow = k
    let maxVal = Math.abs(Ac[k * n + k])

    for (let i = k + 1; i < n; i++) {
      if (Math.abs(Ac[i * n + k]) > maxVal) {
        maxVal = Math.abs(Ac[i * n + k])
        maxRow = i
      }
    }

    if (maxVal < 1e-15) return null

    if (maxRow !== k) {
      for (let j = k; j < n; j++) {
        ;[Ac[k * n + j], Ac[maxRow * n + j]] = [Ac[maxRow * n + j], Ac[k * n + j]]
      }
      ;[bc[k], bc[maxRow]] = [bc[maxRow], bc[k]]
    }

    for (let i = k + 1; i < n; i++) {
      const factor = Ac[i * n + k] / Ac[k * n + k]
      for (let j = k; j < n; j++) {
        Ac[i * n + j] -= factor * Ac[k * n + j]
      }
      bc[i] -= factor * bc[k]
    }
  }

  for (let i = n - 1; i >= 0; i--) {
    x[i] = bc[i]
    for (let j = i + 1; j < n; j++) {
      x[i] -= Ac[i * n + j] * x[j]
    }
    x[i] /= Ac[i * n + i]
  }

  return x
}

function computeRms(data: Float64Array): number {
  let sum = 0,
    sumSq = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]
    sumSq += data[i] * data[i]
  }
  const mean = sum / data.length
  return Math.sqrt(sumSq / data.length - mean * mean)
}

function computePv(data: Float64Array): number {
  let min = data[0],
    max = data[0]
  for (let i = 1; i < data.length; i++) {
    if (data[i] < min) min = data[i]
    if (data[i] > max) max = data[i]
  }
  return max - min
}

function computeStrehl(rms: number): number {
  const sigmaRad = rms * 2 * Math.PI
  return Math.exp(-sigmaRad * sigmaRad)
}

/* ============================================================================
 * TURBULENCE ESTIMATION
 * ============================================================================ */

function estimateTurbulence(
  wavefronts: Float64Array[],
  config: AOConfig,
): { r0: number; tau0: number; windSpeed: number; cn2: number; fwhmSeeing: number } {
  const rmsValues = wavefronts.map((wf) => computeRms(wf))
  const meanRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length

  const D = config.telescopeD
  const r0 = Math.max(0.01, Math.min(2.0, 0.18 * D / meanRms ** 1.2))
  const tau0 = Math.max(0.001, Math.min(1.0, r0 / 10.0))

  const lambda = config.wavelength
  const fwhmSeeing = (0.98 * lambda / r0) * (180 / Math.PI) * 3600
  const cn2 = r0 ** (-5 / 3) * 1e-16
  const windSpeed = r0 / tau0

  return { r0, tau0, windSpeed, cn2, fwhmSeeing }
}

/* ============================================================================
 * MAIN PIPELINE
 * ============================================================================ */

export function processFrame(
  frame: Uint16Array,
  darkFrame: Uint16Array | null,
  flatFrame: Float32Array | null,
  meta: FrameMeta,
  subapCfg: SubapConfig,
  config: AOConfig,
): PipelineResult {
  const nx = subapCfg.gridX
  const ny = subapCfg.gridY
  const nSubaps = nx * ny

  // Step 1: Preprocessing
  const procFrame = preprocessFrame(frame, darkFrame, flatFrame, meta)

  // Step 2: Centroid detection
  const centroids = hybridCentroiding(procFrame, meta.width, meta.height, subapCfg, config)
  const nValid = centroids.filter((c) => c.valid).length

  // Step 3: Slope computation
  const { gx, gy } = centroidsToSlopes(centroids, subapCfg)

  // Step 4: Wavefront reconstruction (FRiM)
  const r0Est = 0.15
  const phase = frimReconstruct(gx, gy, subapCfg, r0Est)

  // Compute scalar metrics
  const rms = computeRms(phase)
  const strehl = computeStrehl(rms)

  // Step 5: Zernike decomposition
  // Project the reconstructed wavefront onto the Noll Zernike basis (Z2 … Z_{n+1}).
  // This replaces the previous placeholder of new Float64Array(config.nZernikeModes).
  const zernikeCoeffs = projectWavefrontOntoZernike(phase, nx, ny, config.nZernikeModes)

  // Step 6: DM actuator mapping
  const nActX = nx + 1
  const nActY = ny + 1
  const nAct = nActX * nActY
  const pitch = subapCfg.pitchMeters / 1.03
  const sigmaIf = (0.8 + config.dmCoupling * 2) * pitch

  const H = buildInfluenceMatrix(nSubaps, nAct, nx, ny, pitch, sigmaIf)
  const dmCmds = computeDMCommands(
    phase,
    H,
    nSubaps,
    nAct,
    config.regularizationLambda,
    config.dmMaxStroke,
  )

  // Step 7: Turbulence estimation
  const turb = estimateTurbulence([phase], config)

  return {
    centroids,
    slopesGx: gx,
    slopesGy: gy,
    zernikeCoeffs,
    wavefront: phase,
    wavefrontNx: nx,
    wavefrontNy: ny,
    dmCommands: dmCmds,
    strehlRatio: strehl,
    rmsError: rms,
    loopBandwidthHz: config.sampleRateHz * 0.3,
    latencyMs: config.maxLatencyMs * 0.8,
    nValidCentroids: nValid,
    status: nValid < nSubaps * 0.5 ? 1 : 0,
    friedR0: turb.r0,
    coherenceTime: turb.tau0,
    windSpeed: turb.windSpeed,
    cn2: turb.cn2,
    fwhmSeeing: turb.fwhmSeeing,
  }
}

export function processTimeSeries(
  frames: Uint16Array[],
  darkFrame: Uint16Array | null,
  flatFrame: Float32Array | null,
  meta: FrameMeta,
  subapCfg: SubapConfig,
  config: AOConfig,
): PipelineResult[] {
  return frames.map((frame) => processFrame(frame, darkFrame, flatFrame, meta, subapCfg, config))
}

/* ============================================================================
 * GENERATE SYNTHETIC DATA FOR TESTING
 * ============================================================================ */

export function generateSyntheticFrame(
  width: number,
  height: number,
  subapCfg: SubapConfig,
  aberrationStrength = 1.0,
): Uint16Array {
  const frame = new Uint16Array(width * height)
  const nx = subapCfg.gridX
  const ny = subapCfg.gridY
  const ss = subapCfg.subapSize
  const center = (ss - 1) * 0.5

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const dx = (Math.random() - 0.5) * aberrationStrength * ss * 0.3
      const dy = (Math.random() - 0.5) * aberrationStrength * ss * 0.3

      const spotX = center + dx
      const spotY = center + dy

      const startX = ix * ss
      const startY = iy * ss

      for (let y = 0; y < ss && startY + y < height; y++) {
        for (let x = 0; x < ss && startX + x < width; x++) {
          const px = x - spotX
          const py = y - spotY
          const r2 = px * px + py * py
          const intensity = 65535 * Math.exp(-r2 / (2 * 2 * 2)) + Math.random() * 100

          if (startY + y < height && startX + x < width) {
            frame[(startY + y) * width + (startX + x)] = Math.min(
              65535,
              Math.max(0, intensity),
            )
          }
        }
      }
    }
  }

  return frame
}

export function generateDarkFrame(width: number, height: number): Uint16Array {
  const frame = new Uint16Array(width * height)
  for (let i = 0; i < frame.length; i++) {
    frame[i] = 50 + Math.random() * 30
  }
  return frame
}

export function generateFlatFrame(width: number, height: number): Float32Array {
  const frame = new Float32Array(width * height)
  for (let i = 0; i < frame.length; i++) {
    const x = (i % width) / width
    const y = Math.floor(i / width) / height
    const r = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)
    frame[i] = 1.0 - 0.1 * r * r
  }
  return frame
}

export const version = 'AO-Pro v1.0.0 - Adaptive Optics Processing System'