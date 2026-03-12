// ─── Agent ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: number
  name: string
  territory: string
  color: string
  x: number
  y: number
  vx: number
  vy: number
  reputation: number
  skills: string[]
  interactions: number
  tba: string         // Token Bound Account address
  tokenId: number
  lastActive: number  // timestamp
  active: boolean
}

// ─── Territory ────────────────────────────────────────────────────────────────

export interface Territory {
  id: string
  name: string
  icon: string
  color: string
  type: TerritoryType
  skills: string[]
  cx: number          // center x (0–1 normalized)
  cy: number          // center y (0–1 normalized)
  radius: number
  entryReq: EntryRequirement
  activities: string[]
  skillsRepo: string
  contractAddr: string
}

export type TerritoryType = 'Hub' | 'DEX' | 'Lending' | 'Staking' | 'Data' | 'CEX' | 'DeFi'

export interface EntryRequirement {
  type: 'open' | 'reputation' | 'nft'
  minReputation?: number
  nftContract?: string
}

// ─── Messages / Events ────────────────────────────────────────────────────────

export type MessageType =
  | 'GREETING'
  | 'TASK_REQUEST'
  | 'TASK_RESPONSE'
  | 'SKILL_SIGNAL'
  | 'REPUTATION_ENDORSE'
  | 'TERRITORY_INVITE'
  | 'DATA_EXCHANGE'
  | 'AIRDROP_ANNOUNCE'

export interface AgentMessage {
  id: string
  fromAgentId: number
  toAgentId: number
  msgType: MessageType
  timestamp: number
  txHash: string
}

export interface FeedEvent {
  id: string | number
  type: 'message' | 'activity' | 'migrate' | 'broadcast' | 'airdrop' | 'chain'
  label: string
  color: string
  text?: string
  timestamp: number
  territory?: string
  txHash?: string
  address?: string   // on-chain address (tba / actor) for display
}

// ─── Social Graph ─────────────────────────────────────────────────────────────

export interface SocialEdge {
  fromId: number
  toId: number
  interactionCount: number
  weight: number
}

// ─── Map ──────────────────────────────────────────────────────────────────────

export interface GardenMap {
  mapId: string
  name: string
  parentMapId: string | null
  territories: string[]
}

// ─── Phaser bridge events ─────────────────────────────────────────────────────

export type PhaserEvent =
  | { type: 'AGENT_CLICKED';     agentId: number }
  | { type: 'TERRITORY_CLICKED'; territoryId: string }
  | { type: 'MAP_CLICKED' }
  | { type: 'MESSAGE_SENT';      msg: AgentMessage }
  | { type: 'ACTIVITY';          agentId: number; activityId: string; territoryId: string }
  | { type: 'BROADCAST' }
  | { type: 'MIGRATION';         agentId: number; from: string; to: string }
