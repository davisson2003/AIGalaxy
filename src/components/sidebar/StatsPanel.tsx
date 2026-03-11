import { useGardenStore } from '@/store'
import type { ProviderStatus } from '@/services/rpc'

const STATUS_CONFIG: Record<ProviderStatus, { dot: string; label: string; title: string }> = {
  connecting: { dot: '#FFA657', label: 'CONNECTING', title: 'Attempting BSC RPC connection' },
  connected:  { dot: '#00FF94', label: 'LIVE',       title: 'Live BSC Mainnet data' },
  error:      { dot: '#FF4B6B', label: 'MOCK',       title: 'RPC unavailable — using simulated data' },
  offline:    { dot: '#8B949E', label: 'OFFLINE',    title: 'No network' },
}

function ChainBadge() {
  const status      = useGardenStore(s => s.chainStatus)
  const rpcEndpoint = useGardenStore(s => s.rpcEndpoint)
  const cfg         = STATUS_CONFIG[status]

  const rpcLabel = rpcEndpoint
    ? rpcEndpoint.replace('https://', '').split('/')[0]
    : ''

  return (
    <div title={cfg.title + (rpcLabel ? ` (${rpcLabel})` : '')}
      style={{
        display:'flex', alignItems:'center', gap:5,
        padding:'2px 7px', borderRadius:3,
        background:`${cfg.dot}12`,
        border:`1px solid ${cfg.dot}40`,
        cursor:'default', userSelect:'none',
      }}>
      <span style={{
        width:6, height:6, borderRadius:'50%',
        background: cfg.dot,
        boxShadow: `0 0 6px ${cfg.dot}, 0 0 12px ${cfg.dot}80`,
        flexShrink:0,
        animation: status === 'connecting' ? 'pulse 1.4s ease-in-out infinite' : 'none',
      }}/>
      <span className="hud-text-mono" style={{
        fontSize:9, color:cfg.dot, fontWeight:700, letterSpacing:'0.12em',
        textShadow:`0 0 6px ${cfg.dot}`,
      }}>
        {cfg.label}
      </span>
    </div>
  )
}

const STAT_COLORS = ['#00CFFF', '#00FF94', '#BD93F9', '#F0B90B']
const STAT_GLOW   = [
  'rgba(0,207,255,0.25)',
  'rgba(0,255,148,0.25)',
  'rgba(189,147,249,0.25)',
  'rgba(240,185,11,0.25)',
]

export default function StatsPanel() {
  const agents          = useGardenStore(s => s.agents)
  const totalMessages   = useGardenStore(s => s.totalMessages)
  const totalActivities = useGardenStore(s => s.totalActivities)

  const activeAgents = agents.filter(a => a.active).length
  const avgRep = agents.length
    ? Math.round(agents.reduce((sum, a) => sum + a.reputation, 0) / agents.length)
    : 0

  const stats = [
    { label: 'ACTIVE',    sub: 'Agents',     value: activeAgents,    idx: 0 },
    { label: 'MSG',       sub: 'Total',      value: totalMessages,   idx: 1 },
    { label: 'ACTIVITY',  sub: 'Events',     value: totalActivities, idx: 2 },
    { label: 'REP',       sub: 'Avg Score',  value: avgRep,          idx: 3 },
  ]

  return (
    <div style={{ padding:'12px 12px 10px', borderBottom:'1px solid rgba(0,191,255,0.1)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span className="hud-section-label">◈ NETWORK STATS</span>
        <ChainBadge />
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        {stats.map(s => {
          const color = STAT_COLORS[s.idx]
          const glow  = STAT_GLOW[s.idx]
          return (
            <div key={s.label} className="hud-stat-card" style={{ padding:'8px 10px' }}>
              {/* Top accent bar */}
              <div style={{
                position:'absolute', top:0, left:0, right:0, height:2,
                background:`linear-gradient(90deg,${color}00,${color},${color}00)`,
                opacity:0.7,
              }}/>
              <p className="hud-text-mono" style={{
                fontSize:8, color:'rgba(180,200,230,0.5)', letterSpacing:'0.14em',
                margin:'0 0 2px',
              }}>
                {s.label}
              </p>
              <p className="hud-text-mono" style={{
                fontSize:20, fontWeight:800, lineHeight:1,
                color, textShadow:`0 0 12px ${glow}`,
                margin:'0 0 2px', letterSpacing:'-0.02em',
              }}>
                {s.value.toLocaleString()}
              </p>
              <p style={{ fontSize:9, color:'rgba(130,155,185,0.55)', margin:0 }}>
                {s.sub}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
