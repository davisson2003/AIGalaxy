import { useGardenStore } from '@/store'
import type { FeedEvent } from '@/types'

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 5000) return 'NOW'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  return `${Math.floor(diff / 60000)}m`
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function EventRow({ evt, index }: { evt: FeedEvent; index: number }) {
  const delay = Math.min(index * 0.03, 0.3)
  return (
    <div
      className="hud-event-entry"
      style={{
        padding:'7px 10px',
        borderBottom:'1px solid rgba(0,191,255,0.06)',
        background: index === 0 ? 'rgba(0,191,255,0.04)' : 'transparent',
        transition:'background 0.2s',
        animationDelay:`${delay}s`,
        position:'relative',
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position:'absolute', left:0, top:4, bottom:4, width:2, borderRadius:1,
        background: evt.color,
        boxShadow:`0 0 6px ${evt.color}`,
        opacity: index === 0 ? 1 : 0.5,
      }}/>

      <div style={{ paddingLeft:6 }}>
        {/* Label — wraps freely */}
        <p className="hud-text-mono" style={{
          fontSize:9, fontWeight:800,
          color: evt.color,
          textShadow:`0 0 6px ${evt.color}`,
          letterSpacing:'0.06em',
          margin:'0 0 4px',
          lineHeight:1.5,
          wordBreak:'break-word',
          whiteSpace:'pre-wrap',
        }}>
          {evt.label}
        </p>

        {evt.text && (
          <p style={{
            fontSize:11, color:'#C8D6F0', lineHeight:1.4,
            margin:'0 0 3px', wordBreak:'break-word',
          }}>
            {evt.text}
          </p>
        )}

        {/* Address + timestamp row */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {evt.address && (
            <span className="hud-text-mono" style={{
              fontSize:9,
              color: 'rgba(0,191,255,0.55)',
              letterSpacing:'0.04em',
            }}>
              <a
                href={`https://bscscan.com/address/${evt.address}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color:'inherit', textDecoration:'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#58A6FF')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.55)')}
              >
                ⬡ {shortAddr(evt.address)}
              </a>
            </span>
          )}

          <span className="hud-text-mono" style={{
            fontSize:9, color:'rgba(0,191,255,0.4)',
            letterSpacing:'0.06em',
          }}>
            ◷ {timeAgo(evt.timestamp)}
          </span>

          {evt.txHash && (
            <a
              href={`https://bscscan.com/tx/${evt.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hud-text-mono"
              style={{ fontSize:9, color:'rgba(0,191,255,0.3)', textDecoration:'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#58A6FF')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,191,255,0.3)')}
            >
              tx ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EventFeed() {
  const feedEvents     = useGardenStore(s => s.feedEvents)
  const clearFeedEvents = useGardenStore(s => s.clearFeedEvents)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{
        padding:'8px 12px 7px',
        borderBottom:'1px solid rgba(0,191,255,0.12)',
        flexShrink:0,
        background:'linear-gradient(135deg,rgba(0,191,255,0.04) 0%,transparent 60%)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <span className="hud-section-label">◈ LIVE FEED</span>

        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {feedEvents.length > 0 && (
            <span className="hud-text-mono" style={{
              fontSize:9, color:'rgba(0,255,148,0.6)',
              background:'rgba(0,255,148,0.08)',
              border:'1px solid rgba(0,255,148,0.2)',
              padding:'1px 6px', borderRadius:2,
            }}>
              {feedEvents.length}
            </span>
          )}
          {feedEvents.length > 0 && (
            <button
              onClick={clearFeedEvents}
              className="hud-text-mono"
              title="Clear all feed events"
              style={{
                fontSize:8, fontWeight:700,
                padding:'1px 6px', borderRadius:2,
                background:'rgba(255,80,80,0.08)',
                border:'1px solid rgba(255,80,80,0.25)',
                color:'rgba(255,100,100,0.7)',
                cursor:'pointer', letterSpacing:'0.08em',
                transition:'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,80,80,0.18)'
                e.currentTarget.style.color = '#FF6464'
                e.currentTarget.style.borderColor = 'rgba(255,80,80,0.5)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,80,80,0.08)'
                e.currentTarget.style.color = 'rgba(255,100,100,0.7)'
                e.currentTarget.style.borderColor = 'rgba(255,80,80,0.25)'
              }}
            >
              CLR
            </button>
          )}
        </div>
      </div>

      {/* Events list */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {feedEvents.length === 0 ? (
          <div style={{ textAlign:'center', paddingTop:40 }}>
            <p className="hud-text-mono" style={{
              fontSize:9, color:'rgba(0,191,255,0.3)', letterSpacing:'0.12em',
            }}>
              ⋯ AWAITING EVENTS
            </p>
          </div>
        ) : (
          feedEvents.map((evt, i) => (
            <EventRow key={evt.id} evt={evt} index={i} />
          ))
        )}
      </div>

      {/* Footer status */}
      <div style={{
        padding:'5px 12px',
        borderTop:'1px solid rgba(0,191,255,0.08)',
        flexShrink:0,
        display:'flex', alignItems:'center', gap:5,
      }}>
        <span style={{
          width:5, height:5, borderRadius:'50%',
          background:'#00FF94',
          boxShadow:'0 0 6px #00FF94',
          flexShrink:0,
          animation:'pulse 2s ease-in-out infinite',
        }}/>
        <span className="hud-text-mono" style={{
          fontSize:8, color:'rgba(0,255,148,0.5)', letterSpacing:'0.12em',
        }}>
          STREAM ACTIVE
        </span>
      </div>
    </div>
  )
}
