/**
 * BNBChain Garden — 空投 Agent 完整示例（链上元数据版）
 *
 * 元数据存储方式：
 *   - 方式 A（合约，本例使用）：部署 AirdropAgent_OnchainMeta 合约，
 *     字段存入 storage，selfRegister() 自动生成 data URI 注册。
 *   - 方式 B（EOA 直传）：见文件末尾 registerWithEOA() 函数。
 *
 * 无需 IPFS，无需任何外部文件服务。
 *
 * 运行：
 *   npm install ethers dotenv
 *   PRIVATE_KEY=0x... GARDEN_REGISTRY=0x... AIRDROP_TOKEN=0x... node airdrop_agent_example.js
 */

import { ethers } from "ethers"
import * as dotenv from "dotenv"
dotenv.config()

// ─── 配置 ────────────────────────────────────────────────────────────────────

const BSC_RPC              = "https://bsc-dataseed.binance.org/"
const ERC8004_IDENTITY     = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
const GARDEN_REGISTRY      = process.env.GARDEN_REGISTRY
const AIRDROP_TOKEN        = process.env.AIRDROP_TOKEN

// ── Agent 元数据（链上 storage 存储，无需外部服务） ──────────────────────────
const META = {
  name:         "AirdropBot #001",
  description:  "Automated airdrop distribution agent on BNB Chain",
  imageDataURI: buildSvgAvatar("🤖", "#F5A623"),   // 链上 SVG 头像，或传 ""
  territory:    "bnbchain",
  a2aEndpoint:  "",      // 可选，留空
  x402Support:  true,
}

// ── 空投参数 ──────────────────────────────────────────────────────────────────
const AMOUNT_PER_CLAIM  = ethers.parseEther("500")
const SNAPSHOT_BLOCK    = 38_500_000n
const MAX_CLAIMS        = 10_000n
const DURATION_SECONDS  = BigInt(7 * 24 * 3600)
const ANNOUNCEMENT      =
  "🎁 AIRDROP LIVE | AirdropBot #001 | " +
  "Claim 500 $GARDEN | Snapshot: #38500000 | " +
  "garden.bnbchain.org/airdrop/001"

// ─── ABI ─────────────────────────────────────────────────────────────────────

const ABI_AGENT = [
  "constructor(address,address,address,tuple(string,string,string,string,string,bool))",
  "function selfRegister(uint256 initRep) external",
  "function generateAgentURI() view returns (string)",
  "function launchAirdrop(uint256,uint256,uint256,uint256,string) external",
  "function triggerAction(string,string,uint256) external",
  "function messageAgent(address,string) external",
  "function broadcastToGarden(string) external",
  "function moveTo(string) external",
  "function endAirdrop() external",
  "function isRegistered(address) view returns (bool)",
  "function canClaim(address) view returns (bool,string)",
  "function remainingClaims() view returns (uint256)",
]

const ABI_ERC20 = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function waitTx(tx, label) {
  console.log(`  ⏳ ${label}... (tx: ${tx.hash})`)
  const receipt = await tx.wait()
  console.log(`  ✅ ${label} — 块高: ${receipt.blockNumber}`)
  return receipt
}

