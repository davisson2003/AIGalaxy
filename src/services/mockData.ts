import type { Agent, FeedEvent, AgentMessage, MessageType } from '@/types'
import { TERRITORIES } from '@/constants/territories'
import { MSG_COLORS, MSG_LABELS } from '@/constants/colors'

// ─── Agent generation ────────────────────────────────────────────────────────

const AGENT_NAMES = [
  'Alpha','Nexus','Orion','Nova','Echo','Vega','Lyra','Cygnus',
  'Rigel','Sirius','Draco','Hydra','Titan','Atlas','Cronos',
  'Helios','Zeta','Kappa','Omega','Delta','Psi','Sigma','Theta','Lambda',
]

const SKILLS_POOL = [
  'bnb-transfer','contract-call','agent-communicate','swap-v3','add-liquidity',
  'supply-asset','borrow-asset','stake-bnb','price-feed','cex-data','aster-yield',
  'task-delegate','wallet-query',
]

function randomHex(len = 8): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase()
}

function randomSkills(): string[] {
  const count = 2 + Math.floor(Math.random() * 4)
  const shuffled = [...SKILLS_POOL].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

export function generateAgents(count = 28): Agent[] {
  return Array.from({ length: count }, (_, i) => {
    const terr = TERRITORIES[Math.floor(Math.random() * TERRITORIES.length)]
    return {
      id: i + 1,
      name: `${AGENT_NAMES[i % AGENT_NAMES.length]} #${String(i + 1).padStart(3, '0')}`,
      territory: terr.id,
      color: terr.color,
      x: 0,
      y: 0,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      reputation: 50 + Math.floor(Math.random() * 450),
      skills: randomSkills(),
      interactions: Math.floor(Math.random() * 300),
      tba: `0x${randomHex(40)}`,
      tokenId: i + 1,
      lastActive: Date.now() - Math.floor(Math.random() * 3600000),
      active: Math.random() > 0.2,
    }
  })
}

// ─── Event simulation ────────────────────────────────────────────────────────

const MSG_TYPES: MessageType[] = [
  'GREETING','TASK_REQUEST','TASK_RESPONSE',
  'SKILL_SIGNAL','REPUTATION_ENDORSE','TERRITORY_INVITE',
]

const ACTIVITIES = [
  'executed swap','supplied assets','staked BNB',
  'fetched price data','claimed rewards','borrowed assets',
  'added liquidity','bridged assets','published signal',
]

let _feedId = 0
function feedId() { return `feed-${++_feedId}` }

export function makeMessageEvent(agents: Agent[]): { event: FeedEvent; msg: AgentMessage } | null {
  if (agents.length < 2) return null
  const a = agents[Math.floor(Math.random() * agents.length)]
  let b = agents[Math.floor(Math.random() * agents.length)]
  if (a.id === b.id) return null
  const msgType = MSG_TYPES[Math.floor(Math.random() * MSG_TYPES.length)]
  const color = MSG_COLORS[msgType]
  const label = MSG_LABELS[msgType]
  const verbs: Record<string, string> = {
    GREETING: 'greeted',
    TASK_REQUEST: 'sent task to',
    TASK_RESPONSE: 'completed task for',
    SKILL_SIGNAL: 'signaled skill to',
    REPUTATION_ENDORSE: 'endorsed',
    TERRITORY_INVITE: 'invited',
  }
  const msg: AgentMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    fromAgentId: a.id,
    toAgentId: b.id,
    msgType,
    timestamp: Date.now(),
    txHash: `0x${randomHex(64)}`,
  }
  const event: FeedEvent = {
    id: feedId(),
    type: 'message',
    label,
    color,
    text: `${a.name} ${verbs[msgType] ?? 'messaged'} ${b.name}`,
    timestamp: Date.now(),
  }
  return { event, msg }
}

export function makeActivityEvent(agents: Agent[]): FeedEvent | null {
  const agent = agents[Math.floor(Math.random() * agents.length)]
  const terr = TERRITORIES.find(t => t.id === agent.territory)
  if (!terr) return null
  const act = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)]
  return {
    id: feedId(),
    type: 'activity',
    label: 'ACTIVITY',
    color: '#34D399',
    text: `${agent.name} ${act} on ${terr.icon} ${terr.name}`,
    timestamp: Date.now(),
  }
}

export function makeBroadcastEvent(): FeedEvent {
  return {
    id: feedId(),
    type: 'broadcast',
    label: 'BROADCAST',
    color: '#F0B90B',
    text: 'BNBChain Square sent global broadcast to all territories',
    timestamp: Date.now(),
  }
}

export function makeMigrateEvent(agent: Agent, fromId: string, toId: string): FeedEvent {
  const from = TERRITORIES.find(t => t.id === fromId)!
  const to   = TERRITORIES.find(t => t.id === toId)!
  return {
    id: feedId(),
    type: 'migrate',
    label: 'MIGRATE',
    color: '#A78BFA',
    text: `${agent.name} moved ${from.icon} ${from.name} → ${to.icon} ${to.name}`,
    timestamp: Date.now(),
  }
}
