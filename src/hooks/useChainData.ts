/**
 * useChainData.ts
 *
 * React hook that:
 *  1. Connects to BSC via the best available free RPC (NodeReal MegaNode, Binance, Ankr…)
 *  2. Starts a ChainWatcher (PancakeSwap / Venus / ListaDAO) for map animation only —
 *     DeFi events update agent reputation but are NOT shown in the feed
 *  3. Starts an ERC8004Watcher that auto-discovers agents registered via BNBAgent SDK
 *  4. ERC-8004 events (registration + agent transfers) are pushed to the feed
 *  5. Exposes chainStatus so the UI can show a "live / mock" badge
 *
 * Falls back gracefully to mock simulation if ALL RPC endpoints are unreachable.
 */

import { useEffect, useRef } from 'react'
import { createBscProvider, type NetworkMode } from '@/services/rpc'
import {
  ChainWatcher,    type ChainEvent,
  ERC8004Watcher,  type ERC8004Agent, type ERC8004Interaction,
  ERC8004_REGISTRY_MAINNET, ERC8004_REGISTRY_TESTNET,
} from '@/services/chainWatcher'
import { TERRITORY_MAP } from '@/constants/territories'
import { useGardenStore } from '@/store'
import type { Agent } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

let _eventCounter = 10_000   // unique IDs that don't clash with mock IDs

/**
 * Convert a newly discovered ERC-8004 agent into a Garden Agent object.
 * Uses territory config for color; positions agent near the territory center.
 */
