import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { landingModulesConfig, type LandingModuleItem } from '../../config'

gsap.registerPlugin(ScrollTrigger)

function AnalogClock({ utcOffset = 0 }: { utcOffset?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = 48
    canvas.width = size * 2
    canvas.height = size * 2

    const draw = () => {
      const now = new Date()
      const utc = now.getTime() + now.getTimezoneOffset() * 60000
      const localTime = new Date(utc + utcOffset * 3600000)

      ctx.clearRect(0, 0, size * 2, size * 2)
      ctx.save()
      ctx.translate(size, size)
      ctx.scale(2, 2)

      ctx.beginPath()
      ctx.arc(0, 0, 22, 0, Math.PI * 2)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.stroke()

      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6
        const inner = 18
        const outer = 21
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      const hr = localTime.getHours() % 12
      const hrAngle = ((hr + localTime.getMinutes() / 60) * Math.PI) / 6 - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(hrAngle) * 11, Math.sin(hrAngle) * 11)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1.5
      ctx.stroke()

      const minAngle = ((localTime.getMinutes() + localTime.getSeconds() / 60) * Math.PI) / 30 - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(minAngle) * 15, Math.sin(minAngle) * 15)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.stroke()

      const secAngle = (localTime.getSeconds() * Math.PI) / 30 - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(secAngle) * 17, Math.sin(secAngle) * 17)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 0.5
      ctx.stroke()

      ctx.restore()
      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [utcOffset])

  return <canvas ref={canvasRef} style={{ width: '48px', height: '48px', marginBottom: '16px' }} />
}

function ModuleColumn({ module, isLast }: { module: LandingModuleItem; isLast: boolean }) {
  const [imgHover, setImgHover] = useState(false)

  return (
    <div
      style={{
        borderRight: isLast ? 'none' : '1px solid #000',
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
      }}
    >
      <h2
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '20px',
          fontWeight: 400,
          lineHeight: '25px',
          textTransform: 'uppercase',
          margin: '0 0 4px 0',
          color: '#000',
        }}
      >
        {module.name}
        {module.code ? `, ${module.code}` : ''}
      </h2>

      <div style={{ marginTop: '20px' }}>
        <AnalogClock utcOffset={module.utcOffset} />
      </div>

      {module.address && (
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            fontWeight: 400,
            lineHeight: '20px',
            textTransform: 'uppercase',
            color: '#000',
            margin: '0 0 12px 0',
          }}
        >
          {module.address}
        </p>
      )}

      {module.status && (
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            fontWeight: 400,
            lineHeight: '20px',
            color: '#000',
            margin: '0 0 12px 0',
            fontStyle: 'italic',
          }}
        >
          {module.status}
        </p>
      )}

      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '12px',
          fontWeight: 400,
          lineHeight: '20px',
          color: '#000',
          margin: '0 0 4px 0',
        }}
      >
        {module.email}
      </p>
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '12px',
          fontWeight: 400,
          lineHeight: '20px',
          color: '#000',
          margin: '0 0 24px 0',
        }}
      >
        {module.phone}
      </p>

      {module.ctaText && (
        <a
          href={module.ctaHref || '#'}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            fontWeight: 400,
            textTransform: 'uppercase',
            color: '#000',
            textDecoration: 'none',
            borderBottom: '1px solid #000',
            paddingBottom: '2px',
            display: 'inline-block',
            marginBottom: '32px',
            transition: 'border-bottom-width 0.2s',
          }}
          onClick={(e) => {
            if (!module.ctaHref || module.ctaHref === '#') e.preventDefault()
          }}
          onMouseEnter={(e) => {
            ;(e.target as HTMLElement).style.borderBottomWidth = '2px'
          }}
          onMouseLeave={(e) => {
            ;(e.target as HTMLElement).style.borderBottomWidth = '1px'
          }}
        >
          {module.ctaText}
        </a>
      )}

      {module.image && (
        <div style={{ marginTop: 'auto', overflow: 'hidden' }}>
          <img
            src={module.image}
            alt={module.name}
            onMouseEnter={() => setImgHover(true)}
            onMouseLeave={() => setImgHover(false)}
            style={{
              width: '100%',
              aspectRatio: '3 / 4',
              objectFit: 'cover',
              display: 'block',
              opacity: imgHover ? 0.8 : 1,
              transition: 'opacity 0.2s',
              filter: 'grayscale(100%)',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default function Modules() {
  const sectionRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const items = landingModulesConfig.items

  useEffect(() => {
    if (!sectionRef.current || !gridRef.current) return

    const cols = gridRef.current.children
    const ctx = gsap.context(() => {
      gsap.fromTo(
        Array.from(cols),
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            toggleActions: 'play none none reverse',
          },
        }
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="modules"
      style={{
        background: '#ffffff',
        color: '#000000',
        borderTop: '1px solid #000',
      }}
    >
      <div style={{ padding: '40px 40px 20px' }}>
        <h3
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '17.5px',
            fontWeight: 400,
            lineHeight: '20px',
            textTransform: 'uppercase',
            color: '#000',
            margin: '0 0 40px 0',
          }}
        >
          {landingModulesConfig.sectionLabel}
        </h3>
      </div>

      <div
        ref={gridRef}
        className="modules-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderTop: '1px solid #000',
        }}
      >
        {items.map((module, index) => (
          <ModuleColumn
            key={module.slug || `${module.name}-${index}`}
            module={module}
            isLast={index === items.length - 1}
          />
        ))}
      </div>
    </section>
  )
}
