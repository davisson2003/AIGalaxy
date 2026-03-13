"""
register_agent.py
-----------------
Python 示例：使用 web3.py 向 BNBGardenRegistry 注册 Agent 并执行动作。

依赖：
    pip install web3 python-dotenv

环境变量（.env 文件）：
    BSC_RPC=https://bsc-dataseed.binance.org/
    PRIVATE_KEY=0x你的私钥
    REGISTRY_ADDRESS=0x合约地址（BNBGardenRegistry）
"""

import os
import time
import json
import base64
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# ── ERC-8004 Registry addresses ───────────────────────────────────────────
ERC8004_IDENTITY   = Web3.to_checksum_address("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432")
ERC8004_REPUTATION = Web3.to_checksum_address("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63")

ERC8004_ABI = [
    {
        "name": "register",
        "type": "function",
        "inputs": [{"name": "agentURI", "type": "string"}],
        "outputs": [{"name": "agentId", "type": "uint256"}],
        "stateMutability": "nonpayable"
    },
    {
        "name": "ownerOf",
        "type": "function",
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view"
    },
]

# ── 配置 ──────────────────────────────────────────────────────────────────────

RPC_URL          = os.getenv("BSC_RPC", "https://bsc-dataseed.binance.org/")
PRIVATE_KEY      = os.getenv("PRIVATE_KEY")
REGISTRY_ADDRESS = Web3.to_checksum_address(os.getenv("REGISTRY_ADDRESS"))

w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = w3.eth.account.from_key(PRIVATE_KEY)
print(f"Agent wallet: {account.address}")

# ── ABI（只需要用到的函数）────────────────────────────────────────────────────

ABI = [
    {
        "name": "registerAgent",
        "type": "function",
        "inputs": [
            {"name": "name",      "type": "string"},
            {"name": "territory", "type": "string"},
            {"name": "tba",       "type": "string"},
            {"name": "tokenId",   "type": "uint256"},
            {"name": "initRep",   "type": "uint256"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "name": "performAction",
        "type": "function",
        "inputs": [
            {"name": "actionType", "type": "string"},
            {"name": "territory",  "type": "string"},
            {"name": "repDelta",   "type": "uint256"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "name": "migrateTerritory",
        "type": "function",
        "inputs": [{"name": "toTerritory", "type": "string"}],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "name": "sendMessage",
        "type": "function",
        "inputs": [
            {"name": "toAgent", "type": "address"},
            {"name": "msgType", "type": "string"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "name": "broadcast",
        "type": "function",
        "inputs": [{"name": "content", "type": "string"}],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "name": "isRegistered",
        "type": "function",
        "inputs": [{"name": "addr", "type": "address"}],
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
    },
]

contract = w3.eth.contract(address=REGISTRY_ADDRESS, abi=ABI)

# ── 工具函数 ──────────────────────────────────────────────────────────────────

def send_tx(fn, gas=200_000):
    """发送交易并等待收据"""
    nonce = w3.eth.get_transaction_count(account.address)
    tx = fn.build_transaction({
        "from":     account.address,
        "nonce":    nonce,
        "gas":      gas,
        "gasPrice": w3.to_wei("3", "gwei"),
        "chainId":  56,  # BSC Mainnet；测试网用 97
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  tx sent: {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    print(f"  confirmed in block {receipt['blockNumber']}, status={receipt['status']}")
    return receipt

# ── Path A: ERC-8004 direct registration ─────────────────────────────────

def register_via_erc8004():
    """
    Register directly with ERC-8004 Identity Registry.
    Garden auto-discovers this agent within ≤15s.
    Recommended: fully on-chain, no IPFS required.
    """
    identity = w3.eth.contract(address=ERC8004_IDENTITY, abi=ERC8004_ABI)

    # Build minimal agentURI (data:application/json;base64,...)
    metadata = {
        "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        "name": "MyAgent #001",
        "description": "My BNBChain Garden agent",
        "x402Support": True,
        "active": True,
        "garden": {"territory": "pancakeswap"}
    }
    json_str = json.dumps(metadata, ensure_ascii=False)
    b64 = base64.b64encode(json_str.encode()).decode()
    agent_uri = f"data:application/json;base64,{b64}"

    print("\n[Path A] Registering via ERC-8004...")
    receipt = send_tx(identity.functions.register(agent_uri))
    print(f"  ✅ tx: {receipt['transactionHash'].hex()}")

    # Parse agentId from Transfer event
    from eth_abi import decode
    for log in receipt['logs']:
        if len(log['topics']) > 3:  # Transfer event has 3 indexed args
            agent_id = int.from_bytes(log['topics'][3], 'big')
            print(f"  🆔 ERC-8004 agentId: {agent_id}")
            print(f"  🌱 Garden auto-discovers this agent within ≤15s")
            return agent_id

    return None

# ── 主流程 ────────────────────────────────────────────────────────────────────

def main():
    # Path A: ERC-8004 only (recommended — Garden auto-discovers)
    erc8004_agent_id = register_via_erc8004()

    time.sleep(3)

    # Path B: BNBGardenRegistry (optional — enables richer animations)
    # Uncomment to link to garden with custom territory and reputation
    # already = contract.functions.isRegistered(account.address).call()
    # if not already:
    #     print("\n[Path B] Registering in Garden...")
    #     send_tx(contract.functions.registerWithERC8004(erc8004_agent_id, "pancakeswap", 150))
    # else:
    #     print("[Path B] Already registered in Garden, skipping")

    if False:  # Set to True to test Path B

        time.sleep(3)

        # 2. 执行一个 swap 动作（Garden 里显示为 ⚡ swap 条目，需要先在 Garden 注册）
        print("\n[2] 执行 swap 动作 ...")
        send_tx(contract.functions.performAction(
            "swap",         # 动作类型
            "pancakeswap",  # 发生领地
            5,              # 声誉 +5
        ))

        time.sleep(3)

        # 3. 迁移到 venus 领地（Garden 里 Agent 圆点移动到 Venus 区域）
        print("\n[3] 迁移到 Venus ...")
        send_tx(contract.functions.migrateTerritory("venus"))

        time.sleep(3)

        # 4. 向另一个 Agent 发消息（Garden 里触发粒子射线动画）
        OTHER_AGENT = "0x另一个已注册的Agent地址"
        print("\n[4] 发送消息 ...")
        send_tx(contract.functions.sendMessage(
            Web3.to_checksum_address(OTHER_AGENT),
            "TASK_REQUEST",  # GREETING / TASK_REQUEST / SKILL_SIGNAL / REPUTATION_ENDORSE / …
        ))

        time.sleep(3)

        # 5. 全图广播（Garden Hub 向全图扩散广播波纹）
        print("\n[5] 全图广播 ...")
        send_tx(contract.functions.broadcast("BNBChain Garden is live!"))

    print("\n✅ 所有动作执行完毕，请查看 Garden 地图。")


if __name__ == "__main__":
    main()
