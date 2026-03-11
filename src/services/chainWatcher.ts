/**
 * chainWatcher.ts
 *
 * Polls BSC mainnet for real on-chain events and converts them into
 * FeedEvent / agent-reputation updates for the Garden store.
 *
 * Strategy: getLogs over the last N blocks every POLL_INTERVAL ms.
 * No WebSocket required — works with any free HTTP RPC.
 */

import { ethers } from 'ethers'
import type { FeedEvent } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Polling cadence in ms.  15 s keeps us well under free-tier rate limits. */
const POLL_INTERVAL = 15_000

/** How many blocks to scan per poll (BSC ≈ 3 s/block → 5 blocks ≈ 15 s) */
const BLOCKS_PER_POLL = 5

// ── Well-known BSC contract addresses ─────────────────────────────────────────

/**
 * PancakeSwap V2 — "Swap" events from any pair.
 * We watch the Factory for PairCreated first, then any swap on any pair.
 * Simpler: watch the Router address for outgoing calls (not available in logs),
 * so instead we index a list of high-volume V2 pairs directly.
 */
const PANCAKE_PAIRS = [
  '0x0eD7e52944161450477ee417DE9Cd3a859b14fD0', // CAKE/WBNB
  '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16', // BNB/BUSD
  '0x7EFaEf62fDdCCa950418312c6C702547944796Cf', // USDT/BUSD
]

/** Venus vBNB — Mint / Redeem / Borrow / RepayBorrow */
const VENUS_VBNB   = '0xA07c5b74C9B40447a954e1466938b865b6BBea36'
/** Venus vUSDT */
const VENUS_VUSDT  = '0xfD5840Cd36d94D7229439859C0112a4185BC0255'
/** Venus vBTC */
const VENUS_VBTC   = '0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B'

/** ListaDAO — HAY token Transfer (large transfers = protocol activity) */
const LISTA_HAY    = '0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5'
/** LISTA governance token */
const LISTA_TOKEN  = '0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46'

// ── Event topics (keccak256 of signature) ─────────────────────────────────────

// PancakeSwap V2: Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)
const TOPIC_SWAP   = ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)')

// Venus CToken: Mint(address minter, uint mintAmount, uint mintTokens)
const TOPIC_MINT   = ethers.id('Mint(address,uint256,uint256)')
// Venus CToken: Redeem(address redeemer, uint redeemAmount, uint redeemTokens)
const TOPIC_REDEEM = ethers.id('Redeem(address,uint256,uint256)')
// Venus CToken: Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows)
const TOPIC_BORROW = ethers.id('Borrow(address,uint256,uint256,uint256)')
// Venus CToken: RepayBorrow(address payer, address borrower, uint repayAmount, uint accountBorrows, uint totalBorrows)
const TOPIC_REPAY  = ethers.id('RepayBorrow(address,address,uint256,uint256,uint256)')

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TOPIC_TRANSFER = ethers.id('Transfer(address,address,uint256)')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChainEvent {
  /** Which Garden territory this maps to */
  territory: string
  /** Human-readable label for the feed */
  label: string
  /** Tailwind / hex color hint */
  color: string
  /** Reputation delta for a random agent in that territory */
  repDelta: number
  /** Raw tx hash */
  txHash: string
  /** Block number */
  blockNumber: number
}

export type ChainEventCallback = (events: ChainEvent[]) => void

// ── Helper: shorten address ───────────────────────────────────────────────────

