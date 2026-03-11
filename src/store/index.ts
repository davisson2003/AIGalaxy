import { create } from 'zustand'
import type { Agent, Territory, FeedEvent, AgentMessage } from '@/types'
import { generateAgents } from '@/services/mockData'
import type { ProviderStatus } from '@/services/rpc'

interface GardenState {
  // Data
  agents: Agent[]
  feedEvents: FeedEvent[]
  totalMessages: number
  totalActivities: number

  // Selection
  selectedAgentId: number | null
  selectedTerritoryId: string | null

  // Chain status
  chainStatus: ProviderStatus
  rpcEndpoint: string | null

  // Network mode selection
  networkMode: 'mainnet' | 'testnet' | 'mock'

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
  setNetworkMode: (mode: 'mainnet' | 'testnet' | 'mock') => void
  /** Clear all transient state when switching networks */
  resetState: (mode: 'mainnet' | 'testnet' | 'mock') => void

  // Computed helpers
  getAgent: (id: number) => Agent | undefined
  getAgentsInTerritory: (id: string) => Agent[]
}

export const useGardenStore = create<GardenState>((set, get) => ({
  agents: generateAgents(28),
  feedEvents: [],
  totalMessages: 0,
  totalActivities: 0,
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
      return { agents: [...s.agents, agent] }
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

  resetState: (mode) => set({
    // In mock mode re-generate the 28 starter agents; in live modes start empty
    // (real agents arrive via ERC-8004 discovery; mock heartbeat targets them)
    agents:            mode === 'mock' ? generateAgents(28) : [],
    feedEvents:        [],
    totalMessages:     0,
    totalActivities:   0,
    selectedAgentId:   null,
    selectedTerritoryId: null,
  }),

  getAgent: (id) => get().agents.find(a => a.id === id),
  getAgentsInTerritory: (id) => get().agents.filter(a => a.territory === id),
}))
