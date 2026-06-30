import { useState } from 'react'
import { algorithms, references, performanceTargets } from '../config'
import {
  BookOpen,
  CheckCircle2,
  FlaskConical,
  Rocket,
  Lightbulb,
  Target,
  ExternalLink,
} from 'lucide-react'

const statusConfig = {
  deployable: { icon: <Rocket size={12} />, label: 'Deployable', color: '#4ade80' },
  proven: { icon: <CheckCircle2 size={12} />, label: 'Proven', color: '#4ade80' },
  'lab-validated': { icon: <FlaskConical size={12} />, label: 'Lab Validated', color: '#fbbf24' },
  research: { icon: <Lightbulb size={12} />, label: 'Research', color: '#60a5fa' },
}

const trlBadge = (trl: number) => {
  let bg = 'rgba(255,255,255,0.05)'
  let color = 'rgba(255,255,255,0.5)'
  if (trl >= 8) {
    bg = 'rgba(74,222,128,0.08)'
    color = '#4ade80'
  } else if (trl >= 6) {
    bg = 'rgba(251,191,36,0.08)'
    color = '#fbbf24'
  } else if (trl >= 4) {
    bg = 'rgba(96,165,250,0.08)'
    color = '#60a5fa'
  }
  return { bg, color }
}

export default function Documentation() {
  const [expandedAlgo, setExpandedAlgo] = useState<string | null>(null)

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{
            fontFamily: "'Geist Pixel', monospace",
            fontSize: '28px',
            fontWeight: 400,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            margin: 0,
          }}
        >
          Documentation
        </h1>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            color: 'rgba(255,255,255,0.4)',
            marginTop: '8px',
            letterSpacing: '0.04em',
          }}
        >
          Algorithm references, TRL levels, and implementation details
        </p>
      </div>

      {/* System Architecture Summary */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <BookOpen size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '10px',
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            System Architecture Overview
          </span>
        </div>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.8,
            margin: 0,
          }}
        >
          This adaptive optics wavefront control system processes Shack-Hartmann Wavefront Sensor
          (SH-WFS) time-series data to perform wavefront reconstruction, atmospheric turbulence
          characterization, and deformable mirror (DM) actuator map generation. The pipeline integrates
          proven techniques (TRL 8–9), near-term innovations (TRL 5–7), and research directions
          (TRL 3–4) to achieve closed-loop correction bandwidth exceeding 50 Hz with total latency
          under 3 ms. All algorithms are supported by peer-reviewed literature and experimental
          validation where available.
        </p>
      </div>

      {/* Performance Targets */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <Target size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '10px',
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Performance Targets
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
          {performanceTargets.map((pt) => (
            <div
              key={pt.metric}
              style={{
                padding: '14px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '11px',
                  color: '#fff',
                  letterSpacing: '0.04em',
                  marginBottom: '4px',
                }}
              >
                {pt.metric}
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.35)',
                  lineHeight: 1.5,
                }}
              >
                {pt.definition}
              </div>
              <div
                style={{
                  fontFamily: "'Geist Pixel', monospace",
                  fontSize: '16px',
                  color: '#4ade80',
                  marginTop: '8px',
                  letterSpacing: '-0.02em',
                }}
              >
                {pt.target}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Algorithms */}
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '10px',
          color: 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '16px',
          padding: '0 4px',
        }}
      >
        Algorithm Inventory ({algorithms.length} techniques)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
        {algorithms.map((algo) => {
          const status = statusConfig[algo.status]
          const trl = trlBadge(algo.trl)
          const isExpanded = expandedAlgo === algo.id

          return (
            <div
              key={algo.id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                onClick={() => setExpandedAlgo(isExpanded ? null : algo.id)}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {/* Number */}
                <div
                  style={{
                    fontFamily: "'Geist Pixel', monospace",
                    fontSize: '18px',
                    color: 'rgba(255,255,255,0.25)',
                    width: '28px',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  {algo.id}
                </div>

                {/* Status */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: status.color + '10',
                    border: `1px solid ${status.color}30`,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: status.color }}>{status.icon}</span>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '9px',
                      color: status.color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                {/* TRL Badge */}
                <div
                  style={{
                    padding: '4px 10px',
                    background: trl.bg,
                    border: `1px solid ${trl.color}30`,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '9px',
                      color: trl.color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {algo.trlLabel}
                  </span>
                </div>

                {/* Name */}
                <div
                  style={{
                    flex: 1,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '12px',
                    color: '#fff',
                    letterSpacing: '0.04em',
                  }}
                >
                  {algo.name}
                </div>

                {/* Expand indicator */}
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '10px',
                    color: 'rgba(255,255,255,0.3)',
                  }}
                >
                  {isExpanded ? '−' : '+'}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div
                  style={{
                    padding: '0 20px 20px 84px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <p
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.6)',
                      lineHeight: 1.7,
                      margin: '16px 0',
                    }}
                  >
                    {algo.description}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: '24px',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '10px',
                      color: 'rgba(255,255,255,0.35)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Source:</span>{' '}
                      {algo.source}
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Year:</span> {algo.year}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Validation Procedures */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <FlaskConical size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '10px',
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Validation Procedures
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
          }}
        >
          {[
            { name: 'Static Calibration', desc: 'Flat wavefront → verify zero mean slope, uniform spot grid' },
            { name: 'Known Aberration', desc: 'Apply calibrated Zernike modes → verify reconstruction accuracy' },
            { name: 'Turbulence Simulator', desc: 'Rotating phase plate with known r₀ → validate estimation' },
            { name: 'Closed-Loop Stability', desc: 'Measure error rejection transfer function → verify bandwidth' },
          ].map((v) => (
            <div
              key={v.name}
              style={{
                padding: '14px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '11px',
                  color: '#fff',
                  marginBottom: '6px',
                  letterSpacing: '0.04em',
                }}
              >
                {v.name}
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.4)',
                  lineHeight: 1.5,
                }}
              >
                {v.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* References */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <ExternalLink size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '10px',
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            References ({references.length} publications)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {references.map((ref, idx) => (
            <div
              key={idx}
              style={{
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.25)',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                [{idx + 1}]
              </span>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.55)',
                  lineHeight: 1.6,
                }}
              >
                {ref}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
