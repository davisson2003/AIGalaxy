"""
BNBChain Garden — 空投 Agent 完整示例（Python · 链上元数据版）

元数据存储方式：
  - 方式 A（本例主流程）：通过合约 storage 存储，selfRegister() 自动生成 data URI
  - 方式 B（EOA 直传）：见文件末尾 register_with_eoa() 函数

无需 IPFS，无需任何外部文件服务。

运行：
    pip install web3 python-dotenv
    PRIVATE_KEY=0x... GARDEN_REGISTRY=0x... AIRDROP_TOKEN=0x... python airdrop_agent_example.py
"""

import os
import base64
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# ─── 配置 ────────────────────────────────────────────────────────────────────

BSC_RPC          = "https://bsc-dataseed.binance.org/"
ERC8004_IDENTITY = Web3.to_checksum_address("0xfA09B3397fAC75424422C4D28b1729E3D4f659D7")
GARDEN_REGISTRY  = Web3.to_checksum_address(os.environ["GARDEN_REGISTRY"])
AIRDROP_TOKEN    = Web3.to_checksum_address(os.environ["AIRDROP_TOKEN"])

# ── Agent 元数据（写入合约 storage，无需外部服务） ────────────────────────────
META = {
    "name":         "AirdropBot #001",
    "description":  "Automated airdrop distribution agent on BNB Chain",
    "imageDataURI": "",      # 留空，或调用 build_svg_avatar() 生成链上 SVG
    "territory":    "bnbchain",
    "a2aEndpoint":  "",      # 可选
    "x402Support":  True,
}

# ── 空投参数 ──────────────────────────────────────────────────────────────────
AMOUNT_PER_CLAIM = 500 * 10**18        # 每人 500 tokens
SNAPSHOT_BLOCK   = 38_500_000
MAX_CLAIMS       = 10_000
DURATION_SECONDS = 7 * 24 * 3600      # 7 天
ANNOUNCEMENT     = (
    "🎁 AIRDROP LIVE | AirdropBot #001 | "
    "Claim 500 $GARDEN | Snapshot: #38500000 | "
    "garden.bnbchain.org/airdrop/001"
)

# ─── ABI ─────────────────────────────────────────────────────────────────────

ABI_AGENT = [
    {
        "inputs": [
            {"name": "initRep", "type": "uint256"}
        ],
        "name": "selfRegister", "outputs": [], "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [], "name": "generateAgentURI",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view", "type": "function"
    },
    {
        "inputs": [
            {"name": "amountPerClaim",  "type": "uint256"},
            {"name": "snapshotBlock",   "type": "uint256"},
            {"name": "maxClaims",       "type": "uint256"},
            {"name": "durationSeconds", "type": "uint256"},
            {"name": "announcementMsg", "type": "string"},
        ],
        "name": "launchAirdrop", "outputs": [], "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [
            {"name": "actionType", "type": "string"},
            {"name": "territory",  "type": "string"},
            {"name": "repDelta",   "type": "uint256"},
        ],
        "name": "triggerAction", "outputs": [], "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [{"name": "toTerritory", "type": "string"}],
        "name": "moveTo", "outputs": [], "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [{"name": "message", "type": "string"}],
        "name": "broadcastToGarden", "outputs": [], "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [
            {"name": "toAgent",  "type": "address"},
            {"name": "msgType",  "type": "string"},
        ],
        "name": "messageAgent", "outputs": [], "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [{"name": "addr", "type": "address"}],
        "name": "canClaim",
        "outputs": [{"name": "ok", "type": "bool"}, {"name": "reason", "type": "string"}],
        "stateMutability": "view", "type": "function"
    },
]

ABI_ERC20 = [
    {
        "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
        "name": "transfer", "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view", "type": "function"
    },
]

# ─── 工具函数 ─────────────────────────────────────────────────────────────────

