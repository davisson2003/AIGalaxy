import { create } from 'zustand'
import type { Agent, Territory, FeedEvent, AgentMessage } from '@/types'
import { generateAgents } from '@/services/mockData'
import type { ProviderStatus } from '@/services/rpc'

type NetworkMode = 'mainnet' | 'testnet' | 'mock'

/**
 * How long (ms) a per-network snapshot remains valid.
 * After this TTL the cache is discarded and the network starts fresh.
 *   - 30 min feels right: quick back-and-forth switches feel seamless,
 *     but returning after a long break gives you a clean slate.
 */
const CACHE_TTL_MS = 30 * 60 * 1000   // 30 minutes

/**
 * Hard cap on how many agents we keep per network slot.
 * Prevents unbounded growth from long-running ERC-8004 discovery sessions.
 */
const MAX_AGENTS_PER_NETWORK = 500

/** Snapshot of transient data cached per network */
interface NetworkSnapshot {
  agents: Agent[]
  feedEvents: FeedEvent[]
  totalMessages: number
  totalActivities: number
  savedAt: number          // Date.now() when this snapshot was saved
}

interface GardenState {
  // Data
  agents: Agent[]
  feedEvents: FeedEvent[]
  totalMessages: number
  totalActivities: number

  // Per-network state cache (survives network switches within the TTL window)
  networkCache: Partial<Record<NetworkMode, NetworkSnapshot>>

  // Selection
  selectedAgentId: number | null
  selectedTerritoryId: string | null

  // Chain status
  chainStatus: ProviderStatus
  rpcEndpoint: string | null

  // Network mode selection
  networkMode: NetworkMode

  // Actions — data
  setAgents: (agents: Agent[]) => void
  /** Add a single agent discovered from ERC-8004 on-chain registration */
  addAgent: (agent: Agent) => void
  updateAgent: (id: number, patch: Partial<Agent>) => void
  pushFeedEvent: (event: FeedEvent) => void
  incrementMessages: () => void
  incrementActivities: () => void

  // Actions — selection
  selectAgent: (id: number | null) => void
  selectTerritory: (id: string | null) => void
  clearSelection: () => void

  // Actions — chain
  setChainStatus: (status: ProviderStatus) => void
  setRpcEndpoint: (endpoint: string) => void
  setNetworkMode: (mode: NetworkMode) => void
  /**
   * Switch to a new network:
   *   1. Saves current agents/feed/counters → networkCache[currentMode]
   *   2. Restores networkCache[newMode] if it exists AND is within TTL,
   *      otherwise initialises fresh defaults
   * Watchers then diff-merge new on-chain data on top of the restored state.
   */
  switchNetwork: (mode: NetworkMode) => void

  // Computed helpers
  getAgent: (id: number) => Agent | undefined
  getAgentsInTerritory: (id: string) => Agent[]
}

export const useGardenStore = create<GardenState>((set, get) => ({
  agents: generateAgents(28),
  feedEvents: [],
  totalMessages: 0,
  totalActivities: 0,
  networkCache: {},
  selectedAgentId: null,
  selectedTerritoryId: null,

  chainStatus: 'connecting',
  rpcEndpoint: null,
  networkMode: 'mock',

  setAgents: (agents) => set({ agents }),

  addAgent: (agent) =>
    set(s => {
      // Deduplicate by id — ERC-8004 poll may fire for the same registration twice
      if (s.agents.some(a => a.id === agent.id)) return s
      // Enforce per-network agent cap (drop oldest entries beyond MAX)
      const next = [...s.agents, agent]
      return { agents: next.length > MAX_AGENTS_PER_NETWORK ? next.slice(-MAX_AGENTS_PER_NETWORK) : next }
    }),

  updateAgent: (id, patch) =>
    set(s => ({ agents: s.agents.map(a => a.id === id ? { ...a, ...patch } : a) })),

  pushFeedEvent: (event) =>
    set(s => ({ feedEvents: [event, ...s.feedEvents].slice(0, 50) })),

  incrementMessages: () => set(s => ({ totalMessages: s.totalMessages + 1 })),
  incrementActivities: () => set(s => ({ totalActivities: s.totalActivities + 1 })),

  selectAgent: (id) => set({ selectedAgentId: id, selectedTerritoryId: null }),
  selectTerritory: (id) => set({ selectedTerritoryId: id, selectedAgentId: null }),
  clearSelection: () => set({ selectedAgentId: null, selectedTerritoryId: null }),

  setChainStatus: (chainStatus) => set({ chainStatus }),
  setRpcEndpoint: (rpcEndpoint) => set({ rpcEndpoint }),
  setNetworkMode: (networkMode) => set({ networkMode }),

  switchNetwork: (mode) => {
    const s = get()
    if (s.networkMode === mode) return   // no-op if same network

    const now = Date.now()

    // 1. Save current state into the cache slot for the outgoing network
    const updatedCache: Partial<Record<NetworkMode, NetworkSnapshot>> = {
      ...s.networkCache,
      [s.networkMode]: {
        agents:          s.agents,
        feedEvents:      s.feedEvents,
        totalMessages:   s.totalMessages,
        totalActivities: s.totalActivities,
        savedAt:         now,
      },
    }

    // 2. Restore cached state for the incoming network if within TTL,
    //    otherwise start fresh (stale data is silently discarded)
    const cached  = updatedCache[mode]
    const isValid = cached !== undefined && (now - cached.savedAt) < CACHE_TTL_MS

    if (!isValid && cached !== undefined) {
      console.log(`[store] Cache for "${mode}" expired (${Math.round((now - cached.savedAt) / 60000)} min old) — starting fresh`)
      delete updatedCache[mode]
    }

    const freshAgents = mode === 'mock' ? generateAgents(28) : []
    set({
      networkMode:         mode,
      networkCache:        updatedCache,
      agents:              isValid ? cached!.agents          : freshAgents,
      feedEvents:          isValid ? cached!.feedEvents       : [],
      totalMessages:       isValid ? cached!.totalMessages    : 0,
      totalActivities:     isValid ? cached!.totalActivities  : 0,
      selectedAgentId:     null,
      selectedTerritoryId: null,
    })
  },

  getAgent: (id) => get().agents.find(a => a.id === id),
  getAgentsInTerritory: (id) => get().agents.filter(a => a.territory === id),
}))
