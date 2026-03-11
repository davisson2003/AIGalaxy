import { useState } from 'react'
import { useGardenStore } from '@/store'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const agents = useGardenStore(s => s.agents)
  const selectAgent = useGardenStore(s => s.selectAgent)

  const trimmed = query.trim().toLowerCase()
  const results = trimmed.length >= 2
    ? agents.filter(a =>
        a.name.toLowerCase().includes(trimmed) ||
        a.tba.toLowerCase().includes(trimmed) ||
        a.skills.some(sk => sk.toLowerCase().includes(trimmed))
      ).slice(0, 5)
    : []

  return (
    <div className="px-3 py-2 border-b border-white/10 relative">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search agents…"
        className="w-full rounded-md bg-white/10 text-sm text-white placeholder-gray-500 px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-400/60"
      />
      {results.length > 0 && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-md bg-[#161B22] border border-white/10 shadow-xl overflow-hidden">
          {results.map(a => (
            <button
              key={a.id}
              onClick={() => { selectAgent(a.id); setQuery('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors"
            >
              <span className="text-white font-medium">{a.name}</span>
              <span className="ml-2 text-xs text-gray-500">{a.territory}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
