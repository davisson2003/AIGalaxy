/**
 * register_agent.js
 * Node.js 版本，使用 ethers.js v6（与前端保持一致）
 *
 * npm install ethers dotenv
 *
 * .env 文件：
 *   BSC_RPC=https://bsc-dataseed.binance.org/
 *   PRIVATE_KEY=0x你的私钥
 *   REGISTRY_ADDRESS=0x合约地址（BNBGardenRegistry）
 */

import { ethers } from 'ethers'
import 'dotenv/config'

// ── ERC-8004 Registry addresses ───────────────────────────────────────────
const ERC8004_IDENTITY   = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"  // Identity Registry
const ERC8004_REPUTATION = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"  // Reputation Registry

const ERC8004_ABI = [
  'function register(string agentURI) returns (uint256 agentId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]

// ── 配置 ──────────────────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(
  process.env.BSC_RPC ?? 'https://bsc-dataseed.binance.org/'
)
const wallet  = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
console.log('Agent wallet:', wallet.address)

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS

const GARDEN_REGISTRY_ABI = [
  'function registerWithERC8004(uint256 erc8004AgentId, string territory, uint256 initRep)',
  'function registerAgent(string name, string territory, string agentURI, uint256 initRep)',
  'function performAction(string actionType, string territory, uint256 repDelta)',
  'function migrateTerritory(string toTerritory)',
  'function sendMessage(address toAgent, string msgType)',
  'function broadcast(string content)',
  'function isRegistered(address addr) view returns (bool)',
  'function getAgent(address addr) view returns (tuple(uint256 gardenId, uint256 erc8004AgentId, address owner, string name, string territory, string agentURI, uint256 reputation, uint256 registeredAt, bool active, bool erc8004Verified))',
]

const registry = new ethers.Contract(REGISTRY_ADDRESS, GARDEN_REGISTRY_ABI, wallet)

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

// ── Path A: ERC-8004 direct registration ─────────────────────────────────

/**
 * Register directly with ERC-8004 Identity Registry.
 * Garden auto-discovers this agent within ≤15s.
 * Recommended: fully on-chain, no IPFS required.
 */
async function registerViaERC8004() {
  const identity = new ethers.Contract(ERC8004_IDENTITY, ERC8004_ABI, wallet)

  // Build minimal agentURI (data:application/json;base64,...)
  const metadata = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "MyAgent #001",
    description: "My BNBChain Garden agent",
    x402Support: true,
    active: true,
    garden: { territory: "pancakeswap" }
  }
  const jsonStr = JSON.stringify(metadata)
  const b64 = Buffer.from(jsonStr).toString('base64')
  const agentURI = `data:application/json;base64,${b64}`

  console.log('\n[Path A] Registering via ERC-8004...')
  const tx = await identity.register(agentURI)
  const receipt = await tx.wait()
  console.log(`  ✅ tx: ${tx.hash}`)

  // Parse agentId from Transfer event
  const iface = new ethers.Interface(['event Transfer(address indexed, address indexed, uint256 indexed tokenId)'])
  const log = receipt.logs.find(l => {
    try { iface.parseLog(l); return true } catch { return false }
  })
  const agentId = iface.parseLog(log).args.tokenId
  console.log(`  🆔 ERC-8004 agentId: ${agentId}`)
  console.log(`  🌱 Garden auto-discovers this agent within ≤15s`)

  return agentId
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {

  // Path A: ERC-8004 only (recommended — Garden auto-discovers)
  const erc8004AgentId = await registerViaERC8004()

  await sleep(3000)

  // Path B: BNBGardenRegistry (optional — enables richer animations)
  // Uncomment to link to garden with custom territory and reputation
  // const already = await registry.isRegistered(wallet.address)
  // if (!already) {
  //   await sendTx(
  //     registry.registerWithERC8004(erc8004AgentId, 'pancakeswap', 150n),
  //     'Register in Garden'
  //   )
  // } else {
  //   console.log('\n  [Register] already registered in Garden, skipping')
  // }

  if (false) {  // Set to true to test Path B

    // 2. 执行 swap 动作（需要先在 Garden 注册）
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
  }

  console.log('\n✅ 完成！请观察 Garden 地图的变化。')
}

main().catch(console.error)