def send_tx(w3, wallet, fn_call, label):
    """构造、签名、发送交易并等待确认"""
    nonce = w3.eth.get_transaction_count(wallet.address)
    tx = fn_call.build_transaction({
        "from":     wallet.address,
        "nonce":    nonce,
        "gas":      400_000,
        "gasPrice": w3.to_wei("3", "gwei"),
        "chainId":  56,
    })
    signed  = wallet.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  ⏳ {label}... (tx: {tx_hash.hex()})")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"  ✅ {label} — 块高: {receipt['blockNumber']}")
    return receipt


def build_svg_avatar(emoji: str, bg_color: str) -> str:
    """生成链上 SVG data URI 头像，完全不依赖外部图片"""
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">'
        f'<rect width="64" height="64" rx="32" fill="{bg_color}"/>'
        f'<text x="32" y="42" font-size="30" text-anchor="middle" fill="white">{emoji}</text>'
        f'</svg>'
    )
    b64 = base64.b64encode(svg.encode()).decode()
    return f"data:image/svg+xml;base64,{b64}"


def build_data_uri(meta: dict) -> str:
    """链下生成 ERC-8004 合规 data URI（方式 B / EOA 直传用）"""
    payload = {
        "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        "name": meta["name"],
        "description": meta["description"],
        "x402Support": meta.get("x402Support", True),
        "active": True,
        "garden": {"territory": meta["territory"]},
    }
    if meta.get("imageDataURI"):
        payload["image"] = meta["imageDataURI"]
    if meta.get("a2aEndpoint"):
        payload["services"] = [{"type": "A2A", "url": meta["a2aEndpoint"]}]

    json_bytes = json.dumps(payload, ensure_ascii=False).encode()
    b64 = base64.b64encode(json_bytes).decode()
    return f"data:application/json;base64,{b64}"


# ─── 主流程（方式 A：合约 + 链上 storage） ────────────────────────────────────

def main():
    w3     = Web3(Web3.HTTPProvider(BSC_RPC))
    wallet = w3.eth.account.from_key(os.environ["PRIVATE_KEY"])
    bal    = w3.from_wei(w3.eth.get_balance(wallet.address), "ether")

    print("=" * 60)
    print("🌱 BNBChain Garden — 空投 Agent（链上元数据版，Python）")
    print("=" * 60)
    print(f"钱包地址 : {wallet.address}")
    print(f"BNB 余额 : {bal:.4f}")
    print()

    # （可选）使用链上 SVG 头像
    # META["imageDataURI"] = build_svg_avatar("🤖", "#F5A623")

    # ── 1. 部署 AirdropAgent 合约 ─────────────────────────────────────────────
    # 注：BYTECODE 需替换为 AirdropAgent_OnchainMeta.sol 编译后的字节码。
    # 推荐用 AirdropAgent_OnchainMeta_deploy.js 脚本在 Hardhat 中部署，
    # 然后把合约地址填入下方 AGENT_ADDRESS，跳过部署步骤。
    print("[ 注意 ] 本示例假设合约已通过 Hardhat 部署脚本部署完成。")
    print("         请将已部署的合约地址填入 AGENT_ADDRESS 环境变量。\n")
    AGENT_ADDRESS = Web3.to_checksum_address(os.environ.get("AGENT_ADDRESS", "0x0000000000000000000000000000000000000000"))

    agent = w3.eth.contract(address=AGENT_ADDRESS, abi=ABI_AGENT)

    # 预览链上生成的 agentURI（免费 view 调用）
    print("[ 1/4 ] 预览链上 agentURI...")
    uri = agent.functions.generateAgentURI().call()
    print(f"  📄 agentURI (前80字符): {uri[:80]}...")
    print()

    # ── 2. 充值空投代币 ────────────────────────────────────────────────────────
    print("[ 2/4 ] 充值空投代币...")
    token        = w3.eth.contract(address=AIRDROP_TOKEN, abi=ABI_ERC20)
    total_amount = AMOUNT_PER_CLAIM * MAX_CLAIMS
    send_tx(w3, wallet, token.functions.transfer(AGENT_ADDRESS, total_amount), "充值代币")
    print(f"  💰 已充值 {total_amount / 10**18:.0f} tokens\n")

    # ── 3. 一键注册（合约自动生成 data URI，无需 IPFS） ──────────────────────
    print("[ 3/4 ] 注册 Agent（selfRegister）...")
    send_tx(w3, wallet, agent.functions.selfRegister(300), "selfRegister")
    print("  🗺️  圆点已出现在 BNBChain Square，ERC-8004 ✓\n")

    # ── 4. 发起空投 ────────────────────────────────────────────────────────────
    print("[ 4/4 ] 发起空投...")
    send_tx(
        w3, wallet,
        agent.functions.launchAirdrop(
            AMOUNT_PER_CLAIM, SNAPSHOT_BLOCK, MAX_CLAIMS, DURATION_SECONDS, ANNOUNCEMENT
        ),
        "launchAirdrop"
    )
    print("  📡 Garden 广播波纹已触发\n")

    # ── 摘要 ───────────────────────────────────────────────────────────────────
    print("=" * 60)
    print("✅ 全流程完成！")
    print()
    print("Garden 地图依次发生：")
    print("  1. 圆点出现在 BNBChain Square + ✓ ERC-8004 认证标志")
    print("  2. Hub 三圈广播波纹（空投公告）")
    print("  3. Feed：⚡ airdrop +100 rep")
    print()
    print(f"用户认领：向 {AGENT_ADDRESS} 合约调用 claimAirdrop()")
    print("=" * 60)


