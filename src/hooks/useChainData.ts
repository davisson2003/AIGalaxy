/**
 * useChainData.ts
 *
 * React hook that:
 *  1. Connects to BSC via the best available free RPC (NodeReal MegaNode, Binance, Ankr…)
 *  2. Starts a ChainWatcher that polls getLogs every ~15 s
 *  3. Maps real on-chain events → FeedEvent + agent reputation updates in the Garden store
 *  4. Exposes chainStatus so the UI can show a "live / mock" badge
 *
 * Falls back gracefully to mock simulation if ALL RPC endpoints are unreachable.
 */

import { useEffect, useRef } from 'react'
import { createBscProvider } from '@/services/rpc'
import { ChainWatcher, type ChainEvent } from '@/services/chainWatcher'
import { useGardenStore } from '@/store'
import type { FeedEvent } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

let _eventCounter = 10_000   // unique IDs that don't clash with mock IDs

function chainEventToFeed(evt: ChainEvent): FeedEvent {
  return {
    id: ++_eventCounter,
    type: 'chain' as const,
    timestamp: Date.now(),
    label: evt.label,
    color: evt.color,
    territory: evt.territory,
    txHash: evt.txHash,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * @param enabled  Pass `false` to skip initialisation (useful in tests / SSR).
 */
export function useChainData(enabled = true) {
  const watcherRef = useRef<ChainWatcher | null>(null)

  const agents           = useGardenStore(s => s.agents)
  const agentsRef        = useRef(agents)
  agentsRef.current      = agents

  const pushFeedEvent    = useGardenStore(s => s.pushFeedEvent)
  const updateAgent      = useGardenStore(s => s.updateAgent)
  const incrementMessages = useGardenStore(s => s.incrementMessages)
  const incrementActivities = useGardenStore(s => s.incrementActivities)
  const setChainStatus   = useGardenStore(s => s.setChainStatus)
  const setRpcEndpoint   = useGardenStore(s => s.setRpcEndpoint)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const init = async () => {
      setChainStatus('connecting')

      try {
        const { provider, endpoint, blockNumber } = await createBscProvider()

        if (cancelled) return

        console.log(`[useChainData] Connected to ${endpoint} at block ${blockNumber}`)
        setChainStatus('connected')
        setRpcEndpoint(endpoint)

        const onEvents = (events: ChainEvent[]) => {
          if (cancelled) return

          for (const evt of events) {
            // Push to feed
            pushFeedEvent(chainEventToFeed(evt))
            incrementActivities()

            // Pick a random agent in the same territory and bump rep
            const localAgents = agentsRef.current.filter(a => a.territory === evt.territory)
            if (localAgents.length > 0) {
              const target = localAgents[Math.floor(Math.random() * localAgents.length)]
              updateAgent(target.id, {
                reputation: Math.min(target.reputation + evt.repDelta, 9999),
              })
              incrementMessages()
            }
          }
        }

        const watcher = new ChainWatcher(provider, onEvents)
        watcherRef.current = watcher
        await watcher.start()

      } catch (err) {
        if (cancelled) return
        console.warn('[useChainData] All RPC endpoints failed, staying in mock mode:', (err as Error).message)
        setChainStatus('error')
        // The simulation hook in App.tsx will continue providing mock events
      }
    }

    init()

    return () => {
      cancelled = true
      watcherRef.current?.stop()
      watcherRef.current = null
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
