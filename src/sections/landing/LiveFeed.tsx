import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { landingObservationConfig } from '../../config'

gsap.registerPlugin(ScrollTrigger)

export default function LiveFeed() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [metrics, setMetrics] = useState({
    strehl: landingObservationConfig.initialLat,
    rms: landingObservationConfig.initialLon,
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        strehl: parseFloat((prev.strehl + (Math.random() - 0.5) * 0.02).toFixed(2)),
        rms: Math.round(prev.rms + (Math.random() - 0.5) * 8),
      }))
    }, 800)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        videoRef.current,
        { opacity: 0, scale: 0.95 },
        {
          opacity: 1,
          scale: 1,
          duration: 1.5,
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
      id="observation"
      style={{
        background: '#000',
        color: '#fff',
        padding: '120px 40px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <h3
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '17.5px',
          fontWeight: 400,
          lineHeight: '20px',
          textTransform: 'uppercase',
          color: '#fff',
          margin: '0 0 48px 0',
          alignSelf: 'flex-start',
        }}
      >
        {landingObservationConfig.sectionLabel}
      </h3>

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '1200px',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            aspectRatio: '16/9',
            objectFit: 'cover',
            opacity: 0,
          }}
        >
          <source src={landingObservationConfig.videoPath} type="video/mp4" />
        </video>

        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            fontWeight: 400,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: 'rgba(0,0,0,0.5)',
            padding: '6px 10px',
          }}
        >
          {landingObservationConfig.latLabel} {metrics.strehl.toFixed(2)},{' '}
          {landingObservationConfig.lonLabel} {metrics.rms}nm
        </div>

        {landingObservationConfig.statusText && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '12px',
              fontWeight: 400,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#4ade80',
                display: 'inline-block',
                animation: 'pulse 2s ease-in-out infinite',
                boxShadow: '0 0 6px rgba(74,222,128,0.4)',
              }}
            />
            {landingObservationConfig.statusText}
          </div>
        )}
      </div>
    </section>
  )
}
