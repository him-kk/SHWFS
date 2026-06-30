import { useEffect, useRef } from 'react'

interface WavefrontCanvasProps {
  width?: number
  height?: number
  resolution?: number
  animated?: boolean
  // Optional real wavefront data — when provided (and shape matches), this is sampled directly
  // instead of the procedural Zernike pattern below. Ready for whenever a backend endpoint
  // exposes the actual per-subaperture wavefront for the latest frame/run.
  phase?: Float64Array | number[] | null
  phaseNx?: number
  phaseNy?: number
  // Optional real system metrics — when raw phase data isn't available, these nudge the
  // procedural pattern so it reflects actual system performance instead of being fully synthetic.
  liveStrehl?: number | null
  liveRmsNm?: number | null
}

interface LiveData {
  phase?: Float64Array | number[] | null
  phaseNx?: number
  phaseNy?: number
  liveStrehl?: number | null
  liveRmsNm?: number | null
}

// Diverging blue→orange colour scale — same palette used by the DM Actuator map and the
// Results Viewer's residual heatmap, so every wavefront-style panel in the app reads consistently.
function divergingColor(t: number): string {
  const c = Math.max(-1, Math.min(1, t))
  if (c < 0) {
    const a = Math.abs(c)
    return `rgb(${Math.round(120 - a * 40)},${Math.round(160 - a * 40)},${Math.round(220 - a * 20)})`
  }
  return `rgb(220,${Math.round(160 - c * 60)},${Math.round(100 - c * 40)})`
}

