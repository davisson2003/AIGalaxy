import { useGardenStore } from '@/store'
import { TERRITORY_MAP } from '@/constants/territories'

const SKILL_COLORS = ['#58A6FF', '#3FB950', '#D2A8FF', '#FFA657', '#FF7B7B', '#1FC7D4']

export default function AgentPanel() {
  const selectedAgentId = useGardenStore(s => s.selectedAgentId)
  const getAgent = useGardenStore(s => s.getAgent)
  const clearSelection = useGardenStore(s => s.clearSelection)

  if (selectedAgentId === null) return null
  const agent = getAgent(selectedAgentId)
  if (!agent) return null

  const territory = TERRITORY_MAP[agent.territory]

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[340px] rounded-xl bg-[#161B22]/95 border border-white/10 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{
              background: '#58A6FF',
              boxShadow: '0 0 8px #58A6FF80',
            }}
          />
          <span className="text-sm font-bold text-white">{agent.name}</span>
          <span className="text-[10px] text-gray-500 font-mono">
            {agent.tba.slice(0, 8)}…
          </span>
        </div>
        <button
          onClick={clearSelection}
          className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Territory + reputation row */}
        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-gray-500">Territory</span>
            <span className="ml-2 text-white font-medium">
              {territory?.name ?? agent.territory}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Reputation</span>
            <span className="ml-2 font-bold text-yellow-400">{agent.reputation}</span>
          </div>
        </div>

        {/* Reputation bar */}
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (agent.reputation / 500) * 100)}%`,
              background: 'linear-gradient(90deg, #58A6FF, #3FB950)',
            }}
          />
        </div>

        {/* Skills */}
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {agent.skills.map((skill, i) => (
              <span
                key={skill}
                className="text-[10px] rounded-full px-2 py-0.5 font-medium"
                style={{
                  background: `${SKILL_COLORS[i % SKILL_COLORS.length]}15`,
                  color: SKILL_COLORS[i % SKILL_COLORS.length],
                  border: `1px solid ${SKILL_COLORS[i % SKILL_COLORS.length]}30`,
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* TBA address */}
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1">TBA Address</p>
          <p className="text-[10px] font-mono text-gray-400 break-all">{agent.tba}</p>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${agent.active ? 'bg-green-400' : 'bg-gray-600'}`}
            style={agent.active ? { boxShadow: '0 0 6px #3FB95080' } : {}}
          />
          <span className="text-[10px] text-gray-400">
            {agent.active ? 'Active' : 'Idle'}
          </span>
        </div>
      </div>
    </div>
  )
}