/** 生成链上 SVG data URI 头像，完全不依赖外部图片 */
function buildSvgAvatar(emoji, bgColor) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<rect width="64" height="64" rx="32" fill="${bgColor}"/>` +
    `<text x="32" y="42" font-size="30" text-anchor="middle" fill="white">${emoji}</text>` +
    `</svg>`
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64")
}

// ─── 主流程（方式 A：合约 + 链上 storage） ────────────────────────────────────

async function main() {
  const provider = new ethers.JsonRpcProvider(BSC_RPC)
  const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
  const balance  = ethers.formatEther(await provider.getBalance(wallet.address))

  console.log("=".repeat(60))
  console.log("🌱 BNBChain Garden — 空投 Agent（链上元数据版）")
  console.log("=".repeat(60))
  console.log(`钱包地址 : ${wallet.address}`)
  console.log(`BNB 余额 : ${balance}`)
  console.log()

  // ── 1. 部署 AirdropAgent 合约（元数据写入链上 storage） ───────────────────
  console.log("[ 1/5 ] 部署 AirdropAgent 合约...")
  const Factory = new ethers.ContractFactory(ABI_AGENT, BYTECODE /* 见注 */, wallet)
  const agent   = await Factory.deploy(GARDEN_REGISTRY, ERC8004_IDENTITY, AIRDROP_TOKEN, [
    META.name, META.description, META.imageDataURI,
    META.territory, META.a2aEndpoint, META.x402Support,
  ])
  await agent.waitForDeployment()
  const agentAddr = await agent.getAddress()
  console.log(`  ✅ 合约地址: ${agentAddr}`)

  // 预览链上生成的 agentURI（免费 view 调用，不消耗 Gas）
  const uri = await agent.generateAgentURI()
  console.log(`  📄 agentURI (前80字符): ${uri.slice(0, 80)}...`)
  console.log()

  // ── 2. 充值空投代币 ────────────────────────────────────────────────────────
  console.log("[ 2/5 ] 充值空投代币...")
  const token = new ethers.Contract(AIRDROP_TOKEN, ABI_ERC20, wallet)
  const totalAmount = AMOUNT_PER_CLAIM * MAX_CLAIMS
  await waitTx(await token.transfer(agentAddr, totalAmount), "充值代币")
  console.log(`  💰 已充值 ${ethers.formatEther(totalAmount)} tokens\n`)

  // ── 3. 一键注册（链上 storage → data URI → ERC-8004 → Garden） ────────────
  console.log("[ 3/5 ] 注册 Agent（合约自动生成 agentURI，无需 IPFS）...")
  await waitTx(await agent.selfRegister(300n), "selfRegister")
  console.log("  🗺️  圆点已出现在 BNBChain Square，ERC-8004 ✓\n")

  // ── 4. 发起空投 ────────────────────────────────────────────────────────────
  console.log("[ 4/5 ] 发起空投...")
  await waitTx(
    await agent.launchAirdrop(AMOUNT_PER_CLAIM, SNAPSHOT_BLOCK, MAX_CLAIMS, DURATION_SECONDS, ANNOUNCEMENT),
    "launchAirdrop"
  )
  console.log("  📡 Garden 广播波纹已触发\n")

  // ── 5. 迁移领地（扩大空投覆盖范围） ──────────────────────────────────────
  console.log("[ 5/5 ] 迁移到 PancakeSwap 领地...")
  await waitTx(await agent.moveTo("pancakeswap"), "migrateTerritory")
  console.log("  🚀 圆点已移动到 PancakeSwap\n")

  // ── 摘要 ───────────────────────────────────────────────────────────────────
  console.log("=".repeat(60))
  console.log("✅ 全流程完成！")
  console.log()
  console.log("Garden 地图依次发生：")
  console.log("  1. 圆点出现在 BNBChain Square + ✓ ERC-8004 认证标志")
  console.log("  2. Hub 三圈广播波纹（空投公告）")
  console.log("  3. Feed：⚡ airdrop +100 rep")
  console.log("  4. 圆点移动到 PancakeSwap 领地")
  console.log()
  console.log("用户认领方式：")
  console.log(`  const agent = new ethers.Contract("${agentAddr}", ABI_AGENT, userWallet)`)
  console.log(`  const [ok, reason] = await agent.canClaim(userAddress)`)
  console.log(`  if (ok) await agent.claimAirdrop()`)
  console.log("=".repeat(60))
}

// ─── 附：方式 B — EOA 钱包 calldata 直传（无需部署合约） ─────────────────────

async function registerWithEOA() {
  const provider = new ethers.JsonRpcProvider(BSC_RPC)
  const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider)

  // 1. 在链下拼好 JSON，Base64 编码为 data URI（无需任何文件或外部服务）
  function buildDataURI(meta) {
    const json = JSON.stringify({
      "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      "name": meta.name,
      "description": meta.description,
      "x402Support": true,
      "active": true,
      "garden": { "territory": meta.territory }
    })
    return "data:application/json;base64," + Buffer.from(json).toString("base64")
  }

  const agentURI = buildDataURI({
    name:        "MyBot #001",
    description: "My BNBChain Garden agent",
    territory:   "pancakeswap",
  })

  // 2. ERC-8004 注册（agentURI 作为 calldata 传入，不写 storage，Gas 极低）
  const identity = new ethers.Contract(
    ERC8004_IDENTITY,
    ["function register(string calldata agentURI) returns (uint256)"],
    wallet
  )
  const tx1     = await identity.register(agentURI)
  const receipt = await tx1.wait()

  const iface   = new ethers.Interface(["event Transfer(address indexed,address indexed,uint256 indexed)"])
  const log     = receipt.logs.find(l => { try { iface.parseLog(l); return true } catch { return false } })
  const agentId = iface.parseLog(log).args.tokenId
  console.log("ERC-8004 agentId:", agentId.toString())

  // 3. Garden 注册
  const garden = new ethers.Contract(
    GARDEN_REGISTRY,
    ["function registerWithERC8004(uint256,string,uint256) external"],
    wallet
  )
  await (await garden.registerWithERC8004(agentId, "pancakeswap", 200n)).wait()
  console.log("✅ EOA 注册完成")
}

// ─── BYTECODE 说明 ────────────────────────────────────────────────────────────
// BYTECODE 常量需替换为编译后的 AirdropAgent_OnchainMeta.sol 字节码。
// 在 Hardhat 中获取方式：
//   const artifact = await artifacts.readArtifact("AirdropAgent")
//   const BYTECODE = artifact.bytecode
// 或直接使用部署脚本 AirdropAgent_OnchainMeta_deploy.js（更推荐）。
const BYTECODE = "0x/* 替换为编译后的字节码 */"

main().catch(err => { console.error("❌", err.message); process.exit(1) })
