import { useState } from 'react'
import { trpc } from '../lib/trpc'
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

const mono = "'IBM Plex Mono', monospace"
const pixel = "'Geist Pixel', monospace"

const statusColor = (status: string) => {
  switch (status) {
    case 'completed': return '#4ade80'
    case 'running': return '#fbbf24'
    case 'error': return '#f87171'
    default: return 'rgba(255,255,255,0.3)'
  }
}

export default function History() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'createdAt' | 'status'>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'running' | 'error'>('all')
  const [page, setPage] = useState(0)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const pageSize = 10

  const { data: runs, isLoading, refetch } = trpc.processing.listRuns.useQuery()
  const { data: results } = trpc.processing.getResults.useQuery(
    { runId: selectedRunId! },
    { enabled: selectedRunId !== null }
  )

  const filtered = (runs ?? [])
    .filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          run.name.toLowerCase().includes(q) ||
          run.centroidMethod.toLowerCase().includes(q) ||
          run.reconMethod.toLowerCase().includes(q) ||
          String(run.id).includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      if (sortField === 'createdAt') {
        return new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime() ? mul : -mul
      }
      return a.status > b.status ? mul : -mul
    })

  const totalPages = Math.ceil(filtered.length / pageSize)
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize)

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontFamily: pixel, fontSize: '28px', fontWeight: 400, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            Processing History
          </h1>
          <p style={{ fontFamily: mono, fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px', letterSpacing: '0.04em' }}>
            {runs ? `${runs.length} runs in database` : 'Loading from MySQL...'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', fontFamily: mono, fontSize: '11px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Search by name, method, ID..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0) }}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontFamily: mono, fontSize: '12px', width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
          {(['all', 'completed', 'running', 'error'] as const).map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(0) }}
              style={{ padding: '6px 12px', background: statusFilter === s ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${statusFilter === s ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`, color: statusFilter === s ? '#fff' : 'rgba(255,255,255,0.4)', fontFamily: mono, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', fontFamily: mono, fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
          Loading from MySQL...
        </div>
      ) : (
        <>
          {/* Table */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 100px 100px 100px 100px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              {[
                { key: null, label: 'ID' },
                { key: null, label: 'Name / Config' },
                { key: 'createdAt' as const, label: 'Time' },
                { key: null, label: 'Centroid' },
                { key: null, label: 'Recon' },
                { key: 'status' as const, label: 'Status' },
                { key: null, label: 'Actions' },
              ].map((col) => (
                <div key={col.label} onClick={() => col.key && toggleSort(col.key)}
                  style={{ padding: '12px 16px', fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: col.key ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '4px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                  {col.label}
                  {col.key && col.key === sortField && <ArrowUpDown size={10} />}
                </div>
              ))}
            </div>

            {/* Rows */}
            {pageData.map((run) => (
              <div key={run.id}
                style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 100px 100px 100px 100px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ padding: '12px 16px', fontFamily: mono, fontSize: '11px', color: 'rgba(255,255,255,0.4)', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center' }}>#{run.id}</div>
                <div style={{ padding: '12px 16px', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
                  <div style={{ fontFamily: mono, fontSize: '11px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</div>
                  <div style={{ fontFamily: mono, fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
                    Z{run.nZernikeModes} modes · λ={run.regularizationLambda} · D={run.telescopeDiameter}m
                  </div>
                </div>
                <div style={{ padding: '12px 16px', fontFamily: mono, fontSize: '11px', color: 'rgba(255,255,255,0.5)', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center' }}>
                  {new Date(run.createdAt).toLocaleTimeString()}
                </div>
                <div style={{ padding: '12px 16px', fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.6)', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center' }}>{run.centroidMethod}</div>
                <div style={{ padding: '12px 16px', fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.6)', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center' }}>{run.reconMethod}</div>
                <div style={{ padding: '12px 16px', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontFamily: mono, fontSize: '10px', color: statusColor(run.status), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{run.status}</span>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}
                    style={{ fontFamily: mono, fontSize: '9px', color: selectedRunId === run.id ? '#fff' : 'rgba(255,255,255,0.4)', background: selectedRunId === run.id ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  >
                    {selectedRunId === run.id ? 'Close' : 'View'}
                  </button>
                </div>
              </div>
            ))}

            {pageData.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', fontFamily: mono, fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                No runs match filters.
              </div>
            )}
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontFamily: mono, fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
              {filtered.length} runs | Page {page + 1} of {totalPages || 1}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: page === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{ padding: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: page >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Selected Run Results */}
          {selectedRunId && results && (
            <div style={{ marginTop: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
              <div style={{ fontFamily: mono, fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                Run #{selectedRunId} — {results.length} frames from MySQL
              </div>
              {results.length === 0 ? (
                <div style={{ fontFamily: mono, fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>No frame results saved for this run.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                  {[
                    { label: 'Avg Strehl', value: (results.reduce((s, r) => s + (Number(r.strehlRatio) || 0), 0) / results.length).toFixed(3) },
                    { label: 'Avg RMS', value: (results.reduce((s, r) => s + (Number(r.rmsError) || 0), 0) / results.length * 1000).toFixed(1) + ' nm' },
                    { label: 'Avg Latency', value: (results.reduce((s, r) => s + (Number(r.latencyMs) || 0), 0) / results.length).toFixed(1) + ' ms' },
                    { label: 'Avg r₀', value: (results.reduce((s, r) => s + (Number(r.friedR0) || 0), 0) / results.length * 100).toFixed(1) + ' cm' },
                    { label: 'Total Frames', value: String(results.length) },
                    { label: 'Valid Centroids', value: String(results[results.length - 1]?.nValidCentroids ?? '--') },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '12px' }}>
                      <div style={{ fontFamily: mono, fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{label}</div>
                      <div style={{ fontFamily: pixel, fontSize: '20px', color: '#fff' }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}