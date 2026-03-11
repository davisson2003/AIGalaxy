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

  // Actions — data
  setAgents: (agents: Agent[]) => void
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

  setAgents: (agents) => set({ agents }),

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

  getAgent: (id) => get().agents.find(a => a.id === id),
  getAgentsInTerritory: (id) => get().agents.filter(a => a.territory === id),
}))