function short(hex: string): string {
  if (hex.length < 10) return hex
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`
}

// ── ChainWatcher class ────────────────────────────────────────────────────────

export class ChainWatcher {
  private provider: ethers.JsonRpcProvider
  private timer: ReturnType<typeof setInterval> | null = null
  private lastBlock = 0
  private cb: ChainEventCallback
  private stopped = false

  constructor(provider: ethers.JsonRpcProvider, callback: ChainEventCallback) {
    this.provider  = provider
    this.cb        = callback
  }

  async start() {
    try {
      this.lastBlock = await this.provider.getBlockNumber()
      console.log(`[ChainWatcher] Starting from block ${this.lastBlock}`)
    } catch {
      console.warn('[ChainWatcher] Could not get initial block, will retry on first poll')
      this.lastBlock = 0
    }

    // First poll immediately, then on interval
    this._poll().catch(console.warn)
    this.timer = setInterval(() => {
      if (!this.stopped) this._poll().catch(console.warn)
    }, POLL_INTERVAL)
  }

  stop() {
    this.stopped = true
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  private async _poll() {
    try {
      const latest = await this.provider.getBlockNumber()
      if (this.lastBlock === 0) { this.lastBlock = latest - BLOCKS_PER_POLL }

      const fromBlock = this.lastBlock + 1
      const toBlock   = Math.min(latest, fromBlock + BLOCKS_PER_POLL - 1)

      if (fromBlock > toBlock) return

      console.log(`[ChainWatcher] Polling blocks ${fromBlock} → ${toBlock}`)

      // Fire all log queries in parallel
      const [swapLogs, mintLogs, redeemLogs, borrowLogs, repayLogs, hayLogs] =
        await Promise.allSettled([
          this._getLogs(PANCAKE_PAIRS, [TOPIC_SWAP],    fromBlock, toBlock),
          this._getLogs([VENUS_VBNB, VENUS_VUSDT, VENUS_VBTC], [TOPIC_MINT],   fromBlock, toBlock),
          this._getLogs([VENUS_VBNB, VENUS_VUSDT, VENUS_VBTC], [TOPIC_REDEEM], fromBlock, toBlock),
          this._getLogs([VENUS_VBNB, VENUS_VUSDT, VENUS_VBTC], [TOPIC_BORROW], fromBlock, toBlock),
          this._getLogs([VENUS_VBNB, VENUS_VUSDT, VENUS_VBTC], [TOPIC_REPAY],  fromBlock, toBlock),
          this._getLogs([LISTA_HAY, LISTA_TOKEN],         [TOPIC_TRANSFER], fromBlock, toBlock),
        ])

      const events: ChainEvent[] = []

      // ── PancakeSwap swaps ──────────────────────────────────────────────────
      if (swapLogs.status === 'fulfilled') {
        for (const log of swapLogs.value.slice(0, 8)) {
          const sender = `0x${log.topics[1].slice(26)}`
          events.push({
            territory: 'pancakeswap',
            label: `🥞 Swap by ${short(sender)}`,
            color: '#3DD6C8',
            repDelta: Math.floor(Math.random() * 3) + 1,
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
          })
        }
      }

      // ── Venus mints (supply) ───────────────────────────────────────────────
      if (mintLogs.status === 'fulfilled') {
        for (const log of mintLogs.value.slice(0, 4)) {
          const minter = `0x${log.topics[1]?.slice(26) ?? '0000'}`
          events.push({
            territory: 'venus',
            label: `💜 Supply by ${short(minter)}`,
            color: '#A78BFA',
            repDelta: Math.floor(Math.random() * 4) + 2,
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
          })
        }
      }

      // ── Venus redeems ──────────────────────────────────────────────────────
      if (redeemLogs.status === 'fulfilled') {
        for (const log of redeemLogs.value.slice(0, 3)) {
          const redeemer = `0x${log.topics[1]?.slice(26) ?? '0000'}`
          events.push({
            territory: 'venus',
            label: `💜 Redeem by ${short(redeemer)}`,
            color: '#A78BFA',
            repDelta: Math.floor(Math.random() * 2) + 1,
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
          })
        }
      }

      // ── Venus borrows ──────────────────────────────────────────────────────
      if (borrowLogs.status === 'fulfilled') {
        for (const log of borrowLogs.value.slice(0, 3)) {
          const borrower = `0x${log.topics[1]?.slice(26) ?? '0000'}`
          events.push({
            territory: 'venus',
            label: `📈 Borrow by ${short(borrower)}`,
            color: '#C084FC',
            repDelta: Math.floor(Math.random() * 5) + 3,
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
          })
        }
      }

      // ── Venus repays ───────────────────────────────────────────────────────
      if (repayLogs.status === 'fulfilled') {
        for (const log of repayLogs.value.slice(0, 3)) {
          events.push({
            territory: 'venus',
            label: `✅ Repay on Venus`,
            color: '#86EFAC',
            repDelta: Math.floor(Math.random() * 3) + 2,
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
          })
        }
      }

      // ── ListaDAO HAY/LISTA transfers ───────────────────────────────────────
      if (hayLogs.status === 'fulfilled') {
        for (const log of hayLogs.value.slice(0, 4)) {
          const from = `0x${log.topics[1]?.slice(26) ?? '0000'}`
          const isLista = log.address.toLowerCase() === LISTA_TOKEN.toLowerCase()
          events.push({
            territory: 'listadao',
            label: `${isLista ? '🟢 LISTA' : '🏛️ HAY'} tx by ${short(from)}`,
            color: '#34D399',
            repDelta: Math.floor(Math.random() * 4) + 1,
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
          })
        }
      }

      this.lastBlock = toBlock

      if (events.length > 0) {
        console.log(`[ChainWatcher] ${events.length} events in blocks ${fromBlock}-${toBlock}`)
        this.cb(events)
      }
    } catch (err) {
      console.warn('[ChainWatcher] Poll error:', (err as Error).message)
    }
  }

  private async _getLogs(
    addresses: string[],
    topics: string[],
    fromBlock: number,
    toBlock: number,
  ): Promise<ethers.Log[]> {
    return this.provider.getLogs({
      address: addresses,
      topics: [topics],
      fromBlock,
      toBlock,
    })
  }
}
