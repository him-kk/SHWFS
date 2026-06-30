import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { landingHeroConfig } from '../../config'

const WF_CHARS =
  " .-':_^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@"
const FIELD_CHARS = '  ..::--==++**##@@'.split('')

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

const smooth = (t: number) => t * t * (3 - 2 * t)

const noise2D = (x: number, y: number) => {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  const ux = smooth(fx)
  const uy = smooth(fy)
  return (
    a * (1 - ux) * (1 - uy) +
    b * ux * (1 - uy) +
    c * (1 - ux) * uy +
    d * ux * uy
  )
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

function WavefrontAsciiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let time = 0
    let rafId = 0
    const mouse = { x: -1000, y: -1000 }

    const resize = () => {
      width = canvas.parentElement!.offsetWidth
      height = canvas.parentElement!.offsetHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
    }

    const draw = () => {
      ctx.fillStyle = '#0A0A0A'
      ctx.fillRect(0, 0, width, height)
      time += 0.012

      const cols = width < 768 ? 90 : 128
      const cellW = width / cols
      const cellH = cellW * 1.18
      const rows = Math.ceil(height / cellH)

      ctx.font = `${cellH * 0.84}px "Fragment Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const pupilX = width * 0.5
      const pupilY = height * 0.5
      const pupilRadius = Math.min(width, height) * 0.22

      for (let r = 0; r < rows; r++) {
        const rowY = r * cellH + cellH / 2
        const laneNorm = rowY / height
        const laneSpeed = 1.75

        for (let c = 0; c < cols; c++) {
          const x = c * cellW + cellW / 2
          const y = rowY

          const dxPupil = x - pupilX
          const dyPupil = y - pupilY
          const distPupil = Math.hypot(dxPupil, dyPupil)
          const normPupil = distPupil / pupilRadius
          const anglePupil = Math.atan2(dyPupil, dxPupil)

          const mouseDistance = Math.hypot(x - mouse.x, y - mouse.y)
          const mouseField = Math.exp(-mouseDistance * 0.0038)

          let char = ''
          let opacity = 0
          let drawX = x
          let drawY = y

          if (normPupil < 1.0) {
            const localX = dxPupil / pupilRadius
            const localY = -(y - pupilY) / pupilRadius
            const localR2 = localX * localX + localY * localY
            const z = Math.sqrt(Math.max(0, 1.0 - localR2))

            const angle = time * 0.32
            const px = localX * Math.cos(angle) - z * Math.sin(angle)
            const py = localY
            const defocus = (px * px + py * py) * 0.5
            const astig = (px * px - py * py) * 0.3
            const coma = (px * px + py * py) * px * 0.2
            const spherical = (localR2 * localR2) * 0.15
            const turbulence =
              noise2D(px * 4 + time * 0.1, py * 4) * 0.25 +
              noise2D(px * 12 + 30, py * 12 - 20) * 0.1

            const phase = clamp(
              0.5 + defocus + astig * Math.sin(time * 0.5) + coma + spherical + turbulence,
              0,
              1
            )

            const wfIdx = clamp(
              Math.floor(phase * (WF_CHARS.length - 1)),
              0,
              WF_CHARS.length - 1
            )
            char = WF_CHARS[wfIdx]
            opacity = clamp(0.15 + phase * 0.85, 0.15, 1)

            const edgeBend = Math.exp(-Math.abs(normPupil - 1.0) * 8) * 4
            drawX += -Math.sin(anglePupil) * edgeBend
            drawY += Math.cos(anglePupil) * edgeBend * 0.4
            drawX += Math.sin(time * 3.6 + r * 0.32 + c * 0.11) * mouseField * 16
            drawY += Math.cos(time * 2.8 + c * 0.24) * mouseField * 5
          } else {
            const sampleX =
              c * 0.085 -
              time * (1.8 + laneSpeed * 1.6) +
              Math.sin(time * 4.2 + r * 0.28 + c * 0.08) * mouseField * 1.8
            const sampleY =
              r * 0.11 +
              Math.sin(c * 0.025 + time * 1.2) * 0.6 +
              Math.cos(time * 3.4 + c * 0.2) * mouseField * 1.1

            const flowA = noise2D(sampleX, sampleY)
            const flowB = noise2D(sampleX * 1.7 + 20, sampleY * 0.8 - 14)
            const wave =
              Math.sin(sampleX * 1.9 + laneNorm * 14) * 0.5 +
              Math.cos(sampleY * 2.4 - time * 2.1) * 0.5

            let density = flowA * 0.42 + flowB * 0.28 + (wave * 0.5 + 0.5) * 0.3

            const orbitBand = Math.exp(-Math.pow((normPupil - 1.12) * 5.5, 2))
            density += orbitBand * 0.16

            if (density > 0.38) {
              const fieldIdx = clamp(
                Math.floor(density * (FIELD_CHARS.length - 1)),
                0,
                FIELD_CHARS.length - 1
              )
              char = FIELD_CHARS[fieldIdx]
              opacity = 0.035 + density * 0.24
              drawX += ((laneSpeed * 8 + flowB * 16) % (cellW * 3))
              drawY += Math.sin(sampleX * 2.2 + time + laneNorm * 8) * 1.8
              const swirl = orbitBand * 10
              drawX += -Math.sin(anglePupil) * swirl
              drawY += Math.cos(anglePupil) * swirl * 0.6
              drawX += Math.sin(time * 4.8 + r * 0.35 + c * 0.1) * mouseField * 18
              drawY += Math.cos(time * 3.2 + c * 0.25) * mouseField * 6
              density += mouseField * 0.24
            }
          }

          if (!char || opacity <= 0.02) continue
          ctx.fillStyle = `rgba(232, 230, 224, ${opacity})`
          ctx.fillText(char, drawX, drawY)
        }
      }

      rafId = requestAnimationFrame(draw)
    }

    document.fonts.ready.then(() => {
      resize()
      draw()
    })
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouseMove)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return (
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
  )
}

export default function HeroLanding() {
  const notes = landingHeroConfig.supportingNotes.slice(0, 3)

  return (
    <section
      id="hero"
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
      }}
    >
      {/* Left Panel */}
      <div
        style={{
          position: 'relative',
          width: '40%',
          minWidth: '320px',
          background: '#000',
          overflow: 'hidden',
        }}
      >
        {/* Nav */}
        <nav
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '40%',
            minWidth: '320px',
            zIndex: 50,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px 40px',
            background: 'transparent',
            fontFamily: "'IBM Plex Mono', monospace",
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              fontSize: '18px',
              fontWeight: 400,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            AO-WFS
          </span>
          <div style={{ display: 'flex', gap: '32px' }}>
            <a
              href="#manifesto"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('manifesto')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              style={{
                fontSize: '12px',
                fontWeight: 400,
                color: '#fff',
                textTransform: 'uppercase',
                textDecoration: 'none',
                letterSpacing: '0.08em',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.2s',
                paddingBottom: '2px',
              }}
              onMouseEnter={(e) => {
                ;(e.target as HTMLElement).style.borderBottomColor = '#fff'
              }}
              onMouseLeave={(e) => {
                ;(e.target as HTMLElement).style.borderBottomColor = 'transparent'
              }}
            >
              About
            </a>
            <a
              href="#modules"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('modules')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              style={{
                fontSize: '12px',
                fontWeight: 400,
                color: '#fff',
                textTransform: 'uppercase',
                textDecoration: 'none',
                letterSpacing: '0.08em',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.2s',
                paddingBottom: '2px',
              }}
              onMouseEnter={(e) => {
                ;(e.target as HTMLElement).style.borderBottomColor = '#fff'
              }}
              onMouseLeave={(e) => {
                ;(e.target as HTMLElement).style.borderBottomColor = 'transparent'
              }}
            >
              Modules
            </a>
            <Link
              to="/dashboard"
              style={{
                fontSize: '12px',
                fontWeight: 400,
                color: '#fff',
                textTransform: 'uppercase',
                textDecoration: 'none',
                letterSpacing: '0.08em',
                borderBottom: '1px solid #fff',
                paddingBottom: '2px',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => {
                ;(e.target as HTMLElement).style.opacity = '0.6'
              }}
              onMouseLeave={(e) => {
                ;(e.target as HTMLElement).style.opacity = '1'
              }}
            >
              Launch App
            </Link>
          </div>
        </nav>

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            left: '40px',
            right: '24px',
            top: '22vh',
            zIndex: 10,
            width: 'calc(100% - 64px)',
          }}
        >
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              fontWeight: 400,
              lineHeight: 1.6,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.42)',
              margin: '0 0 22px 0',
            }}
          >
            {landingHeroConfig.eyebrow}
          </p>

          {/* FIX 1: RECONSTRUCTION line gets its own smaller font size */}
          <h1
            style={{
              fontFamily: "'Geist Pixel', monospace",
              fontWeight: 400,
              lineHeight: 0.96,
              color: '#fff',
              textTransform: 'uppercase',
              margin: 0,
              textWrap: 'balance',
              letterSpacing: '0.015em',
            }}
          >
            {landingHeroConfig.titleLines.map((line, index) => (
              <span
                key={index}
                style={{
                  display: 'block',
                  fontSize: line.toUpperCase().includes('RECONSTRU')
                    ? 'clamp(28px, 3.2vw, 46px)'
                    : 'clamp(44px, 5.6vw, 82px)',
                }}
              >
                {line}
              </span>
            ))}
          </h1>

          {/* FIX 2: Notes switched from absolute to flex column — no more overlap */}
          <div
            style={{
              marginTop: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {[landingHeroConfig.leadText, ...(notes ?? [])]
              .filter(Boolean)
              .map((text, idx) => (
                <p
                  key={idx}
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '11.5px',
                    fontWeight: 400,
                    lineHeight: 1.7,
                    color: 'rgba(255,255,255,0.56)',
                    margin: 0,
                    maxWidth: '34ch',
                    alignSelf: idx === 0
                      ? 'flex-start'
                      : idx === 1
                      ? 'flex-end'
                      : idx === 2
                      ? 'center'
                      : 'flex-end',
                  }}
                >
                  {text}
                </p>
              ))}
          </div>
        </div>
      </div>

      {/* Right Panel - ASCII Wavefront */}
      <div
        style={{
          position: 'relative',
          width: '60%',
          background: '#0A0A0A',
          overflow: 'hidden',
        }}
      >
        <WavefrontAsciiCanvas />
      </div>
    </section>
  )
}