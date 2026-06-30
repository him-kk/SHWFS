import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { landingManifestoConfig } from '../../config'

gsap.registerPlugin(ScrollTrigger)

export default function Manifesto() {
  const sectionRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const videoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !textRef.current || !videoRef.current) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        videoRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            end: 'top 30%',
            toggleActions: 'play none none reverse',
          },
        }
      )

      gsap.fromTo(
        textRef.current,
        { opacity: 0, y: 60 },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            end: 'top 30%',
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
      id="manifesto"
      style={{
        background: '#ffffff',
        color: '#000000',
        padding: '160px 40px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1360px',
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 46%) minmax(320px, 1fr)',
          gap: '64px',
          alignItems: 'center',
        }}
      >
        <div
          ref={videoRef}
          style={{ opacity: 0 }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              overflow: 'hidden',
              background: '#000',
            }}
          >
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            >
              <source src={landingManifestoConfig.videoPath} type="video/mp4" />
            </video>
          </div>
        </div>

        <p
          ref={textRef}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '15px',
            fontWeight: 400,
            lineHeight: '25px',
            maxWidth: '680px',
            textAlign: 'left',
            margin: 0,
            opacity: 0,
          }}
        >
          {landingManifestoConfig.text}
        </p>
      </div>
    </section>
  )
}
