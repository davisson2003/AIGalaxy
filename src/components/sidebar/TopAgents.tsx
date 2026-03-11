import { useGardenStore } from '@/store'
import { TERRITORY_MAP } from '@/constants/territories'

const TERRITORY_COLORS: Record<string, string> = {
  'bnbchain':    '#F0B90B',
  'pancakeswap': '#3DD6C8',
  'venus':       '#A78BFA',
  'listadao':    '#34D399',
  'binance':     '#F0B90B',
  'coinmktcap':  '#60A5FA',
  'aster':       '#F87171',
}

export default function TopAgents() {
  const agents = useGardenStore(s => s.agents)
  const selectAgent = useGardenStore(s => s.selectAgent)
  const selectedAgentId = useGardenStore(s => s.selectedAgentId)

  const top = [...agents]
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 8)

  return (
    <div style={{ padding:'10px 10px 10px', flex:1, overflowY:'auto' }}>
      <span className="hud-section-label" style={{ display:'block', marginBottom:8 }}>◈ TOP AGENTS</span>

      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
        {top.map((agent, i) => {
          const territory = TERRITORY_MAP[agent.territory]
          const color = TERRITORY_COLORS[agent.territory] ?? '#58A6FF'
          const isSelected = agent.id === selectedAgentId

          return (
            <button
              key={agent.id}
              onClick={() => selectAgent(agent.id)}
              style={{
                width:'100%', textAlign:'left',
                display:'flex', alignItems:'center', gap:7,
                padding:'6px 8px', borderRadius:5,
                background: isSelected
                  ? `${color}18`
                  : 'transparent',
                border: isSelected
                  ? `1px solid ${color}50`
                  : '1px solid transparent',
                cursor:'pointer', transition:'all 0.18s',
                boxShadow: isSelected ? `0 0 10px ${color}18` : 'none',
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'rgba(0,191,255,0.06)'
                  e.currentTarget.style.border = '1px solid rgba(0,191,255,0.18)'
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.border = '1px solid transparent'
                }
              }}
            >
              {/* Rank */}
              <span className="hud-text-mono" style={{
                width:14, fontSize:9, color:'rgba(0,191,255,0.35)',
                fontWeight:700, flexShrink:0, textAlign:'right',
              }}>
                {i + 1}
              </span>

              {/* Color dot */}
              <span style={{
                width:8, height:8, borderRadius:'50%', flexShrink:0,
                background: color,
                boxShadow: `0 0 6px ${color}, 0 0 12px ${color}60`,
              }}/>

              {/* Name + territory */}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:11, color:'#D8E6FF', fontWeight:600, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {agent.name}
                </p>
                <p style={{ fontSize:9, color:'rgba(130,155,185,0.55)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {territory?.name ?? agent.territory}
                </p>
              </div>

              {/* Reputation score */}
              <span className="hud-text-mono" style={{
                fontSize:11, fontWeight:800, flexShrink:0,
                color, textShadow:`0 0 8px ${color}80`,
              }}>
                {agent.reputation}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
