/**
 * AirdropAgent（链上元数据版）部署脚本
 *
 * 与 IPFS 版的区别：
 *   - 不需要提前上传 metadata.json
 *   - 所有元数据字段直接传入构造函数，存储在合约 storage
 *   - selfRegister() 无需参数，合约自动生成 agentURI
 *
 * 运行：
 *   npx hardhat run contracts/AirdropAgent_OnchainMeta_deploy.js --network bscTestnet
 */

import { ethers } from "hardhat";

// ─── 配置 ────────────────────────────────────────────────────────────────────

const ERC8004_IDENTITY  = "0xfA09B3397fAC75424422C4D28b1729E3D4f659D7";
const GARDEN_REGISTRY   = "0x你的BNBGardenRegistry地址";
const AIRDROP_TOKEN     = "0x你的BEP20代币地址";

// Agent 元数据（全部存链上，无需 IPFS）
const META = {
  name:         "AirdropBot #001",
  description:  "Automated airdrop distribution agent on BNB Chain",
  imageDataURI: "",             // 留空，或传入 SVG data URI（见下方说明）
  territory:    "bnbchain",
  a2aEndpoint:  "",             // 可选，填 "https://your-agent.com/a2a"
  x402Support:  true,
};

// 空投参数
const AMOUNT_PER_CLAIM  = ethers.parseEther("500");
const SNAPSHOT_BLOCK    = 38_500_000n;
const MAX_CLAIMS        = 10_000n;
const DURATION_SECONDS  = BigInt(7 * 24 * 3600);
const ANNOUNCEMENT      =
  "🎁 AIRDROP LIVE | AirdropBot #001 | " +
  "Claim 500 $GARDEN | garden.bnbchain.org/airdrop/001";

// ─── 可选：链上 SVG 头像示例 ──────────────────────────────────────────────────
//
// 如果想要 Agent 有一个链上头像（纯 SVG，无需外部图片），可以这样生成：
//
//   const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
//     <rect width="64" height="64" rx="32" fill="#F5A623"/>
//     <text x="32" y="40" font-size="28" text-anchor="middle" fill="white">🤖</text>
//   </svg>`
//   META.imageDataURI = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64")

// ─── 部署 ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = ethers.formatEther(await ethers.provider.getBalance(deployer.address));

  console.log("=".repeat(60));
  console.log("🌱 AirdropAgent（链上元数据版）部署");
  console.log("=".repeat(60));
  console.log("部署钱包 :", deployer.address);
  console.log("BNB 余额 :", balance);
  console.log();

  // 1. 部署合约（元数据在构造时写入链上 storage）
  console.log("[ 1/4 ] 部署 AirdropAgent...");
  const Factory = await ethers.getContractFactory("AirdropAgent");
  const agent = await Factory.deploy(GARDEN_REGISTRY, ERC8004_IDENTITY, AIRDROP_TOKEN, META);
  await agent.waitForDeployment();
  const agentAddr = await agent.getAddress();
  console.log("  ✅ 合约地址:", agentAddr);

  // 预览链上会生成的 agentURI（无需任何外部请求）
  const agentURI = await agent.generateAgentURI();
  console.log("  📄 生成的 agentURI（前 80 字符）:", agentURI.slice(0, 80) + "...");
  console.log();

  // 2. 充值空投代币
  console.log("[ 2/4 ] 充值空投代币...");
  const token = await ethers.getContractAt("IERC20", AIRDROP_TOKEN);
  const totalAmount = AMOUNT_PER_CLAIM * MAX_CLAIMS;
  await (await token.transfer(agentAddr, totalAmount)).wait();
  console.log(`  ✅ 已充值 ${ethers.formatEther(totalAmount)} tokens\n`);

  // 3. 链上自动生成 agentURI，完成 ERC-8004 + Garden 双注册
  //    不需要传任何 URI 参数！
  console.log("[ 3/4 ] 注册 Agent（链上元数据 → ERC-8004 → Garden）...");
  await (await agent.selfRegister(300n)).wait();
  const agentId = await agent.erc8004AgentId();
  console.log("  ✅ ERC-8004 agentId:", agentId.toString());
  console.log("  🗺️  Garden 地图已出现圆点\n");

  // 4. 发起空投（broadcast + 声誉动作）
  console.log("[ 4/4 ] 发起空投...");
  await (await agent.launchAirdrop(
    AMOUNT_PER_CLAIM, SNAPSHOT_BLOCK, MAX_CLAIMS, DURATION_SECONDS, ANNOUNCEMENT
  )).wait();
  console.log("  ✅ 空投已发起，Garden 广播波纹触发\n");

  // ── 摘要 ────────────────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("🎉 部署完成！");
  console.log("=".repeat(60));
  console.log("合约地址     :", agentAddr);
  console.log("Agent 名称   :", META.name);
  console.log("初始领地     :", META.territory);
  console.log("ERC-8004 ID :", agentId.toString());
  console.log("每人认领     :", ethers.formatEther(AMOUNT_PER_CLAIM), "tokens");
  console.log("最大人数     :", MAX_CLAIMS.toString());
  console.log();
  console.log("用户认领（ethers.js）:");
  console.log(`  const agent = new ethers.Contract("${agentAddr}", ABI, userWallet)`);
  console.log(`  await agent.claimAirdrop()`);
  console.log();
  console.log("后续修改元数据（无需重新部署）：");
  console.log(`  await agent.updateName("AirdropBot #002")`);
  console.log(`  await agent.updateDescription("Updated description...")`);
  console.log("=".repeat(60));
}

main().catch(err => { console.error("❌", err); process.exit(1); });
