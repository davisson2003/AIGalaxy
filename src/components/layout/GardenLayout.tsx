import { type ReactNode } from 'react'
import StatsPanel from '@/components/sidebar/StatsPanel'
import SearchBar from '@/components/sidebar/SearchBar'
import TopAgents from '@/components/sidebar/TopAgents'
import EventFeed from '@/components/panels/EventFeed'
import AgentPanel from '@/components/panels/AgentPanel'
import TerritoryPanel from '@/components/panels/TerritoryPanel'

interface Props {
  mapSlot: ReactNode
}

// ── Inline style constants (guaranteed to work even if Tailwind CSS lags) ──
const S = {
  root: {
    width: '100vw', height: '100vh',
    display: 'flex', overflow: 'hidden',
    background: '#0D1117', color: '#E6EDF3',
    fontFamily: 'Inter, system-ui, sans-serif',
  } as React.CSSProperties,
  sidebar: {
    width: 224, minWidth: 224, flexShrink: 0,
    display: 'flex', flexDirection: 'column' as const,
    background: '#0D1117',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  } as React.CSSProperties,
  logoBox: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  } as React.CSSProperties,
  main: {
    flex: 1, position: 'relative' as const,
    overflow: 'hidden', minWidth: 0,
  } as React.CSSProperties,
  feed: {
    width: 240, minWidth: 240, flexShrink: 0,
    display: 'flex', flexDirection: 'column' as const,
    background: '#0D1117',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  } as React.CSSProperties,
}

export default function GardenLayout({ mapSlot }: Props) {
  return (
    <div style={S.root} className="w-screen h-screen flex overflow-hidden bg-[#0D1117] text-white font-sans">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside style={S.sidebar} className="w-56 shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
        {/* Logo */}
        <div style={S.logoBox} className="px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 24 }}>🌱</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#E6EDF3', lineHeight: 1.2 }}
                 className="text-sm font-bold text-white leading-tight">BNBChain</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#F0B90B', lineHeight: 1.2 }}
                 className="text-xs text-yellow-400 leading-tight font-semibold">Garden</p>
            </div>
          </div>
          <p style={{ fontSize: 10, color: '#6B7A99', marginTop: 4 }}
             className="text-[10px] text-gray-500 mt-1">AI Agent Social Network</p>
        </div>

        <SearchBar />
        <StatsPanel />
        <TopAgents />
      </aside>

      {/* ── Map area (center) ────────────────────────────────────── */}
      <main style={S.main} className="flex-1 relative overflow-hidden">
        {mapSlot}
        <AgentPanel />
        <TerritoryPanel />
      </main>

      {/* ── Right panel: event feed ──────────────────────────────── */}
      <aside style={S.feed} className="w-60 shrink-0 flex flex-col border-l border-white/10 overflow-hidden">
        <EventFeed />
      </aside>
    </div>
  )
}
