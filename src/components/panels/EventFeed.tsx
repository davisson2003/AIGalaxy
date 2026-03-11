import { useGardenStore } from '@/store'
import type { FeedEvent } from '@/types'

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 5000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  return `${Math.floor(diff / 60000)}m ago`
}

// FeedEvent already carries .label and .color — use them directly
function eventBadge(evt: FeedEvent): { label: string; color: string } {
  return { label: evt.label, color: evt.color }
}

export default function EventFeed() {
  const feedEvents = useGardenStore(s => s.feedEvents)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-white/10 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Live Feed
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {feedEvents.length === 0 && (
          <p className="text-xs text-gray-600 text-center mt-8">Waiting for events…</p>
        )}
        {feedEvents.map(evt => {
          const { label, color } = eventBadge(evt)
          return (
            <div
              key={evt.id}
              className="px-3 py-2 border-b border-white/5 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span
                  className="text-[10px] font-bold rounded px-1 py-0.5 shrink-0 mt-0.5 whitespace-nowrap"
                  style={{ background: `${color}20`, color }}
                >
                  {label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 leading-snug">{evt.text}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{timeAgo(evt.timestamp)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
