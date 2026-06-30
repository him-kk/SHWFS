import { Link } from 'react-router-dom'
import { landingFooterConfig } from '../../config'

export default function LandingFooter() {
  return (
    <footer
      style={{
        background: '#ffffff',
        color: '#000000',
        borderTop: '1px solid #000',
      }}
    >
      {/* CTA Band */}
      <div
        style={{
          padding: '80px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <h2
          style={{
            fontFamily: "'Geist Pixel', monospace",
            fontSize: 'clamp(32px, 4vw, 56px)',
            fontWeight: 400,
            color: '#000',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            margin: 0,
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          Enter the
          <br />
          Control Room
        </h2>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '13px',
            color: 'rgba(0,0,0,0.5)',
            maxWidth: '480px',
            textAlign: 'center',
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          Launch the full AO Wavefront Control System dashboard to access live telemetry,
          processing controls, calibration tools, and algorithm documentation.
        </p>
        <Link
          to="/dashboard"
          style={{
            marginTop: '16px',
            padding: '14px 40px',
            background: '#000',
            color: '#fff',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '13px',
            fontWeight: 400,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            textDecoration: 'none',
            border: '1px solid #000',
            transition: 'all 0.2s',
            cursor: 'pointer',
            display: 'inline-block',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.background = '#fff'
            el.style.color = '#000'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.background = '#000'
            el.style.color = '#fff'
          }}
        >
          Launch Dashboard
        </Link>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          padding: '32px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '12px',
          fontWeight: 400,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderTop: '1px solid #000',
        }}
      >
        <span>{landingFooterConfig.copyrightText}</span>
        <span>{landingFooterConfig.statusText}</span>
      </div>
    </footer>
  )
}
