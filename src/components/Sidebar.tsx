import { useLocation, useNavigate } from 'react-router-dom'
import { navigationConfig } from '../config'
import {
  LayoutDashboard,
  Cpu,
  BarChart3,
  History,
  Settings2,
  BookOpen,
  Radio,
} from 'lucide-react'

const iconMap: Record<string, React.ReactNode> = {
  '/dashboard': <LayoutDashboard size={16} />,
  '/processing': <Cpu size={16} />,
  '/results': <BarChart3 size={16} />,
  '/history': <History size={16} />,
  '/calibration': <Settings2 size={16} />,
  '/documentation': <BookOpen size={16} />,
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside
      style={{
        width: '240px',
        minWidth: '240px',
        height: '100vh',
        background: '#0A0A0A',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Brand */}
      <button
        onClick={() => navigate('/')}
        style={{
          padding: '24px 20px',
          border: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <Radio size={20} style={{ color: '#fff' }} />
        <span
          style={{
            fontFamily: "'Geist Pixel', monospace",
            fontSize: '16px',
            fontWeight: 400,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {navigationConfig.brandName}
        </span>
      </button>

      {/* System Status */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '10px',
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: '8px',
          }}
        >
          System Status
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 6px rgba(74,222,128,0.4)',
            }}
          />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              color: '#4ade80',
              letterSpacing: '0.04em',
            }}
          >
            ACTIVE — CLOSED LOOP
          </span>
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '10px',
            color: 'rgba(255,255,255,0.3)',
            marginTop: '6px',
          }}
        >
          Frame rate: 347 Hz
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        {navigationConfig.links.map((link) => {
          const isActive = location.pathname === link.href
          return (
            <button
              key={link.href}
              onClick={() => navigate(link.href)}
              style={{
                width: 'calc(100% - 16px)',
                margin: '2px 8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '12px',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                }
              }}
            >
              {iconMap[link.href]}
              {link.label}
              {isActive && (
                <div
                  style={{
                    marginLeft: 'auto',
                    width: '3px',
                    height: '16px',
                    background: '#fff',
                    borderRadius: '2px',
                  }}
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.06em',
          }}
        >
          SH-WFS v2.4.1 — Build 2025.06.25
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            color: 'rgba(255,255,255,0.2)',
            marginTop: '4px',
          }}
        >
          Latency: 2.8ms | τ₀/3: 2.7ms
        </div>
      </div>
    </aside>
  )
}
