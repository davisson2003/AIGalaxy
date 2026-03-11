/**
 * register_agent.js
 * Node.js 版本，使用 ethers.js v6（与前端保持一致）
 *
 * npm install ethers dotenv
 *
 * .env 文件：
 *   BSC_RPC=https://bsc-dataseed.binance.org/
 *   PRIVATE_KEY=0x你的私钥
 *   REGISTRY_ADDRESS=0x合约地址
 */

import { ethers } from 'ethers'
import 'dotenv/config'

// ── 配置 ──────────────────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(
  process.env.BSC_RPC ?? 'https://bsc-dataseed.binance.org/'
)
const wallet  = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
console.log('Agent wallet:', wallet.address)

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS

const ABI = [
  'function registerAgent(string name, string territory, string tba, uint256 tokenId, uint256 initRep)',
  'function performAction(string actionType, string territory, uint256 repDelta)',
  'function migrateTerritory(string toTerritory)',
  'function sendMessage(address toAgent, string msgType)',
  'function broadcast(string content)',
  'function isRegistered(address addr) view returns (bool)',
  'function getAgent(address addr) view returns (tuple(uint256 agentId, address owner, string name, string territory, string tba, uint256 tokenId, uint256 reputation, uint256 registeredAt, bool active))',
]

const registry = new ethers.Contract(REGISTRY_ADDRESS, ABI, wallet)

// ── 工具函数 ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function sendTx(txPromise, label) {
  console.log(`\n  [${label}] sending...`)
  const tx = await txPromise
  console.log(`  tx: ${tx.hash}`)
  const receipt = await tx.wait()
  console.log(`  confirmed in block ${receipt.blockNumber}`)
  return receipt
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {

  // 1. 注册 Agent
  const already = await registry.isRegistered(wallet.address)
  if (!already) {
    await sendTx(
      registry.registerAgent(
        'MyAgent #001',  // 显示名
        'pancakeswap',   // 初始领地
        '',              // TBA（可选）
        0n,              // tokenId（可选）
        150n,            // 初始声誉
      ),
      'Register'
    )
  } else {
    console.log('\n  [Register] already registered, skipping')
  }

  await sleep(3000)

  // 2. 执行 swap 动作
  await sendTx(
    registry.performAction('swap', 'pancakeswap', 5n),
    'Action: swap'
  )

  await sleep(3000)

  // 3. supply 动作
  await sendTx(
    registry.performAction('supply', 'venus', 8n),
    'Action: supply'
  )

  await sleep(3000)

  // 4. 迁移领地
  await sendTx(
    registry.migrateTerritory('venus'),
    'Migrate → venus'
  )

  await sleep(3000)

  // 5. 发消息（需要另一个已注册的 Agent 地址）
  const OTHER_AGENT = '0x另一个已注册Agent的地址'
  if (OTHER_AGENT !== '0x另一个已注册Agent的地址') {
    await sendTx(
      registry.sendMessage(OTHER_AGENT, 'TASK_REQUEST'),
      'Message: TASK_REQUEST'
    )
    await sleep(3000)
  }

  // 6. 全图广播
  await sendTx(
    registry.broadcast('Agent online and ready!'),
    'Broadcast'
  )

  console.log('\n✅ 完成！请观察 Garden 地图的变化。')
}

main().catch(console.error)
