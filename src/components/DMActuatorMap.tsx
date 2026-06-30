import { useEffect, useRef } from 'react'

interface DMActuatorMapProps {
  width?: number
  height?: number
  actuatorCount?: number
  animated?: boolean
  // Optional real DM commands — when provided (and shape matches), actuators are laid out on
  // this exact nx×ny grid and colored by the real issued command instead of a procedural wave.
  // Ready for whenever a backend endpoint exposes the actual per-actuator commands.
  commands?: Float64Array | number[] | null
  commandsNx?: number
  commandsNy?: number
  // Optional real system metrics — when raw commands aren't available, these nudge the
  // procedural pattern so it reflects actual system performance instead of being fully synthetic.
  liveStrehl?: number | null
  liveRmsNm?: number | null
}

interface LiveData {
  commands?: Float64Array | number[] | null
  commandsNx?: number
  commandsNy?: number
  liveStrehl?: number | null
  liveRmsNm?: number | null
}

// Diverging blue→orange colour scale — same palette used by WavefrontCanvas and the Results
// Viewer's residual heatmap, so every wavefront/DM panel in the app reads consistently.
// (blue = pulled in / negative stroke, orange = pushed out / positive stroke)
function divergingColor(t: number): string {
  const c = Math.max(-1, Math.min(1, t))
  if (c < 0) {
    const a = Math.abs(c)
    return `rgb(${Math.round(120 - a * 40)},${Math.round(160 - a * 40)},${Math.round(220 - a * 20)})`
  }
  return `rgb(220,${Math.round(160 - c * 60)},${Math.round(100 - c * 40)})`
}

export default function DMActuatorMap({
  width: propWidth,
  height: propHeight,
  actuatorCount = 37,
  animated = true,
  commands = null,
  commandsNx,
  commandsNy,
  liveStrehl = null,
  liveRmsNm = null,
}: DMActuatorMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Live data lives in a ref so new metrics/frames update the drawing without restarting the
  // canvas/resize setup below (which only needs to run when layout-affecting props change).
  const liveDataRef = useRef<LiveData>({})

  useEffect(() => {
    liveDataRef.current = { commands, commandsNx, commandsNy, liveStrehl, liveRmsNm }
  }, [commands, commandsNx, commandsNy, liveStrehl, liveRmsNm])

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

    const draw = () => {
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, width, height)

      if (animated) time += 0.015

      const live = liveDataRef.current
      const hasRealCommands = !!(
        live.commands && live.commandsNx && live.commandsNy &&
        live.commands.length === live.commandsNx * live.commandsNy
      )
      // turbulence/effort: amplitude multipliers (1 = original behavior) driven by real RMS/Strehl
      // when raw per-actuator commands aren't available
      const turbulence = live.liveRmsNm != null ? Math.min(2.5, Math.max(0.4, live.liveRmsNm / 120)) : 1
      const effort = live.liveStrehl != null ? Math.min(1.4, Math.max(0.3, 1.4 - live.liveStrehl)) : 1

      const gridSize = Math.ceil(Math.sqrt(actuatorCount))
      const centerX = width / 2
      const centerY = height / 2
      const spacing = Math.min(width, height) / (gridSize + 1)
      const maxRadius = Math.min(width, height) * 0.42

      const actuators: { x: number; y: number; stroke: number }[] = []

      if (hasRealCommands) {
        // Real per-actuator commands: lay them out on their actual nx×ny grid
        const gnx = live.commandsNx!
        const gny = live.commandsNy!
        const cmdArr = live.commands as ArrayLike<number>
        const maxCmd = Math.max(...Array.from(cmdArr).map((v) => Math.abs(v))) || 1
        const cellSize = (Math.min(width, height) * 0.84) / Math.max(gnx, gny)
        for (let row = 0; row < gny; row++) {
          for (let col = 0; col < gnx; col++) {
            const ax = centerX + (col - gnx / 2 + 0.5) * cellSize
            const ay = centerY + (row - gny / 2 + 0.5) * cellSize
            const cmd = cmdArr[row * gnx + col] ?? 0
            actuators.push({ x: ax, y: ay, stroke: cmd / maxCmd })
          }
        }
      } else {
        // Procedural hexagonal actuator grid, amplitude nudged by real strehl/rms when available
        for (let row = 0; row < gridSize; row++) {
          for (let col = 0; col < gridSize; col++) {
            const offsetX = row % 2 === 0 ? 0 : spacing * 0.5
            const ax = centerX + (col - gridSize / 2) * spacing + offsetX
            const ay = centerY + (row - gridSize / 2) * spacing * 0.866

            const dist = Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2)
            if (dist > maxRadius) continue

            const stroke =
              (Math.sin(time + row * 0.5 + col * 0.3) * 0.4 +
                Math.cos(time * 0.7 + col * 0.4) * 0.3) * turbulence * effort

            actuators.push({ x: ax, y: ay, stroke })
          }
        }
      }

      // Normalise stroke values to [-1, 1] across THIS frame's actuators so the colour scale
      // always uses real contrast — a calm frame (small strokes) won't get artificially stretched
      // to look as "busy" as an aggressive-correction frame.
      const maxAbsStroke = actuators.length
        ? Math.max(...actuators.map((a) => Math.abs(a.stroke)), 1e-9)
        : 1

      // Draw coupling lines first
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 0.5
      for (let i = 0; i < actuators.length; i++) {
        for (let j = i + 1; j < actuators.length; j++) {
          const d = Math.sqrt(
            (actuators[i].x - actuators[j].x) ** 2 +
              (actuators[i].y - actuators[j].y) ** 2
          )
          if (d < spacing * 1.2) {
            ctx.beginPath()
            ctx.moveTo(actuators[i].x, actuators[i].y)
            ctx.lineTo(actuators[j].x, actuators[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw actuators — colour now encodes direction (blue = pulled in, orange = pushed out)
      // and size encodes magnitude, instead of a flat grayscale dot for every actuator.
      for (const a of actuators) {
        const t = a.stroke / maxAbsStroke
        const radius = 3 + Math.abs(t) * 4

        ctx.fillStyle = divergingColor(t)
        ctx.beginPath()
        ctx.arc(a.x, a.y, radius, 0, Math.PI * 2)
        ctx.fill()

        // Glow for actuators working hard in either direction
        if (Math.abs(t) > 0.6) {
          ctx.fillStyle = t < 0 ? 'rgba(140,170,220,0.12)' : 'rgba(220,150,100,0.12)'
          ctx.beginPath()
          ctx.arc(a.x, a.y, radius + 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Labels
      ctx.font = '9px "IBM Plex Mono", monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.textAlign = 'left'
      if (hasRealCommands) {
        ctx.fillText('Live DM Commands (real data)', 12, height - 12)
      } else if (live.liveStrehl != null) {
        ctx.fillText(`Live · Strehl ${live.liveStrehl.toFixed(3)}`, 12, height - 12)
      } else {
        ctx.fillText('DM Actuator Map', 12, height - 12)
      }
      ctx.textAlign = 'right'
      ctx.fillText(`${actuators.length} actuators${hasRealCommands ? '' : ' | 30% coupling'}`, width - 12, height - 12)

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
  }, [propWidth, propHeight, actuatorCount, animated])

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