export default function WavefrontCanvas({
  width: propWidth,
  height: propHeight,
  resolution = 64,
  animated = true,
  phase = null,
  phaseNx,
  phaseNy,
  liveStrehl = null,
  liveRmsNm = null,
}: WavefrontCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Live data lives in a ref so new metrics/frames update the drawing without restarting the
  // canvas/resize setup below (which only needs to run when layout-affecting props change).
  const liveDataRef = useRef<LiveData>({})

  useEffect(() => {
    liveDataRef.current = { phase, phaseNx, phaseNy, liveStrehl, liveRmsNm }
  }, [phase, phaseNx, phaseNy, liveStrehl, liveRmsNm])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let time = 0
    let rafId = 0

    const resize = () => {
      width = propWidth || container.offsetWidth
      height = propHeight || container.offsetHeight

      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    const zernike = (x: number, y: number, n: number, m: number): number => {
      const r2 = x * x + y * y
      if (r2 > 1.0) return 0
      const r = Math.sqrt(r2)
      if (n === 2 && m === 0) return 2 * r2 - 1
      if (n === 2 && m === 2) return r * r * Math.cos(2 * Math.atan2(y, x))
      if (n === 3 && m === 1) return (3 * r2 - 2) * r * Math.cos(Math.atan2(y, x))
      if (n === 4 && m === 0) return 6 * r2 * r2 - 6 * r2 + 1
      if (n === 3 && m === 3) return r * r * r * Math.cos(3 * Math.atan2(y, x))
      return Math.sin(x * 3 + time) * Math.cos(y * 2 + time * 0.7) * 0.3
    }

    // turbulence: amplitude multiplier (1 = original behavior, driven by real RMS when given)
    // hi: high-order term multiplier (1 = original behavior, driven by real Strehl when given —
    //     a well-corrected loop (high Strehl) should show calmer high-order structure)
    const kolmogorovPhase = (x: number, y: number, turbulence: number, hi: number): number => {
      let phase = 0
      phase += 0.4 * zernike(x, y, 2, 0) * turbulence
      phase += 0.25 * zernike(x, y, 2, 2) * Math.sin(time * 0.3) * turbulence
      phase += 0.15 * zernike(x, y, 3, 1) * Math.cos(time * 0.5) * turbulence * hi
      phase += 0.1 * zernike(x, y, 4, 0) * Math.sin(time * 0.2) * turbulence * hi
      phase += 0.08 * zernike(x, y, 3, 3) * Math.cos(time * 0.4) * turbulence * hi
      return phase
    }

    const draw = () => {
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, width, height)

      if (animated) time += 0.02

      const live = liveDataRef.current
      const hasRealPhase = !!(
        live.phase && live.phaseNx && live.phaseNy &&
        live.phase.length === live.phaseNx * live.phaseNy
      )
      let dataMin = 0, dataMax = 1
      if (hasRealPhase) {
        const arr = Array.from(live.phase as ArrayLike<number>)
        dataMin = Math.min(...arr)
        dataMax = Math.max(...arr)
        if (dataMax - dataMin < 1e-9) dataMax = dataMin + 1
      }
      const turbulence = live.liveRmsNm != null ? Math.min(2.5, Math.max(0.4, live.liveRmsNm / 120)) : 1
      const hi = live.liveStrehl != null ? Math.min(1.4, Math.max(0.3, 1.4 - live.liveStrehl)) : 1

      const cols = resolution
      const cellW = width / cols
      const cellH = cellW * 1.15
      const rows = Math.ceil(height / cellH)

      const centerX = cols / 2
      const centerY = rows / 2
      const radius = Math.min(cols, rows) / 2.2

      // First pass (procedural mode only): find the actual min/max of this frame's phase values
      // so the colour scale always spans real contrast, instead of guessing a fixed range.
      let procMin = Infinity, procMax = -Infinity
      if (!hasRealPhase) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const dx = c - centerX, dy = r - centerY
            if (Math.sqrt(dx * dx + dy * dy) > radius) continue
            const v = kolmogorovPhase(dx / radius, dy / radius, turbulence, hi)
            if (v < procMin) procMin = v
            if (v > procMax) procMax = v
          }
        }
        if (procMax - procMin < 1e-9) { procMin -= 0.5; procMax += 0.5 }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cellW
          const y = r * cellH

          const dx = c - centerX
          const dy = r - centerY
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist > radius) continue

          const nx = dx / radius
          const ny = dy / radius

          // t is normalised to [-1, 1] for the diverging colour scale, regardless of source.
          let t: number
          if (hasRealPhase) {
            const srcX = Math.min(live.phaseNx! - 1, Math.max(0, Math.round((nx * 0.5 + 0.5) * (live.phaseNx! - 1))))
            const srcY = Math.min(live.phaseNy! - 1, Math.max(0, Math.round((ny * 0.5 + 0.5) * (live.phaseNy! - 1))))
            const v = (live.phase as ArrayLike<number>)[srcY * live.phaseNx! + srcX] ?? 0
            t = ((v - dataMin) / (dataMax - dataMin)) * 2 - 1
          } else {
            const v = kolmogorovPhase(nx, ny, turbulence, hi)
            t = ((v - procMin) / (procMax - procMin)) * 2 - 1
          }

          ctx.fillStyle = divergingColor(t)
          ctx.fillRect(x, y, Math.ceil(cellW), Math.ceil(cellH))
        }
      }

      // Draw pupil circle
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(
        width / 2,
        height / 2,
        (radius * cellW) / 2,
        (radius * cellH) / 2,
        0,
        0,
        Math.PI * 2
      )
      ctx.stroke()

      // Labels
      ctx.font = '9px "IBM Plex Mono", monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.textAlign = 'left'
      if (hasRealPhase) {
        ctx.fillText('Live Wavefront (real data)', 12, height - 12)
      } else if (live.liveStrehl != null) {
        ctx.fillText(`Live · Strehl ${live.liveStrehl.toFixed(3)}`, 12, height - 12)
      } else {
        ctx.fillText('Wavefront Phase Map', 12, height - 12)
      }
      ctx.textAlign = 'right'
      ctx.fillText(`${resolution}×${resolution} subapertures`, width - 12, height - 12)

      rafId = requestAnimationFrame(draw)
    }

    document.fonts.ready.then(() => {
      resize()
      draw()
    })

    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [propWidth, propHeight, resolution, animated])

  return (
    <div
      ref={containerRef}
      style={{
        width: propWidth ? `${propWidth}px` : '100%',
        height: propHeight ? `${propHeight}px` : '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#0A0A0A',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  )
}