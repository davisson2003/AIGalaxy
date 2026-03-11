/**
 * registryWatcher.ts
 *
 * 替换 / 扩展 chainWatcher.ts 的注册表事件监听模块。
 * 将 BNBGardenRegistry 合约事件转换为 Garden store 操作。
 *
 * 部署后将 REGISTRY_ADDRESS 替换为实际合约地址即可。
 */

import { ethers } from 'ethers'
import type { Agent, FeedEvent, AgentMessage } from '@/types'

// ── 合约地址（部署后填入）────────────────────────────────────────────────────
export const REGISTRY_ADDRESS = '0xYOUR_DEPLOYED_CONTRACT_ADDRESS'

// ── ABI（只需要事件定义）──────────────────────────────────────────────────────
const REGISTRY_ABI = [
  'event AgentRegistered(address indexed agentAddress, uint256 indexed agentId, string name, string territory, uint256 reputation)',
  'event AgentAction(address indexed agentAddress, string actionType, string territory, uint256 repDelta)',
  'event AgentMigrated(address indexed agentAddress, string fromTerritory, string toTerritory)',
  'event AgentMessage(address indexed fromAgent, address indexed toAgent, string msgType)',
  'event AgentBroadcast(address indexed agentAddress, string content)',

  // 读取 agent profile
  'function getAgent(address addr) view returns (tuple(uint256 agentId, address owner, string name, string territory, string tba, uint256 tokenId, uint256 reputation, uint256 registeredAt, bool active))',
  'function agentCount() view returns (uint256)',
]

// ── 颜色映射（与前端 constants/colors.ts 保持一致）───────────────────────────
const MSG_COLORS: Record<string, string> = {
  GREETING:           '#58A6FF',
  TASK_REQUEST:       '#FFA657',
  TASK_RESPONSE:      '#3FB950',
  SKILL_SIGNAL:       '#D2A8FF',
  REPUTATION_ENDORSE: '#F0B90B',
  TERRITORY_INVITE:   '#FF7B7B',
}

const ACTION_COLORS: Record<string, string> = {
  swap:     '#3DD6C8',
  supply:   '#A78BFA',
  borrow:   '#C084FC',
  stake:    '#34D399',
  signal:   '#60A5FA',
  bridge:   '#FFA657',
  default:  '#58A6FF',
}

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface RegistryEvent {
  kind: 'register' | 'action' | 'migrate' | 'message' | 'broadcast'
  agentAddress: string
  feedEvent: FeedEvent
  // kind === 'register'
  newAgent?: Agent
  // kind === 'action'
  territory?: string
  repDelta?: number
  // kind === 'migrate'
  fromTerritory?: string
  toTerritory?: string
  // kind === 'message'
  toAgentAddress?: string
  agentMsg?: AgentMessage
}

export type RegistryEventCallback = (events: RegistryEvent[]) => void

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

let _feedId = 90_000
function nextId() { return ++_feedId }

// 把合约返回的 tuple 转为 Agent 对象
function profileToAgent(addr: string, p: {
  agentId: bigint; name: string; territory: string
  tba: string; tokenId: bigint; reputation: bigint; active: boolean
}): Agent {
  const TERRITORY_COLORS: Record<string, string> = {
    bnbchain: '#F0B90B', pancakeswap: '#3DD6C8', venus: '#A78BFA',
    listadao: '#34D399', binance: '#F0B90B', coinmktcap: '#60A5FA', aster: '#F87171',
  }
  return {
    id:          Number(p.agentId),
    name:        p.name,
    territory:   p.territory,
    color:       TERRITORY_COLORS[p.territory] ?? '#58A6FF',
    x: 0, y: 0,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    reputation:  Number(p.reputation),
    skills:      [],        // 可从链外数据补充
    interactions: 0,
    tba:         p.tba || addr,
    tokenId:     Number(p.tokenId),
    lastActive:  Date.now(),
    active:      p.active,
  }
}

// ── RegistryWatcher 类 ────────────────────────────────────────────────────────

export class RegistryWatcher {
  private contract: ethers.Contract
  private provider: ethers.JsonRpcProvider
  private cb: RegistryEventCallback
  private lastBlock = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private stopped = false

  // 地址 → agentId 的本地缓存（避免每次查链）
  private addressToId = new Map<string, number>()

