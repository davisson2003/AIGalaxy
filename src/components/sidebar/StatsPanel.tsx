import { useGardenStore } from '@/store'
import type { ProviderStatus } from '@/services/rpc'

// ── Chain status badge ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ProviderStatus, { dot: string; label: string; title: string }> = {
  connecting: { dot: '#FFA657', label: 'Connecting…', title: 'Attempting BSC RPC connection' },
  connected:  { dot: '#3FB950', label: 'Live',        title: 'Live BSC Mainnet data' },
  error:      { dot: '#F85149', label: 'Mock',        title: 'RPC unavailable — using simulated data' },
  offline:    { dot: '#8B949E', label: 'Offline',     title: 'No network' },
}

function ChainBadge() {
  const status      = useGardenStore(s => s.chainStatus)
  const rpcEndpoint = useGardenStore(s => s.rpcEndpoint)
  const cfg         = STATUS_CONFIG[status]

  const rpcLabel = rpcEndpoint
    ? rpcEndpoint.replace('https://', '').split('/')[0]
    : ''

  return (
    <div
      title={cfg.title + (rpcLabel ? ` (${rpcLabel})` : '')}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 99,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        cursor: 'default', userSelect: 'none',
      }}
    >
      {/* Animated dot */}
      <span
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: cfg.dot,
          boxShadow: status === 'connected' ? `0 0 6px ${cfg.dot}` : 'none',
          flexShrink: 0,
          animation: status === 'connecting' ? 'pulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ fontSize: 10, color: cfg.dot, fontWeight: 600, letterSpacing: '0.02em' }}>
        {cfg.label}
      </span>
      {status === 'connected' && rpcLabel && (
        <span style={{ fontSize: 9, color: '#6B7A99', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rpcLabel}
        </span>
      )}
    </div>
  )
}

// ── Stats panel ───────────────────────────────────────────────────────────────

export default function StatsPanel() {
  const agents           = useGardenStore(s => s.agents)
  const totalMessages    = useGardenStore(s => s.totalMessages)
  const totalActivities  = useGardenStore(s => s.totalActivities)

  const activeAgents = agents.filter(a => a.active).length
  const avgRep = agents.length
    ? Math.round(agents.reduce((sum, a) => sum + a.reputation, 0) / agents.length)
    : 0

  const stats = [
    { label: 'Active Agents',  value: activeAgents,    color: '#58A6FF' },
    { label: 'Messages',       value: totalMessages,   color: '#3FB950' },
    { label: 'Activities',     value: totalActivities, color: '#D2A8FF' },
    { label: 'Avg Reputation', value: avgRep,          color: '#FFA657' },
  ]

  return (
    <div className="px-3 py-3 border-b border-white/10">
      {/* Header row: title + chain badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Network Stats
        </p>
        <ChainBadge />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg bg-white/5 px-3 py-2">
            <p className="text-xs text-gray-500 truncate">{s.label}</p>
            <p className="text-lg font-bold leading-tight" style={{ color: s.color }}>
              {s.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Keyframe for connecting pulse — injected once */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
