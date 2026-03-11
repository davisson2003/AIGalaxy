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
    <div className="px-3 py-3 flex-1 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Top Agents
      </p>
      <div className="space-y-1">
        {top.map((agent, i) => {
          const territory = TERRITORY_MAP[agent.territory]
          const color = TERRITORY_COLORS[agent.territory] ?? '#58A6FF'
          const isSelected = agent.id === selectedAgentId

          return (
            <button
              key={agent.id}
              onClick={() => selectAgent(agent.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                isSelected
                  ? 'bg-blue-500/20 ring-1 ring-blue-400/40'
                  : 'hover:bg-white/5'
              }`}
            >
              {/* Rank */}
              <span className="w-4 text-xs text-gray-600 font-mono shrink-0">{i + 1}</span>

              {/* Avatar dot */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: color, boxShadow: `0 0 6px ${color}80` }}
              />

              {/* Name + territory */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{agent.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {territory?.name ?? agent.territory}
                </p>
              </div>

              {/* Reputation */}
              <span className="text-xs font-semibold shrink-0" style={{ color }}>
                {agent.reputation}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
