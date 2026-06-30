import { useState } from 'react'
import { calibrationSteps } from '../config'
import {
  Check,
  RotateCcw,
  Play,
  Loader2,
} from 'lucide-react'

type StepStatus = 'pending' | 'in-progress' | 'completed' | 'error'

interface CalStep {
  id: string
  label: string
  description: string
  status: StepStatus
  details?: string[]
}

const defaultSteps: CalStep[] = calibrationSteps.map((s) => ({
  ...s,
  details: [],
}))

export default function Calibration() {
  const [steps, setSteps] = useState<CalStep[]>(defaultSteps)
  const [currentStep, setCurrentStep] = useState(0)
  const [isRunning, setIsRunning] = useState(false)

  const runStep = (idx: number) => {
    setIsRunning(true)
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, status: 'in-progress' as StepStatus } : s))
    )
    setCurrentStep(idx)

    const stepDetails: Record<string, string[]> = {
      dark: [
        'Acquiring 100 dark frames at 100ms exposure...',
        'Computing master dark: μ=847.3 σ=12.1 ADU',
        'Saving master_dark.fits (2048×2048, float32)',
        'Dark frame calibration complete.',
      ],
      flat: [
        'Acquiring 50 flat field frames...',
        'Normalizing flat: mean=1.000, std=0.023',
        'Detecting 3 dust specks (flagged)',
        'Flat field calibration complete.',
      ],
      badpix: [
        'Scanning detector for hot/dead pixels...',
        'Found: 7 hot pixels, 5 dead pixels',
        'Generating bad pixel mask (12 total)',
        'Interpolation kernel: 3×3 median',
      ],
      influence: [
        'Poking actuator #1 (center)...',
        'Measuring slope response: 0.42 rad/V',
        'Poking actuator #19 (edge)...',
        'Influence function: σ_IF=0.85 pitches',
        'Influence matrix H: 4096×37 (cond=3.2e3)',
      ],
      fried: [
        'Scanning lenslet array position...',
        'Current alignment: 1.02× (target: 1.03×)',
        'Adjusting: Δx=+12μm, Δy=-8μm, Δθ=0.3°',
        'Final alignment: 1.031× — ACCEPTED',
      ],
      hysteresis: [
        'Applying voltage sweep: 0→150V→0V',
        'Measuring displacement (interferometer)...',
        'Fitting Preisach density μ(α,β)...',
        'Discretization: M=20, RMSE=0.8%',
        'Hysteresis model saved.',
      ],
    }

    const stepId = steps[idx].id
    const details = stepDetails[stepId] || ['Step executed.']

    let d = 0
    const interval = setInterval(() => {
      if (d >= details.length) {
        clearInterval(interval)
        setSteps((prev) =>
          prev.map((s, i) =>
            i === idx ? { ...s, status: 'completed' as StepStatus, details } : s
          )
        )
        setIsRunning(false)
        if (idx < steps.length - 1) {
          setCurrentStep(idx + 1)
        }
        return
      }
      setSteps((prev) =>
        prev.map((s, i) =>
          i === idx
            ? { ...s, details: [...(s.details || []), details[d]] }
            : s
        )
      )
      d++
    }, 600)
  }

  const runAll = () => {
    let idx = 0
    const runNext = () => {
      if (idx >= steps.length) return
      runStep(idx)
      const checkDone = setInterval(() => {
        setIsRunning((running) => {
          if (!running) {
            clearInterval(checkDone)
            idx++
            setTimeout(runNext, 100)
          }
          return running
        })
      }, 100)
    }
    runNext()
  }

  const resetAll = () => {
    setSteps(defaultSteps)
    setCurrentStep(0)
    setIsRunning(false)
  }

  const completedCount = steps.filter((s) => s.status === 'completed').length

  return (
    <div style={{ padding: '32px', maxWidth: '1000px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '32px',
        }}
      >
        <div>
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
            Calibration
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
            Step-by-step calibration wizard for AO system alignment
          </p>
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '11px',
            color: 'rgba(255,255,255,0.4)',
            textAlign: 'right',
          }}
        >
          <div>
            Progress: {completedCount}/{steps.length}
          </div>
          <div
            style={{
              width: '120px',
              height: '2px',
              background: 'rgba(255,255,255,0.1)',
              marginTop: '8px',
            }}
          >
            <div
              style={{
                width: `${(completedCount / steps.length) * 100}%`,
                height: '100%',
                background: '#fff',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '32px',
          padding: '16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <button
          onClick={runAll}
          disabled={isRunning}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: isRunning ? 'rgba(255,255,255,0.05)' : '#fff',
            color: isRunning ? 'rgba(255,255,255,0.3)' : '#000',
            border: 'none',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Play size={14} />
          Run All Steps
        </button>
        <button
          onClick={resetAll}
          disabled={isRunning}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            background: 'transparent',
            color: isRunning ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      {/* Wizard Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {steps.map((step, idx) => {
          const isActive = idx === currentStep
          const isCompleted = step.status === 'completed'
          const isPending = step.status === 'pending'

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                border: '1px solid rgba(255,255,255,0.08)',
                borderBottom:
                  idx < steps.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                background: isActive ? 'rgba(255,255,255,0.02)' : 'transparent',
              }}
            >
              {/* Step Number / Status */}
              <div
                style={{
                  width: '60px',
                  minWidth: '60px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '20px 0',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {isCompleted ? (
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'rgba(74,222,128,0.1)',
                      border: '1px solid rgba(74,222,128,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={14} style={{ color: '#4ade80' }} />
                  </div>
                ) : isActive ? (
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Loader2
                      size={14}
                      style={{ color: '#fff', animation: 'spin 1s linear infinite' }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {idx + 1}
                  </div>
                )}
                {/* Connector line */}
                {idx < steps.length - 1 && (
                  <div
                    style={{
                      width: '1px',
                      flex: 1,
                      background: isCompleted
                        ? 'rgba(74,222,128,0.2)'
                        : 'rgba(255,255,255,0.06)',
                      marginTop: '8px',
                    }}
                  />
                )}
              </div>

              {/* Step Content */}
              <div style={{ flex: 1, padding: '20px 24px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <h3
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '14px',
                      fontWeight: 400,
                      color: isCompleted || isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                      letterSpacing: '0.04em',
                      margin: 0,
                    }}
                  >
                    {step.label}
                  </h3>
                  {isPending && (
                    <button
                      onClick={() => runStep(idx)}
                      disabled={isRunning}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.5)',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isRunning) {
                          e.currentTarget.style.color = '#fff'
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                      }}
                    >
                      <Play size={10} />
                      Run
                    </button>
                  )}
                </div>
                <p
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.4)',
                    margin: '0 0 12px 0',
                    lineHeight: 1.5,
                  }}
                >
                  {step.description}
                </p>

                {/* Output details */}
                {step.details && step.details.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      padding: '12px 16px',
                      marginTop: '8px',
                    }}
                  >
                    {step.details.map((line, i) => (
                      <div
                        key={i}
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: '10px',
                          color:
                            i === step.details!.length - 1
                              ? '#4ade80'
                              : 'rgba(255,255,255,0.4)',
                          lineHeight: 1.8,
                        }}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      {completedCount === steps.length && (
        <div
          style={{
            marginTop: '24px',
            padding: '20px',
            background: 'rgba(74,222,128,0.03)',
            border: '1px solid rgba(74,222,128,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <Check size={20} style={{ color: '#4ade80' }} />
          <div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '13px',
                color: '#4ade80',
                letterSpacing: '0.04em',
                marginBottom: '4px',
              }}
            >
              Calibration Complete
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '11px',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              All {steps.length} calibration steps completed successfully. System ready for closed-loop
              operation.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
