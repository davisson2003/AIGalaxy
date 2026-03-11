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
    <div style={{ padding:'8px 10px', borderBottom:'1px solid rgba(0,191,255,0.1)', position:'relative' }}>
      <div style={{ position:'relative' }}>
        <span style={{
          position:'absolute', left:9, top:'50%', transform:'translateY(-50%)',
          color:'rgba(0,191,255,0.4)', fontSize:11, pointerEvents:'none',
        }}>⌕</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search agents…"
          style={{
            width:'100%', boxSizing:'border-box',
            background:'rgba(0,191,255,0.06)',
            border:'1px solid rgba(0,191,255,0.18)',
            borderRadius:4, padding:'6px 10px 6px 26px',
            fontSize:12, color:'#C8D6F0',
            outline:'none', fontFamily:'inherit',
            transition:'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'rgba(0,191,255,0.5)'
            e.currentTarget.style.boxShadow = '0 0 8px rgba(0,191,255,0.12)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'rgba(0,191,255,0.18)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
      </div>

      {results.length > 0 && (
        <div style={{
          position:'absolute', left:10, right:10, top:'100%', zIndex:50,
          background:'rgba(4,10,26,0.97)',
          border:'1px solid rgba(0,191,255,0.25)',
          borderRadius:5, overflow:'hidden',
          boxShadow:'0 8px 24px rgba(0,0,0,0.6), 0 0 16px rgba(0,191,255,0.08)',
        }}>
          {results.map(a => (
            <button key={a.id}
              onClick={() => { selectAgent(a.id); setQuery('') }}
              style={{
                width:'100%', textAlign:'left', padding:'7px 10px',
                background:'transparent', border:'none', cursor:'pointer',
                borderBottom:'1px solid rgba(0,191,255,0.07)',
                transition:'background 0.15s',
                display:'flex', alignItems:'center', gap:8,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,191,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize:12, color:'#E2E8F8', fontWeight:600 }}>{a.name}</span>
              <span style={{ fontSize:10, color:'rgba(0,191,255,0.5)' }}>{a.territory}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
