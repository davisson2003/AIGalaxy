import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Agent, Territory, FeedEvent, AgentMessage } from '@/types'
import { generateAgents } from '@/services/mockData'
import type { ProviderStatus } from '@/services/rpc'

type NetworkMode = 'mainnet' | 'testnet' | 'mock'

/**
 * Max feed events kept per network slot in localStorage.
 * Agents have no cap — they are finite (one per ERC-8004 registration).
 * Feed events are generated continuously, so we cap at 500 to keep
 * localStorage usage reasonable (~100 KB per network).
 */
const MAX_FEED_EVENTS = 500

/** Snapshot of transient data cached per network, persisted to localStorage */
interface NetworkSnapshot {
  agents: Agent[]
  feedEvents: FeedEvent[]
  totalMessages: number
  totalActivities: number
}

interface GardenState {
  // ── Live data (current network) ───────────────────────────────────────────
  agents: Agent[]
  feedEvents: FeedEvent[]
  totalMessages: number
  totalActivities: number

  // ── Per-network persistent cache ──────────────────────────────────────────
  // Saved to localStorage; survives page reloads and network switches.
  // No TTL — data is kept indefinitely.
  networkCache: Partial<Record<NetworkMode, NetworkSnapshot>>

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedAgentId: number | null
  selectedTerritoryId: string | null

  // ── Chain status (NOT persisted) ──────────────────────────────────────────
  chainStatus: ProviderStatus
  rpcEndpoint: string | null
  networkMode: NetworkMode

  // ── Actions — data ────────────────────────────────────────────────────────
  setAgents: (agents: Agent[]) => void
  addAgent: (agent: Agent) => void
  updateAgent: (id: number, patch: Partial<Agent>) => void
  pushFeedEvent: (event: FeedEvent) => void
  incrementMessages: () => void
  incrementActivities: () => void

  // ── Actions — selection ───────────────────────────────────────────────────
  selectAgent: (id: number | null) => void
  selectTerritory: (id: string | null) => void
  clearSelection: () => void

  // ── Actions — chain ───────────────────────────────────────────────────────
  setChainStatus: (status: ProviderStatus) => void
  setRpcEndpoint: (endpoint: string) => void
  setNetworkMode: (mode: NetworkMode) => void

  /**
   * Switch to a new network:
   *   1. Saves current agents/feed/counters → networkCache[currentMode]
   *   2. Restores networkCache[newMode] (or defaults on first visit)
   * The cache is persisted to localStorage — no data is ever discarded.
   * Watchers diff-merge new on-chain events on top of the restored state.
   */
  switchNetwork: (mode: NetworkMode) => void

  // ── Computed helpers ──────────────────────────────────────────────────────
  getAgent: (id: number) => Agent | undefined
  getAgentsInTerritory: (id: string) => Agent[]
}

export const useGardenStore = create<GardenState>()(
  persist(
    (set, get) => ({
      agents:          generateAgents(28),
      feedEvents:      [],
      totalMessages:   0,
      totalActivities: 0,
      networkCache:    {},
      selectedAgentId:     null,
      selectedTerritoryId: null,

      chainStatus:  'connecting',
      rpcEndpoint:  null,
      networkMode:  'mock',

      setAgents: (agents) => set({ agents }),

      addAgent: (agent) =>
        set(s => {
          // Deduplicate by id
          if (s.agents.some(a => a.id === agent.id)) return s
          return { agents: [...s.agents, agent] }
        }),

      updateAgent: (id, patch) =>
        set(s => ({ agents: s.agents.map(a => a.id === id ? { ...a, ...patch } : a) })),

      pushFeedEvent: (event) =>
        set(s => ({ feedEvents: [event, ...s.feedEvents].slice(0, MAX_FEED_EVENTS) })),

      incrementMessages:   () => set(s => ({ totalMessages:   s.totalMessages   + 1 })),
      incrementActivities: () => set(s => ({ totalActivities: s.totalActivities + 1 })),

      selectAgent:    (id) => set({ selectedAgentId: id, selectedTerritoryId: null }),
      selectTerritory:(id) => set({ selectedTerritoryId: id, selectedAgentId: null }),
      clearSelection: ()   => set({ selectedAgentId: null, selectedTerritoryId: null }),

      setChainStatus: (chainStatus) => set({ chainStatus }),
      setRpcEndpoint: (rpcEndpoint) => set({ rpcEndpoint }),
      setNetworkMode: (networkMode) => set({ networkMode }),

      switchNetwork: (mode) => {
        const s = get()
        if (s.networkMode === mode) return

        // 1. Save current state into the outgoing network's cache slot
        const updatedCache: Partial<Record<NetworkMode, NetworkSnapshot>> = {
          ...s.networkCache,
          [s.networkMode]: {
            agents:          s.agents,
            feedEvents:      s.feedEvents,
            totalMessages:   s.totalMessages,
            totalActivities: s.totalActivities,
          },
        }

        // 2. Restore incoming network's state, or initialise fresh defaults
        const cached      = updatedCache[mode]
        const freshAgents = mode === 'mock' ? generateAgents(28) : []

        set({
          networkMode:         mode,
          networkCache:        updatedCache,
          agents:              cached?.agents          ?? freshAgents,
          feedEvents:          cached?.feedEvents       ?? [],
          totalMessages:       cached?.totalMessages    ?? 0,
          totalActivities:     cached?.totalActivities  ?? 0,
          selectedAgentId:     null,
          selectedTerritoryId: null,
        })
      },

      getAgent:             (id) => get().agents.find(a => a.id === id),
      getAgentsInTerritory: (id) => get().agents.filter(a => a.territory === id),
    }),

    {
      name: 'bnbchain-garden-v1',          // localStorage key
      storage: createJSONStorage(() => localStorage),

      // Only persist data — skip transient connection state that should
      // always re-initialise fresh on page load
      partialize: (state) => ({
        networkMode:     state.networkMode,
        networkCache:    state.networkCache,
        // Also persist the current view so the last-used network is
        // immediately visible before watchers reconnect
        agents:          state.agents,
        feedEvents:      state.feedEvents,
        totalMessages:   state.totalMessages,
        totalActivities: state.totalActivities,
      }),
    }
  )
)
