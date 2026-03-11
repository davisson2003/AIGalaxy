/**
 * AirdropAgent 部署脚本（Hardhat）
 *
 * 运行：
 *   npx hardhat run contracts/AirdropAgent_deploy.js --network bscTestnet
 */

import { ethers } from "hardhat";

// ─── 配置 ────────────────────────────────────────────────────────────────────

// BRC-8004 Identity Registry（BSC 主网固定，测试网换成测试网地址）
const ERC8004_IDENTITY   = "0xfA09B3397fAC75424422C4D28b1729E3D4f659D7";

// 你已部署的 BNBGardenRegistry_ERC8004 合约地址
const GARDEN_REGISTRY    = "0x你的BNBGardenRegistry地址";

// 空投代币合约地址（BEP-20）
const AIRDROP_TOKEN      = "0x你的BEP20代币地址";

// 空投参数
const AMOUNT_PER_CLAIM   = ethers.parseEther("500");       // 每人 500 个代币
const SNAPSHOT_BLOCK     = 38_500_000n;                    // 快照块
const MAX_CLAIMS         = 10_000n;                        // 最多 10,000 人
const DURATION_SECONDS   = BigInt(7 * 24 * 3600);         // 7 天
const ANNOUNCEMENT       =
  "🎁 AIRDROP LIVE | AirdropBot #001 | " +
  "Claim 500 $GARDEN | Snapshot: #38500000 | " +
  "garden.bnbchain.org/airdrop/001";

// Agent 元数据（提前上传到 IPFS）
const AGENT_URI          = "ipfs://QmYourAgentMetadataCID"; // 替换为真实 CID
const INITIAL_TERRITORY  = "bnbchain";
const INITIAL_REP        = 300n;

// ─── 部署 ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("部署钱包：", deployer.address);
  console.log(
    "BNB 余额：",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address))
  );
  console.log();

  // 1. 部署 AirdropAgent 合约
  console.log("[ 1/4 ] 部署 AirdropAgent...");
  const Factory = await ethers.getContractFactory("AirdropAgent");
  const agent   = await Factory.deploy(GARDEN_REGISTRY, ERC8004_IDENTITY, AIRDROP_TOKEN);
  await agent.waitForDeployment();
  const agentAddr = await agent.getAddress();
  console.log("  ✅ AirdropAgent 合约地址：", agentAddr);
  console.log();

  // 2. 向合约充值空投代币
  console.log("[ 2/4 ] 充值空投代币到合约...");
  const token = await ethers.getContractAt("IERC20", AIRDROP_TOKEN);
  const totalAmount = AMOUNT_PER_CLAIM * MAX_CLAIMS;
  const transferTx = await token.transfer(agentAddr, totalAmount);
  await transferTx.wait();
  console.log(
    `  ✅ 已转入 ${ethers.formatEther(totalAmount)} 个代币到合约\n`
  );

  // 3. 调用 selfRegister 完成链上注册
  console.log("[ 3/4 ] 注册 Agent（ERC-8004 + Garden）...");
  const regTx = await agent.selfRegister(AGENT_URI, INITIAL_TERRITORY, INITIAL_REP);
  await regTx.wait();
  console.log("  ✅ Agent 已注册，erc8004AgentId：", (await agent.erc8004AgentId()).toString());
  console.log("  🗺️  Garden 地图圆点已出现在 BNBChain Square\n");

  // 4. 发起空投（自动广播 + 触发地图波纹）
  console.log("[ 4/4 ] 发起空投...");
  const launchTx = await agent.launchAirdrop(
    AMOUNT_PER_CLAIM,
    SNAPSHOT_BLOCK,
    MAX_CLAIMS,
    DURATION_SECONDS,
    ANNOUNCEMENT,
  );
  await launchTx.wait();
  console.log("  ✅ 空投已发起！");
  console.log("  📡 Garden 全图广播波纹已触发\n");

  // ── 输出摘要 ────────────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("🎉 部署完成！");
  console.log("=".repeat(60));
  console.log("AirdropAgent 合约 :", agentAddr);
  console.log("每人认领数量      :", ethers.formatEther(AMOUNT_PER_CLAIM), "tokens");
  console.log("快照块高          :", SNAPSHOT_BLOCK.toString());
  console.log("最大认领人数      :", MAX_CLAIMS.toString());
  console.log("认领截止          :", new Date(Date.now() + Number(DURATION_SECONDS) * 1000).toISOString());
  console.log();
  console.log("用户认领方式（ethers.js）：");
  console.log(`  const agent = new ethers.Contract("${agentAddr}", ABI, userWallet)`);
  console.log(`  await agent.claimAirdrop()`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 部署失败：", err);
  process.exit(1);
});