  constructor(provider: ethers.JsonRpcProvider, callback: RegistryEventCallback) {
    this.provider = provider
    this.contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider)
    this.cb = callback
  }

  async start() {
    this.lastBlock = await this.provider.getBlockNumber()

    // 启动时，把已注册的 agent 全部载入
    await this._loadExistingAgents()

    // 然后开始轮询新事件（每 15 秒一次）
    this._poll()
    this.timer = setInterval(() => {
      if (!this.stopped) this._poll()
    }, 15_000)
  }

  stop() {
    this.stopped = true
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  // ── 载入历史 Agent ────────────────────────────────────────────────────────

  private async _loadExistingAgents() {
    try {
      const count: bigint = await this.contract.agentCount()
      const events: RegistryEvent[] = []

      for (let i = 1n; i <= count; i++) {
        const addr: string = await this.contract.agentById(i)
        const profile = await this.contract.getAgent(addr)
        const agent = profileToAgent(addr, profile)
        this.addressToId.set(addr.toLowerCase(), agent.id)

        events.push({
          kind: 'register',
          agentAddress: addr,
          newAgent: agent,
          feedEvent: {
            id: nextId(), type: 'chain', timestamp: Date.now(),
            label: '🤖 Registered',
            color: '#F0B90B',
            text: `${agent.name} joined ${agent.territory}`,
          },
        })
      }

      if (events.length > 0) this.cb(events)
      console.log(`[RegistryWatcher] Loaded ${events.length} existing agents`)
    } catch (err) {
      console.warn('[RegistryWatcher] Failed to load existing agents:', err)
    }
  }

  // ── 轮询新事件 ────────────────────────────────────────────────────────────

  private async _poll() {
    try {
      const latest = await this.provider.getBlockNumber()
      const from   = this.lastBlock + 1
      const to     = Math.min(latest, from + 5)
      if (from > to) return

      const [regLogs, actLogs, migLogs, msgLogs, brdLogs] = await Promise.all([
        this.contract.queryFilter(this.contract.filters.AgentRegistered(), from, to),
        this.contract.queryFilter(this.contract.filters.AgentAction(),    from, to),
        this.contract.queryFilter(this.contract.filters.AgentMigrated(),  from, to),
        this.contract.queryFilter(this.contract.filters.AgentMessage(),   from, to),
        this.contract.queryFilter(this.contract.filters.AgentBroadcast(), from, to),
      ])

      const results: RegistryEvent[] = []

      // AgentRegistered ────────────────────────────────────────────────────────
      for (const log of regLogs) {
        const e = log as ethers.EventLog
        const addr      = e.args[0] as string
        const agentId   = Number(e.args[1] as bigint)
        const name      = e.args[2] as string
        const territory = e.args[3] as string
        const rep       = Number(e.args[4] as bigint)

        const agent: Agent = {
          id: agentId, name, territory,
          color: '#F0B90B', x: 0, y: 0,
          vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3,
          reputation: rep, skills: [], interactions: 0,
          tba: addr, tokenId: 0,
          lastActive: Date.now(), active: true,
        }
        this.addressToId.set(addr.toLowerCase(), agentId)

        results.push({
          kind: 'register', agentAddress: addr, newAgent: agent,
          feedEvent: {
            id: nextId(), type: 'chain', timestamp: Date.now(),
            label: '🤖 New Agent',
            color: '#F0B90B',
            text: `${name} joined ${territory}`,
          },
        })
      }

      // AgentAction ────────────────────────────────────────────────────────────
      for (const log of actLogs) {
        const e          = log as ethers.EventLog
        const addr       = e.args[0] as string
        const actionType = e.args[1] as string
        const territory  = e.args[2] as string
        const repDelta   = Number(e.args[3] as bigint)
        const color      = ACTION_COLORS[actionType] ?? ACTION_COLORS.default

        results.push({
          kind: 'action', agentAddress: addr,
          territory, repDelta,
          feedEvent: {
            id: nextId(), type: 'chain', timestamp: Date.now(),
            label: `⚡ ${actionType}`,
            color,
            text: `${short(addr)} performed ${actionType} on ${territory}`,
          },
        })
      }

      // AgentMigrated ──────────────────────────────────────────────────────────
      for (const log of migLogs) {
        const e    = log as ethers.EventLog
        const addr = e.args[0] as string
        const from = e.args[1] as string
        const to   = e.args[2] as string

        results.push({
          kind: 'migrate', agentAddress: addr,
          fromTerritory: from, toTerritory: to,
          feedEvent: {
            id: nextId(), type: 'chain', timestamp: Date.now(),
            label: '🚀 Migrate',
            color: '#A78BFA',
            text: `${short(addr)} moved ${from} → ${to}`,
          },
        })
      }

      // AgentMessage ───────────────────────────────────────────────────────────
      for (const log of msgLogs) {
        const e       = log as ethers.EventLog
        const fromAddr = e.args[0] as string
        const toAddr   = e.args[1] as string
        const msgType  = e.args[2] as string
        const color    = MSG_COLORS[msgType] ?? '#58A6FF'

        const fromId = this.addressToId.get(fromAddr.toLowerCase()) ?? 0
        const toId   = this.addressToId.get(toAddr.toLowerCase())   ?? 0

        const agentMsg: AgentMessage = {
          id:          `msg-${log.transactionHash}`,
          fromAgentId: fromId,
          toAgentId:   toId,
          msgType:     msgType as AgentMessage['msgType'],
          timestamp:   Date.now(),
          txHash:      log.transactionHash,
        }

        results.push({
          kind: 'message', agentAddress: fromAddr,
          toAgentAddress: toAddr, agentMsg,
          feedEvent: {
            id: nextId(), type: 'chain', timestamp: Date.now(),
            label: `💬 ${msgType}`,
            color,
            text: `${short(fromAddr)} → ${short(toAddr)}`,
          },
        })
      }

      // AgentBroadcast ─────────────────────────────────────────────────────────
      for (const log of brdLogs) {
        const e    = log as ethers.EventLog
        const addr = e.args[0] as string

        results.push({
          kind: 'broadcast', agentAddress: addr,
          feedEvent: {
            id: nextId(), type: 'chain', timestamp: Date.now(),
            label: '📡 Broadcast',
            color: '#F0B90B',
            text: `${short(addr)} sent a global broadcast`,
          },
        })
      }

      this.lastBlock = to
      if (results.length > 0) this.cb(results)

    } catch (err) {
      console.warn('[RegistryWatcher] Poll error:', (err as Error).message)
    }
  }
}
