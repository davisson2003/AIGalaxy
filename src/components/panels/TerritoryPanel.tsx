import { useGardenStore } from '@/store'
import { TERRITORY_MAP } from '@/constants/territories'

export default function TerritoryPanel() {
  const selectedTerritoryId = useGardenStore(s => s.selectedTerritoryId)
  const getAgentsInTerritory = useGardenStore(s => s.getAgentsInTerritory)
  const selectAgent = useGardenStore(s => s.selectAgent)
  const clearSelection = useGardenStore(s => s.clearSelection)

  if (!selectedTerritoryId) return null
  const territory = TERRITORY_MAP[selectedTerritoryId]
  if (!territory) return null

  const agents = getAgentsInTerritory(selectedTerritoryId)
  const avgRep = agents.length
    ? Math.round(agents.reduce((s, a) => s + a.reputation, 0) / agents.length)
    : 0

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[380px] rounded-xl bg-[#161B22]/95 border border-white/10 shadow-2xl backdrop-blur-md max-h-[60vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{territory.icon}</span>
          <div>
            <p className="text-sm font-bold text-white">{territory.name}</p>
            <p className="text-[10px] text-gray-500 font-mono">
              {territory.contractAddr.slice(0, 10)}…
            </p>
          </div>
        </div>
        <button
          onClick={clearSelection}
          className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="text-center">
          <p className="text-xs text-gray-500">Agents</p>
          <p className="text-lg font-bold text-blue-400">{agents.length}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Avg Rep</p>
          <p className="text-lg font-bold text-yellow-400">{avgRep}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Skills</p>
          <p className="text-lg font-bold text-purple-400">{territory.skills.length}</p>
        </div>
      </div>

      {/* Skills + entry req */}
      <div className="px-4 py-2 border-b border-white/10 shrink-0">
        <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">Territory Skills</p>
        <div className="flex flex-wrap gap-1.5">
          {territory.skills.map(skill => (
            <span
              key={skill}
              className="text-[10px] rounded-full px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20"
            >
              {skill}
            </span>
          ))}
        </div>
        {territory.entryReq && (
          <p className="text-[10px] text-yellow-500 mt-2">
            ⚠ Entry requires {territory.entryReq.type === 'reputation'
              ? `reputation ≥ ${territory.entryReq.minReputation}`
              : territory.entryReq.type === 'nft'
              ? `NFT: ${territory.entryReq.nftContract ?? ''}`
              : 'special requirement'}
          </p>
        )}
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">
          Agents ({agents.length})
        </p>
        <div className="space-y-1">
          {agents.slice(0, 20).map(agent => (
            <button
              key={agent.id}
              onClick={() => selectAgent(agent.id)}
              className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: agent.active ? '#3FB950' : '#30363D',
                  boxShadow: agent.active ? '0 0 5px #3FB95060' : 'none',
                }}
              />
              <span className="flex-1 text-xs text-white truncate">{agent.name}</span>
              <span className="text-xs text-yellow-400 shrink-0">{agent.reputation}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
