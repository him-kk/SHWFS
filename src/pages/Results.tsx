import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from 'recharts'
import { TrendingUp, BarChart2, Layers, Clock, RefreshCw, ChevronDown } from 'lucide-react'
import { zernikeEvaluate, nollToNM } from '../lib/ao-sim'

// ─── tRPC client ────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:3000/api/trpc'

async function trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
  const url =
    input !== undefined
      ? `${API_BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
      : `${API_BASE}/${procedure}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${procedure} → HTTP ${res.status}`)
  const envelope = await res.json()
  // tRPC + superjson envelope: { result: { data: { json: T } } }
  return envelope.result.data.json as T
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Run = {
  id: number
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  createdAt: string
}

type FrameResult = {
  frameIndex: number
  strehlRatio?: number | null
  rmsError?: number | null
  friedR0?: number | null
  zernikeCoefficients?: number[] | null
  wavefrontData?: number[] | null
  bandwidthHz?: number | null
}

// ─── Zernike labels (Noll 2–16) ─────────────────────────────────────────────

const ZERNIKE_LABELS = [
  'Z2 (Tip)',        'Z3 (Tilt)',        'Z4 (Defocus)',
  'Z5 (Astig)',      'Z6 (Astig)',       'Z7 (Coma)',
  'Z8 (Coma)',       'Z9 (Trefoil)',     'Z10 (Trefoil)',
  'Z11 (Spherical)', 'Z12 (Sec. Astig)', 'Z13 (Sec. Astig)',
  'Z14 (Tetrafoil)', 'Z15 (Tetrafoil)', 'Z16 (Sec. Coma)',
]

// Band ranges over the coefficients array (index 0 = Noll Z2).
// Matches the previous ASCII-map split: Tip/Tilt = Z2–Z3, Low Order = Z4–Z11, High Order = Z12+
const BAND_RANGES: [number, number][] = [
  [0, 2],   // Tip/Tilt
  [2, 10],  // Low Order
  [10, Infinity], // High Order
]

// ─── Derive chart datasets from raw frames ──────────────────────────────────

function buildTimeline(results: FrameResult[]) {
  return results.map((r) => ({
    time: r.frameIndex,
    strehl: r.strehlRatio ?? null,
    rms:    r.rmsError   ?? null,
    r0:     r.friedR0    ?? null,
  }))
}

function buildZernike(results: FrameResult[]) {
  const frames = results.filter((r) => r.zernikeCoefficients?.length)
  if (!frames.length) return []
  const nModes = Math.min(frames[0].zernikeCoefficients!.length, ZERNIKE_LABELS.length)
  return ZERNIKE_LABELS.slice(0, nModes).map((label, i) => ({
    mode: label,
    amplitude:
      frames.reduce((sum, f) => sum + Math.abs(f.zernikeCoefficients![i] ?? 0), 0) /
      frames.length,
  }))
}

function buildFrequency(results: FrameResult[]) {
  const vals = results.map((r) => r.strehlRatio ?? 0)
  if (vals.length < 8) return []
  const N = vals.length
  const BINS = 50
  return Array.from({ length: BINS }, (_, k) => {
    let re = 0, im = 0
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N
      re += vals[n] * Math.cos(angle)
      im -= vals[n] * Math.sin(angle)
    }
    return { freq: k * 2, magnitude: Math.sqrt(re * re + im * im) / N }
  })
}

// ─── Real wavefront synthesis from Zernike coefficients ─────────────────────
//
// Builds an actual circular phase map for one Noll-index range by summing
// coeff_j * Z_j(r, θ) over the unit disk — this is the physically correct
// inverse of projectWavefrontOntoZernike, so a band with genuinely small
// coefficients (e.g. a well-corrected Tip/Tilt loop) really does come out
// flat, and a band with large coefficients really does show structure.
function synthesizeBandWavefront(
  coefficients: number[],
  rangeStart: number,
  rangeEnd: number,
  gridN: number,
): Float64Array {
  const grid = new Float64Array(gridN * gridN).fill(NaN)
  const end = Math.min(rangeEnd, coefficients.length)
  if (rangeStart >= end) return grid

  for (let iy = 0; iy < gridN; iy++) {
    for (let ix = 0; ix < gridN; ix++) {
      const xn = (ix / (gridN - 1)) * 2 - 1
      const yn = (iy / (gridN - 1)) * 2 - 1
      const r = Math.sqrt(xn * xn + yn * yn)
      if (r > 1) continue // outside the pupil — leave as NaN (transparent)

      const theta = Math.atan2(yn, xn)
      let val = 0
      for (let i = rangeStart; i < end; i++) {
        const coef = coefficients[i] ?? 0
        if (coef === 0) continue
        const { n, m, sine } = nollToNM(i + 2) // +2: array index 0 → Noll Z2
        val += coef * zernikeEvaluate(n, m, r, theta, sine)
      }
      grid[iy * gridN + ix] = val
    }
  }
  return grid
}

// ─── Sub-components ─────────────────────────────────────────────────────────

type ViewTab = 'timeline' | 'zernike' | 'residual' | 'frequency'

const monoFont = "'IBM Plex Mono', monospace"

const CHART_BOX: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border:     '1px solid rgba(255,255,255,0.08)',
  padding:    '24px',
  height:     '420px',
}

const TOOLTIP_STYLE = {
  background:  '#1a1a1a',
  border:      '1px solid rgba(255,255,255,0.1)',
  fontFamily:  monoFont,
  fontSize:    '11px',
  color:       '#fff',
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: monoFont, fontSize: '12px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {message}
    </div>
  )
}

// Diverging blue→orange colour scale — same palette as the DM actuator map elsewhere
// in the app, so every wavefront-style panel reads consistently.
function divergingColor(t: number): string {
  const c = Math.max(-1, Math.min(1, t))
  if (c < 0) {
    const a = Math.abs(c)
    return `rgb(${Math.round(120 - a * 40)},${Math.round(160 - a * 40)},${Math.round(220 - a * 20)})`
  }
  return `rgb(220,${Math.round(160 - c * 60)},${Math.round(100 - c * 40)})`
}

function ResidualHeatmap({
  coefficients,
  rangeStart,
  rangeEnd,
}: {
  coefficients: number[]
  rangeStart: number
  rangeEnd: number
}) {
  const gridN = 28
  const cellSize = 9

  const grid = useMemo(
    () => synthesizeBandWavefront(coefficients, rangeStart, rangeEnd, gridN),
    [coefficients, rangeStart, rangeEnd]
  )

  const validVals = Array.from(grid).filter((v) => !Number.isNaN(v))
  const rms = validVals.length
    ? Math.sqrt(validVals.reduce((s, v) => s + v * v, 0) / validVals.length)
    : 0
  const maxAbs = validVals.length ? Math.max(...validVals.map(Math.abs), 1e-9) : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <svg width={gridN * cellSize} height={gridN * cellSize} viewBox={`0 0 ${gridN * cellSize} ${gridN * cellSize}`}>
        {Array.from({ length: gridN }, (_, iy) =>
          Array.from({ length: gridN }, (_, ix) => {
            const v = grid[iy * gridN + ix]
            if (Number.isNaN(v)) return null // outside pupil disk
            const t = v / maxAbs
            return (
              <rect
                key={`${iy}-${ix}`}
                x={ix * cellSize}
                y={iy * cellSize}
                width={cellSize}
                height={cellSize}
                fill={divergingColor(t)}
              />
            )
          })
        )}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: monoFont, fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
        <span>-{maxAbs.toFixed(3)}</span>
        <div style={{ width: '70px', height: '6px', borderRadius: '3px', background: 'linear-gradient(to right, rgb(120,160,220), rgba(255,255,255,0.3), rgb(220,120,80))' }} />
        <span>+{maxAbs.toFixed(3)}</span>
      </div>
      <div style={{ fontFamily: monoFont, fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
        RMS: {rms.toFixed(4)}
      </div>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function ResultsViewer() {
  const [activeTab,       setActiveTab]       = useState<ViewTab>('timeline')
  const [selectedMetric,  setSelectedMetric]  = useState<'strehl' | 'rms' | 'r0'>('strehl')

  const [runs,           setRuns]           = useState<Run[]>([])
  const [selectedRunId,  setSelectedRunId]  = useState<number | null>(null)
  const [results,        setResults]        = useState<FrameResult[]>([])
  const [loadingRuns,    setLoadingRuns]    = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  // Fetch run list once
  useEffect(() => {
    trpcQuery<Run[]>('processing.listRuns')
      .then((data) => {
        setRuns(data)
        if (data.length > 0) setSelectedRunId(data[0].id)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingRuns(false))
  }, [])

  // Fetch results whenever the selected run changes
  const fetchResults = useCallback((runId: number) => {
    setLoadingResults(true)
    setError(null)
    trpcQuery<FrameResult[]>('processing.getResults', { runId })
      .then(setResults)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingResults(false))
  }, [])

  useEffect(() => {
    if (selectedRunId != null) fetchResults(selectedRunId)
  }, [selectedRunId, fetchResults])

  // Derived datasets
  const timelineData  = buildTimeline(results)
  const zernikeData   = buildZernike(results)
  const frequencyData = buildFrequency(results)
  const midFrame      = results[Math.floor(results.length / 2)]
  const midCoeffs     = midFrame?.zernikeCoefficients ?? []

  const tabs: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline',  label: 'Timeline',        icon: <Clock     size={14} /> },
    { id: 'zernike',   label: 'Zernike Spectrum', icon: <BarChart2 size={14} /> },
    { id: 'residual',  label: 'Residual Map',     icon: <Layers    size={14} /> },
    { id: 'frequency', label: 'Frequency',        icon: <TrendingUp size={14} /> },
  ]

  const hasResults = results.length > 0

  return (
    <div style={{ padding: '32px', maxWidth: '1400px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontFamily: "'Geist Pixel', monospace", fontSize: '28px', fontWeight: 400, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
          Results Viewer
        </h1>
        <p style={{ fontFamily: monoFont, fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px', letterSpacing: '0.04em', margin: '8px 0 0' }}>
          Wavefront reconstruction results and performance metrics
        </p>
      </div>

      {/* ── Run selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <span style={{ fontFamily: monoFont, fontSize: '11px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          Run
        </span>

        <div style={{ position: 'relative' }}>
          <select
            value={selectedRunId ?? ''}
            onChange={(e) => setSelectedRunId(Number(e.target.value))}
            disabled={loadingRuns || runs.length === 0}
            style={{
              appearance: 'none',
              background:  'rgba(255,255,255,0.04)',
              border:      '1px solid rgba(255,255,255,0.1)',
              color:       '#fff',
              fontFamily:  monoFont,
              fontSize:    '11px',
              padding:     '8px 36px 8px 12px',
              minWidth:    '260px',
              cursor:      'pointer',
            }}
          >
            {loadingRuns && <option>Loading…</option>}
            {!loadingRuns && runs.length === 0 && <option>No runs found</option>}
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} — {r.name} ({r.status})
              </option>
            ))}
          </select>
          <ChevronDown size={12} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
        </div>

        {/* Refresh */}
        <button
          onClick={() => selectedRunId != null && fetchResults(selectedRunId)}
          disabled={loadingResults || selectedRunId == null}
          title="Refresh results"
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', padding: '7px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 0 }}
        >
          <RefreshCw size={12} style={{ animation: loadingResults ? 'spin 1s linear infinite' : 'none' }} />
        </button>

        {/* Status badges */}
        {loadingResults && (
          <span style={{ fontFamily: monoFont, fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Loading…</span>
        )}
        {error && (
          <span style={{ fontFamily: monoFont, fontSize: '10px', color: '#ff5555' }}>{error}</span>
        )}
        {hasResults && !loadingResults && (
          <span style={{ fontFamily: monoFont, fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
            {results.length.toLocaleString()} frames
          </span>
        )}
      </div>

      {/* ── Metric toggle ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {(['strehl', 'rms', 'r0'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMetric(m)}
            style={{
              padding:    '8px 16px',
              background: selectedMetric === m ? 'rgba(255,255,255,0.1)' : 'transparent',
              border:     `1px solid ${selectedMetric === m ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
              color:      selectedMetric === m ? '#fff' : 'rgba(255,255,255,0.4)',
              fontFamily: monoFont,
              fontSize:   '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor:     'pointer',
              transition: 'all 0.15s',
            }}
          >
            {m === 'strehl' ? 'Strehl Ratio' : m === 'rms' ? 'RMS WFE (nm)' : 'r₀ (cm)'}
          </button>
        ))}
      </div>

      {/* ── View tabs ── */}
      <div style={{ display: 'flex', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        '8px',
              padding:    '12px 20px',
              background: 'transparent',
              border:     'none',
              borderBottom: `2px solid ${activeTab === tab.id ? '#fff' : 'transparent'}`,
              color:      activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.4)',
              fontFamily: monoFont,
              fontSize:   '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor:     'pointer',
              transition: 'all 0.15s',
              marginBottom: '-1px',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {!hasResults && !loadingResults && (
        <div style={{ ...CHART_BOX, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: monoFont, fontSize: '12px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {runs.length === 0 ? 'No processing runs found' : 'No results for this run yet'}
          </span>
        </div>
      )}

      {/* ── Chart panels ── */}
      {hasResults && (
        <>
          {/* Timeline */}
          {activeTab === 'timeline' && (
            <div style={CHART_BOX}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#fff" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#fff" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="time"
                    stroke="rgba(255,255,255,0.15)"
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                    label={{ value: 'Frame', position: 'insideBottomRight', offset: -5, style: { fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: monoFont } }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.15)"
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                    domain={selectedMetric === 'strehl' ? [0, 1] : ['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number) =>
                      selectedMetric === 'strehl' ? [value.toFixed(3), 'Strehl']
                      : selectedMetric === 'rms'  ? [Math.round(value) + ' nm', 'RMS WFE']
                      :                             [value.toFixed(1) + ' cm', 'r₀']
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey={selectedMetric}
                    stroke="#fff"
                    strokeWidth={1.5}
                    fill="url(#metricGrad)"
                    dot={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Zernike */}
          {activeTab === 'zernike' && (
            <div style={CHART_BOX}>
              {zernikeData.length === 0
                ? <EmptyChart message="No Zernike coefficients saved for this run" />
                : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={zernikeData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        type="number"
                        stroke="rgba(255,255,255,0.15)"
                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                        label={{ value: 'Mean |Amplitude| (μm)', position: 'insideBottomRight', offset: -5, style: { fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: monoFont } }}
                      />
                      <YAxis
                        type="category"
                        dataKey="mode"
                        stroke="rgba(255,255,255,0.15)"
                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                        width={110}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [value.toFixed(4) + ' μm', 'Mean |Amplitude|']}
                      />
                      <Bar dataKey="amplitude" fill="rgba(255,255,255,0.6)" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          )}

          {/* Residual maps — now real circular wavefront heatmaps synthesized from the actual
              Zernike coefficients of the middle frame, instead of decorative ASCII art. */}
          {activeTab === 'residual' && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {(['Tip/Tilt', 'Low Order', 'High Order'] as const).map((label, idx) => {
                const [start, end] = BAND_RANGES[idx]
                return (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontFamily: monoFont, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', alignSelf: 'flex-start' }}>
                      Residual: {label}
                    </div>
                    {midCoeffs.length === 0 ? (
                      <div style={{ width: '252px', height: '252px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.06)', fontFamily: monoFont, fontSize: '9px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', padding: '12px' }}>
                        No coefficient data
                      </div>
                    ) : (
                      <ResidualHeatmap coefficients={midCoeffs} rangeStart={start} rangeEnd={end} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Frequency */}
          {activeTab === 'frequency' && (
            <div style={CHART_BOX}>
              {frequencyData.length === 0
                ? <EmptyChart message="Not enough frames for frequency analysis" />
                : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={frequencyData}>
                      <defs>
                        <linearGradient id="freqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#fff" stopOpacity={0.12} />
                          <stop offset="95%" stopColor="#fff" stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="freq"
                        stroke="rgba(255,255,255,0.15)"
                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                        label={{ value: 'Frequency (Hz)', position: 'insideBottomRight', offset: -5, style: { fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: monoFont } }}
                      />
                      <YAxis stroke="rgba(255,255,255,0.15)" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [value.toFixed(4), 'Magnitude']}
                      />
                      <Area type="monotone" dataKey="magnitude" stroke="#fff" strokeWidth={1.5} fill="url(#freqGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          )}
        </>
      )}

      {/* spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}