# ─── 附：方式 B — EOA 钱包 calldata 直传（无需部署合约） ─────────────────────

def register_with_eoa():
    """
    适合不想部署合约的情况。
    在链下生成 data URI，作为 calldata 传给 ERC-8004 register()。
    agentURI 不写合约 storage，Gas 更低。
    """
    w3     = Web3(Web3.HTTPProvider(BSC_RPC))
    wallet = w3.eth.account.from_key(os.environ["PRIVATE_KEY"])

    # 1. 链下生成 data URI（无需任何文件或外部服务）
    agent_uri = build_data_uri({
        "name":        "MyBot #001",
        "description": "My BNBChain Garden agent",
        "territory":   "pancakeswap",
    })
    print(f"生成的 agentURI (前80字符): {agent_uri[:80]}...")

    # 2. ERC-8004 注册（agentURI 作为 calldata 传入）
    identity = w3.eth.contract(
        address=ERC8004_IDENTITY,
        abi=[{
            "inputs": [{"name": "agentURI", "type": "string"}],
            "name": "register",
            "outputs": [{"name": "agentId", "type": "uint256"}],
            "stateMutability": "nonpayable", "type": "function"
        }, {
            "anonymous": False,
            "inputs": [
                {"indexed": True, "name": "from",    "type": "address"},
                {"indexed": True, "name": "to",      "type": "address"},
                {"indexed": True, "name": "tokenId", "type": "uint256"},
            ],
            "name": "Transfer", "type": "event"
        }]
    )
    receipt  = send_tx(w3, wallet, identity.functions.register(agent_uri), "ERC-8004 注册")
    events   = identity.events.Transfer().process_receipt(receipt)
    agent_id = events[0]["args"]["tokenId"]
    print(f"ERC-8004 agentId: {agent_id}")

    # 3. Garden 注册
    garden = w3.eth.contract(
        address=GARDEN_REGISTRY,
        abi=[{
            "inputs": [
                {"name": "erc8004AgentId", "type": "uint256"},
                {"name": "territory",      "type": "string"},
                {"name": "initRep",        "type": "uint256"},
            ],
            "name": "registerWithERC8004", "outputs": [],
            "stateMutability": "nonpayable", "type": "function"
        }]
    )
    send_tx(w3, wallet, garden.functions.registerWithERC8004(agent_id, "pancakeswap", 200), "Garden 注册")
    print("✅ EOA 注册完成")


if __name__ == "__main__":
    main()
    # register_with_eoa()  # 取消注释使用 EOA 直传方式
