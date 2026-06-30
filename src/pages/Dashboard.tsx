import { useEffect, useState } from 'react'
import { modules } from '../config'
import WavefrontCanvas from '../components/WavefrontCanvas'
import DMActuatorMap from '../components/DMActuatorMap'
import { trpc } from '../lib/trpc'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'
import { Activity, TrendingUp, TrendingDown, Minus, Zap, Circle } from 'lucide-react'

const trendIcon = (trend: string) => {
  if (trend === 'up') return <TrendingUp size={12} style={{ color: '#4ade80' }} />
  if (trend === 'down') return <TrendingDown size={12} style={{ color: '#f87171' }} />
  return <Minus size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
}

const pipelineNodes = [
  { id: 'wfs', label: 'SH-WFS' },
  { id: 'pre', label: 'Preprocess' },
  { id: 'cen', label: 'Centroid' },
  { id: 'slope', label: 'Slope Vector' },
  { id: 'recon', label: 'Reconstruct' },
  { id: 'dm', label: 'DM Actuator' },
  { id: 'control', label: 'LQG Control' },
]

const mono = "'IBM Plex Mono', monospace"
const pixel = "'Geist Pixel', monospace"

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [history, setHistory] = useState<{ time: number; strehl: number; rms: number; r0: number }[]>([])

  // Real data from backend
  const { data: systemStatus } = trpc.system.getStatus.useQuery(undefined, {
    refetchInterval: 2000,
  })
  const { data: runs } = trpc.processing.listRuns.useQuery(undefined, {
    refetchInterval: 5000,
  })

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Build real timeline from system status
  useEffect(() => {
    if (!systemStatus) return
    setHistory(prev => {
      const next = [...prev, {
        time: prev.length,
        strehl: Number(systemStatus.currentStrehl) || 0,
        rms: Number(systemStatus.currentRms) || 0,
        r0: Number(systemStatus.estimatedR0) || 0,
      }].slice(-60)
      return next
    })
  }, [systemStatus])

  // Live metrics from real DB
  const latestRun = runs?.[0]
  // NOTE: this used to fall back to `latestRun?.nZernikeModes` when currentStrehl was missing —
  // that's a mode COUNT (e.g. 36), not a Strehl ratio (0–1), so it was producing nonsense values
  // (and would have broken the wavefront/DM visualization below, which expects a real 0–1 ratio).
  const strehl = systemStatus?.currentStrehl ?? null
  const rms = systemStatus?.currentRms ?? null
  const r0 = systemStatus?.estimatedR0 ?? null
  const frameRate = systemStatus?.frameRate ?? null
  const loopOpen = systemStatus?.loopOpen ?? true

  // Normalized real values to feed the wavefront/DM visualizations — same numbers already shown
  // in the metric cards below (rms converted from µm to nm to match that display).
  const liveStrehl = strehl != null ? Number(strehl) : null
  const liveRmsNm = rms != null ? Number(rms) * 1000 : null

  const liveMetrics = [
    { id: 'strehl', label: 'Strehl Ratio', value: strehl != null ? Number(strehl).toFixed(3) : '--', unit: '', trend: strehl && Number(strehl) > 0.8 ? 'up' : 'down', target: '>0.8' },
    { id: 'rms', label: 'RMS WFE', value: rms != null ? (Number(rms) * 1000).toFixed(1) : '--', unit: 'nm', trend: rms && Number(rms) < 0.1 ? 'up' : 'down', target: '<100nm' },
    { id: 'r0', label: 'Fried r₀', value: r0 != null ? (Number(r0) * 100).toFixed(1) : '--', unit: 'cm', trend: 'flat', target: '10–20cm' },
    { id: 'fps', label: 'Frame Rate', value: frameRate != null ? String(frameRate) : '--', unit: 'Hz', trend: 'flat', target: '1000Hz' },
    { id: 'runs', label: 'Total Runs', value: runs ? String(runs.length) : '--', unit: '', trend: 'flat', target: '' },
    { id: 'loop', label: 'Loop Status', value: loopOpen ? 'OPEN' : 'CLOSED', unit: '', trend: loopOpen ? 'down' : 'up', target: 'CLOSED' },
  ]

  return (
    <div style={{ padding: '32px', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontFamily: pixel, fontSize: '28px', fontWeight: 400, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            Dashboard
          </h1>
          <p style={{ fontFamily: mono, fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px', letterSpacing: '0.04em' }}>
            Real-time wavefront sensor telemetry and system status
          </p>
        </div>
        <div style={{ fontFamily: mono, fontSize: '11px', color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>
          <div>{currentTime.toISOString().replace('T', ' ').slice(0, 19)} UTC</div>
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
            <Circle size={6} style={{ color: loopOpen ? '#f87171' : '#4ade80', fill: loopOpen ? '#f87171' : '#4ade80' }} />
            Loop: {loopOpen ? 'OPEN' : 'CLOSED'} | {frameRate ?? '--'} Hz
          </div>
        </div>
      </div>

      {/* Live Metrics — Real DB Data */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '32px' }}>
        {liveMetrics.map((metric) => (
          <div key={metric.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              {metric.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontFamily: pixel, fontSize: '28px', color: '#fff', letterSpacing: '-0.02em' }}>
                {metric.value}
              </span>
              <span style={{ fontFamily: mono, fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                {metric.unit}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              {trendIcon(metric.trend)}
              <span style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                {metric.target ? `Target: ${metric.target}` : ''}
              </span>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px', width: '6px', height: '6px', borderRadius: '50%', background: metric.trend === 'up' ? '#4ade80' : metric.trend === 'down' ? '#f87171' : '#fbbf24' }} />
          </div>
        ))}
      </div>

      {/* Wavefront + DM — now driven by real Strehl/RMS from the DB instead of being fully synthetic */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', height: '320px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
            <span style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Live Wavefront
            </span>
          </div>
          <WavefrontCanvas resolution={64} liveStrehl={liveStrehl} liveRmsNm={liveRmsNm} />
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', height: '320px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
            <span style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              DM Actuator State
            </span>
          </div>
          <DMActuatorMap actuatorCount={37} liveStrehl={liveStrehl} liveRmsNm={liveRmsNm} />
        </div>
      </div>

      {/* Pipeline Architecture */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '20px' }}>
          Processing Pipeline Architecture
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {pipelineNodes.map((node, index) => (
            <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <div style={{ flex: 1, padding: '12px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', position: 'relative' }}>
                <div style={{ fontFamily: mono, fontSize: '10px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {node.label}
                </div>
                <div style={{ position: 'absolute', top: '4px', right: '4px', width: '4px', height: '4px', borderRadius: '50%', background: loopOpen ? '#fbbf24' : '#4ade80' }} />
              </div>
              {index < pipelineNodes.length - 1 && (
                <div style={{ width: '12px', height: '1px', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Real Performance Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', height: '240px' }}>
          <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            Strehl Ratio — Live
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="strehlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fff" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.15)" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
              <YAxis domain={[0, 1]} stroke="rgba(255,255,255,0.15)" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', fontFamily: mono, fontSize: '11px', color: '#fff' }} />
              <Area type="monotone" dataKey="strehl" stroke="#fff" strokeWidth={1} fill="url(#strehlGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', height: '240px' }}>
          <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            RMS Error — Live
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="rmsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fff" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.15)" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
              <YAxis stroke="rgba(255,255,255,0.15)" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', fontFamily: mono, fontSize: '11px', color: '#fff' }} />
              <Area type="monotone" dataKey="rms" stroke="#fff" strokeWidth={1} fill="url(#rmsGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Runs from DB */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginTop: '16px' }}>
        <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
          Recent Processing Runs — MySQL
        </div>
        {!runs || runs.length === 0 ? (
          <div style={{ fontFamily: mono, fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '20px' }}>
            No runs yet. Go to Processing to start.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {runs.slice(0, 5).map((run) => (
              <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.3)', width: '20px' }}>#{run.id}</div>
                <div style={{ flex: 1, fontFamily: mono, fontSize: '11px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</div>
                <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{run.centroidMethod} / {run.reconMethod}</div>
                <div style={{ fontFamily: mono, fontSize: '10px', color: run.status === 'completed' ? '#4ade80' : run.status === 'error' ? '#f87171' : '#fbbf24', textTransform: 'uppercase' }}>{run.status}</div>
                <div style={{ fontFamily: mono, fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
                  {new Date(run.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Module Status */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginTop: '16px' }}>
        <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
          Module Status
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
          {modules.map((mod) => (
            <div key={mod.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: mod.status === 'active' ? '#4ade80' : mod.status === 'processing' ? '#fbbf24' : mod.status === 'error' ? '#f87171' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: mono, fontSize: '11px', color: '#fff' }}>{mod.label}</div>
                <div style={{ fontFamily: mono, fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{mod.description}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{mod.status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}