function erc8004AgentToGardenAgent(a: ERC8004Agent): Agent {
  // ERC-8004 agentIds start at 1; offset to avoid clashing with mock IDs (1–28)
  const id = a.agentId + 100_000

  const territory = TERRITORY_MAP[a.territory] ?? TERRITORY_MAP['bnbchain']
  const color     = territory.color

  // Scatter position slightly around territory center
  const scatter = () => (Math.random() - 0.5) * 0.06
  const x = (territory.cx + scatter()) * 800   // map width ~800
  const y = (territory.cy + scatter()) * 600   // map height ~600

  return {
    id,
    name:        a.name,
    territory:   territory.id,
    color,
    x,
    y,
    vx: 0,
    vy: 0,
    reputation:  100,
    skills:      [],
    interactions: 0,
    tba:         a.ownerAddress,
    tokenId:     a.agentId,
    lastActive:  Date.now(),
    active:      true,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * @param enabled      Pass `false` to skip initialisation (useful in tests / SSR).
 * @param networkMode  Which network to connect to. Re-runs the effect when changed.
 */
export function useChainData(enabled = true, networkMode: NetworkMode = 'mainnet') {
  const watcherRef      = useRef<ChainWatcher | null>(null)
  const erc8004Ref      = useRef<ERC8004Watcher | null>(null)

  const agents           = useGardenStore(s => s.agents)
  const agentsRef        = useRef(agents)
  agentsRef.current      = agents

  const pushFeedEvent       = useGardenStore(s => s.pushFeedEvent)
  const addAgent            = useGardenStore(s => s.addAgent)
  const updateAgent         = useGardenStore(s => s.updateAgent)
  const incrementMessages   = useGardenStore(s => s.incrementMessages)
  const incrementActivities = useGardenStore(s => s.incrementActivities)
  const setChainStatus      = useGardenStore(s => s.setChainStatus)
  const setRpcEndpoint      = useGardenStore(s => s.setRpcEndpoint)

  useEffect(() => {
    // Mock mode: skip RPC entirely, simulation hook handles events
    if (!enabled || networkMode === 'mock') {
      if (networkMode === 'mock') {
        setChainStatus('error')   // reuse 'error' state → shows MOCK badge
        setRpcEndpoint('')
      }
      return
    }

    let cancelled = false

    const init = async () => {
      setChainStatus('connecting')
      setRpcEndpoint('')

      try {
        const { provider, endpoint, blockNumber } = await createBscProvider(networkMode)

        if (cancelled) return

        console.log(`[useChainData] Connected to ${endpoint} (${networkMode}) at block ${blockNumber}`)
        setChainStatus('connected')
        setRpcEndpoint(endpoint)

        // ── 1. DeFi activity watcher (PancakeSwap / Venus / ListaDAO…) ──────
        // Each event carries actorAddress (the wallet that triggered it).
        // If that address matches a registered agent's tba, push to feed and
        // boost that agent's reputation. Otherwise only tick a random territory
        // agent's reputation for map animation — no feed entry.
        const onEvents = (events: ChainEvent[]) => {
          if (cancelled) return
          for (const evt of events) {
            const actor = evt.actorAddress.toLowerCase()

            // Check if the actor is a known registered agent
            const matchedAgent = agentsRef.current.find(
              a => a.tba?.toLowerCase() === actor
            )

            if (matchedAgent) {
              // Known agent → show in feed with their name
              pushFeedEvent({
                id:        ++_eventCounter,
                type:      'chain' as const,
                timestamp: Date.now(),
                label:     evt.label.replace(
                  // Replace the short address in label with the agent name
                  actor.slice(0, 6) + '…' + actor.slice(-4),
                  matchedAgent.name,
                ),
                color:     evt.color,
                territory: evt.territory,
                txHash:    evt.txHash,
              })
              incrementActivities()
              updateAgent(matchedAgent.id, {
                reputation:   Math.min(matchedAgent.reputation + evt.repDelta, 9999),
                interactions: (matchedAgent.interactions ?? 0) + 1,
                lastActive:   Date.now(),
              })
            } else {
              // Unknown wallet → silent reputation tick for map animation only
              const localAgents = agentsRef.current.filter(a => a.territory === evt.territory)
              if (localAgents.length > 0) {
                const target = localAgents[Math.floor(Math.random() * localAgents.length)]
                updateAgent(target.id, {
                  reputation: Math.min(target.reputation + evt.repDelta, 9999),
                })
              }
            }
          }
        }

        const watcher = new ChainWatcher(provider, onEvents)
        watcherRef.current = watcher
        await watcher.start()

        // ── 2. ERC-8004 agent discovery (BNBAgent SDK compatible) ────────────
        const registryAddress = networkMode === 'testnet'
          ? ERC8004_REGISTRY_TESTNET
          : ERC8004_REGISTRY_MAINNET

        if (registryAddress) {
          const onNewAgents = (newAgents: ERC8004Agent[]) => {
            if (cancelled) return
            for (const a of newAgents) {
              const gardenAgent = erc8004AgentToGardenAgent(a)
              addAgent(gardenAgent)

              // Feed entry for the new registration
              pushFeedEvent({
                id:        ++_eventCounter,
                type:      'activity',
                timestamp: Date.now(),
                label:     `🤖 ${gardenAgent.name} joined via ERC-8004`,
                color:     gardenAgent.color,
                territory: gardenAgent.territory,
                txHash:    a.txHash,
              })
              incrementActivities()
              console.log(`[ERC8004] New agent: ${gardenAgent.name} → ${gardenAgent.territory}`)
            }
          }

          // Interaction callback: agent-to-agent Transfer events
          const onInteractions = (interactions: ERC8004Interaction[]) => {
            if (cancelled) return
            for (const ix of interactions) {
              // Try to look up the agent name from the store
              const knownAgent = agentsRef.current.find(
                a => a.tokenId === ix.agentId
              )
              const agentLabel = knownAgent ? knownAgent.name : `Agent#${ix.agentId}`
              pushFeedEvent({
                id:        ++_eventCounter,
                type:      'activity',
                timestamp: Date.now(),
                label:     `🔀 ${agentLabel} transferred`,
                color:     '#F0B90B',
                territory: knownAgent?.territory ?? 'bnbchain',
                txHash:    ix.txHash,
              })
              incrementActivities()
              console.log(`[ERC8004] Interaction: Agent#${ix.agentId} ${ix.from} → ${ix.to}`)
            }
          }

          const erc8004Watcher = new ERC8004Watcher(provider, onNewAgents, registryAddress, onInteractions)
          erc8004Ref.current = erc8004Watcher
          await erc8004Watcher.start()
        } else {
          console.log('[useChainData] ERC-8004 registry not configured for testnet, skipping discovery')
        }

      } catch (err) {
        if (cancelled) return
        console.warn(`[useChainData] ${networkMode} RPC failed, falling back to mock:`, (err as Error).message)
        setChainStatus('error')
      }
    }

    init()

    return () => {
      cancelled = true
      watcherRef.current?.stop()
      watcherRef.current = null
      erc8004Ref.current?.stop()
      erc8004Ref.current = null
    }
  }, [enabled, networkMode]) // eslint-disable-line react-hooks/exhaustive-deps
}
