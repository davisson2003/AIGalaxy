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

// HUD corner decorator
function HUDCorner({ pos }: { pos: 'tl'|'tr'|'bl'|'br' }) {
  const s: React.CSSProperties = { position:'absolute', width:10, height:10, pointerEvents:'none' }
  if (pos === 'tl') { s.top=0; s.left=0; s.borderTop='2px solid rgba(0,191,255,0.6)'; s.borderLeft='2px solid rgba(0,191,255,0.6)' }
  if (pos === 'tr') { s.top=0; s.right=0; s.borderTop='2px solid rgba(0,191,255,0.6)'; s.borderRight='2px solid rgba(0,191,255,0.6)' }
  if (pos === 'bl') { s.bottom=0; s.left=0; s.borderBottom='2px solid rgba(0,191,255,0.6)'; s.borderLeft='2px solid rgba(0,191,255,0.6)' }
  if (pos === 'br') { s.bottom=0; s.right=0; s.borderBottom='2px solid rgba(0,191,255,0.6)'; s.borderRight='2px solid rgba(0,191,255,0.6)' }
  return <div style={s} />
}

// BNB hex logo SVG
function HexLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0B90B" />
          <stop offset="100%" stopColor="#E89F00" />
        </linearGradient>
        <filter id="hf" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <polygon points="15,2 27,8.5 27,21.5 15,28 3,21.5 3,8.5"
        fill="none" stroke="#F0B90B" strokeWidth="1.4" filter="url(#hf)" opacity="0.75"/>
      <g fill="url(#hg)" filter="url(#hf)">
        <rect x="12.5" y="12.5" width="5" height="5" transform="rotate(45 15 15)"/>
        <polygon points="15,6 17.2,10.5 15,11.5 12.8,10.5"/>
        <polygon points="15,24 17.2,19.5 15,18.5 12.8,19.5"/>
        <polygon points="6,15 10.5,12.8 11.5,15 10.5,17.2"/>
        <polygon points="24,15 19.5,12.8 18.5,15 19.5,17.2"/>
      </g>
    </svg>
  )
}

// Top HUD info strip
function TopHUDStrip() {
  return (
    <div style={{
      position:'absolute', top:0, left:0, right:0, zIndex:20,
      height:22,
      background:'linear-gradient(to right,rgba(0,191,255,0.08) 0%,transparent 40%,transparent 60%,rgba(240,185,11,0.06) 100%)',
      borderBottom:'1px solid rgba(0,191,255,0.12)',
      display:'flex', alignItems:'center', justifyContent:'center',
      gap:22, pointerEvents:'none',
    }}>
      {[
        { text:'BSC MAINNET', cls:'hud-glow-cyan' },
        { text:'AI AGENT NETWORK', cls:'hud-glow-green' },
        { text:'ERC-8004', cls:'hud-glow-gold' },
      ].map((item, i) => (
        <span key={i} style={{display:'flex',alignItems:'center',gap:22}}>
          {i > 0 && <span style={{width:1,height:10,background:'rgba(0,191,255,0.2)'}}/>}
          <span className={`hud-text-mono hud-flicker ${item.cls}`}
            style={{fontSize:9,letterSpacing:'0.16em'}}>
            {item.text}
          </span>
        </span>
      ))}
    </div>
  )
}

// Neon edge line
function NeonEdge({ dir }: { dir: 'top'|'bottom' }) {
  return (
    <div style={{
      position:'absolute', [dir]:0, left:0, right:0, height:1, zIndex:2,
      background:'linear-gradient(90deg,transparent,rgba(0,191,255,0.55),rgba(240,185,11,0.35),transparent)',
    }}/>
  )
}

// Sidebar border style
const sideStyle: React.CSSProperties = {
  flexShrink: 0,
  display:'flex', flexDirection:'column',
  background:'linear-gradient(180deg,rgba(2,8,22,0.98) 0%,rgba(3,7,18,0.98) 100%)',
  overflow:'hidden', position:'relative',
}

export default function GardenLayout({ mapSlot }: Props) {
  return (
    <div style={{
      width:'100vw', height:'100vh', display:'flex', overflow:'hidden',
      background:'#050810', color:'#E2E8F8',
      fontFamily:'Inter, system-ui, sans-serif',
    }}>

      {/* Left sidebar */}
      <aside className="hud-border-animate" style={{
        ...sideStyle, width:230, minWidth:230,
        borderRight:'1px solid rgba(0,191,255,0.22)',
        boxShadow:'4px 0 28px rgba(0,191,255,0.06),inset -1px 0 0 rgba(0,191,255,0.05)',
      }}>
        <NeonEdge dir="top" />

        {/* Logo block */}
        <div style={{
          padding:'14px 16px 12px',
          borderBottom:'1px solid rgba(0,191,255,0.12)',
          flexShrink:0, position:'relative',
          background:'linear-gradient(135deg,rgba(0,191,255,0.055) 0%,transparent 65%)',
        }}>
          <HUDCorner pos="tl"/>
          <HUDCorner pos="br"/>

          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <HexLogo/>
            <div>
              <p style={{
                fontSize:15, fontWeight:800, lineHeight:1.15,
                background:'linear-gradient(90deg,#FFFFFF,#9EC8FF)',
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                letterSpacing:'-0.02em', margin:0,
              }}>BNBChain</p>
              <p style={{
                fontSize:11, fontWeight:700, lineHeight:1.15,
                color:'#F0B90B',
                textShadow:'0 0 8px rgba(240,185,11,0.65)',
                letterSpacing:'0.1em',
                fontFamily:'ui-monospace,monospace',
                margin:0,
              }}>GARDEN</p>
            </div>
          </div>

          <p className="hud-glow-cyan hud-flicker" style={{
            fontSize:9, marginTop:5, letterSpacing:'0.18em',
            fontFamily:'ui-monospace,monospace', textTransform:'uppercase', margin:'5px 0 0',
          }}>▸ AI AGENT SOCIAL NETWORK</p>
        </div>

        <SearchBar />
        <StatsPanel />
        <TopAgents />

        <NeonEdge dir="bottom" />
      </aside>

      {/* Map center */}
      <main style={{flex:1, position:'relative', overflow:'hidden', minWidth:0}}>
        <TopHUDStrip/>
        <div className="hud-scanlines"/>
        <div className="hud-scan-beam" style={{top:0}}/>
        <HUDCorner pos="tl"/>
        <HUDCorner pos="tr"/>
        <HUDCorner pos="bl"/>
        <HUDCorner pos="br"/>
        {mapSlot}
        <AgentPanel />
        <TerritoryPanel />
      </main>

      {/* Right event feed */}
      <aside className="hud-border-animate" style={{
        ...sideStyle, width:244, minWidth:244,
        borderLeft:'1px solid rgba(0,191,255,0.22)',
        boxShadow:'-4px 0 28px rgba(0,191,255,0.06),inset 1px 0 0 rgba(0,191,255,0.05)',
      }}>
        <NeonEdge dir="top" />
        <EventFeed />
        <NeonEdge dir="bottom" />
      </aside>
    </div>
  )
}
