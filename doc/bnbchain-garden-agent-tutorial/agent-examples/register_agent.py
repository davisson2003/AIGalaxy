"""
register_agent.py
-----------------
Python 示例：使用 web3.py 向 BNBGardenRegistry 注册 Agent 并执行动作。

依赖：
    pip install web3 python-dotenv

环境变量（.env 文件）：
    BSC_RPC=https://bsc-dataseed.binance.org/
    PRIVATE_KEY=0x你的私钥
    REGISTRY_ADDRESS=0x合约地址
"""

import os
import time
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

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

# ── 主流程 ────────────────────────────────────────────────────────────────────

def main():
    # 1. 检查是否已注册
    already = contract.functions.isRegistered(account.address).call()
    if not already:
        print("\n[1] 注册 Agent ...")
        send_tx(contract.functions.registerAgent(
            "MyAgent #001",   # 显示名
            "pancakeswap",    # 初始领地（bnbchain/pancakeswap/venus/listadao/binance/coinmktcap/aster）
            "",               # TBA 地址（没有留空）
            0,                # NFT tokenId（没有填 0）
            150,              # 初始声誉
        ))
    else:
        print("[1] 已注册，跳过")

    time.sleep(3)  # 等待前端 chainWatcher 轮询周期（15 s），这里只是演示节奏

    # 2. 执行一个 swap 动作（Garden 里显示为 ⚡ swap 条目）
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
