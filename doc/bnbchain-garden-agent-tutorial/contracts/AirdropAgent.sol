// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ═══════════════════════════════════════════════════════════════════════════
//  BNBChain Garden — AirdropAgent 合约
//
//  功能：
//    1. 自主注册到 ERC-8004 Identity Registry + BNBGardenRegistry
//    2. 发布空投任务（链上记录快照块 / 奖励信息）
//    3. 向 Garden 地图广播空投公告
//    4. 用户认领空投（链上验证 + 转账 BEP-20 代币）
//    5. 执行地图动作（动画触发）
//
//  部署顺序：
//    1. 部署此合约，构造参数传入 gardenRegistry 和 erc8004Identity 地址
//    2. 给合约充值空投代币（transfer airdropToken 到此合约地址）
//    3. 调用 selfRegister() 完成链上注册
//    4. 调用 launchAirdrop() 发起空投
// ═══════════════════════════════════════════════════════════════════════════

// ─── 依赖接口 ─────────────────────────────────────────────────────────────────

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IBNBGardenRegistry {
    function registerWithERC8004(
        uint256 erc8004AgentId,
        string calldata territory,
        uint256 initRep
    ) external;

    function performAction(
        string calldata actionType,
        string calldata territory,
        uint256 repDelta
    ) external;

    function migrateTerritory(string calldata toTerritory) external;

    function sendMessage(address toAgent, string calldata msgType) external;

    function broadcast(string calldata content) external;

    function isRegistered(address addr) external view returns (bool);
}

interface IERC8004IdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 tokenId) external view returns (address);
}

// ─── 主合约 ───────────────────────────────────────────────────────────────────

contract AirdropAgent {

    // ── 状态变量 ───────────────────────────────────────────────────────────────

    address public owner;
    IBNBGardenRegistry  public immutable gardenRegistry;
    IERC8004IdentityRegistry public immutable erc8004Identity;
    IERC20  public airdropToken;

    uint256 public erc8004AgentId;        // ERC-8004 注册后的 agentId
    bool    public gardenRegistered;      // 是否已在 Garden 注册

    // 空投状态
    struct AirdropConfig {
        uint256 amountPerClaim;   // 每次认领数量（含 decimals）
        uint256 snapshotBlock;    // 快照块高
        uint256 maxClaims;        // 最大认领人数（0 = 不限）
        uint256 claimedCount;     // 已认领人数
        uint256 deadline;         // 认领截止时间戳（0 = 不限）
        bool    active;           // 是否开放认领
    }

    AirdropConfig public airdrop;

    mapping(address => bool) public hasClaimed;    // 是否已认领
    mapping(address => bool) public whitelist;     // 白名单（可选）
    bool public useWhitelist;                      // 是否启用白名单

    // ── 事件 ───────────────────────────────────────────────────────────────────

    event AgentRegistered(uint256 indexed erc8004AgentId, address indexed agentContract);
    event AirdropLaunched(uint256 amountPerClaim, uint256 snapshotBlock, uint256 maxClaims);
    event AirdropClaimed(address indexed claimant, uint256 amount);
    event AirdropEnded();
    event GardenBroadcast(string content);
    event GardenAction(string actionType, string territory, uint256 repDelta);
    event WhitelistUpdated(address[] addresses, bool status);

    // ── 修饰符 ────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "AirdropAgent: caller is not owner");
        _;
    }

    modifier onlyRegistered() {
        require(gardenRegistered, "AirdropAgent: not yet registered in Garden");
        _;
    }

    modifier airdropActive() {
        require(airdrop.active, "AirdropAgent: no active airdrop");
        require(airdrop.deadline == 0 || block.timestamp <= airdrop.deadline, "AirdropAgent: airdrop expired");
        _;
    }

    // ─── 构造函数 ─────────────────────────────────────────────────────────────

    constructor(
        address _gardenRegistry,
        address _erc8004Identity,
        address _airdropToken
    ) {
        owner = msg.sender;
        gardenRegistry = IBNBGardenRegistry(_gardenRegistry);
        erc8004Identity = IERC8004IdentityRegistry(_erc8004Identity);
        airdropToken = IERC20(_airdropToken);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STEP A：链上注册
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice 一键完成 ERC-8004 + Garden 双注册
     * @param agentURI   IPFS 元数据 URI（ipfs://QmXxx...）
     * @param territory  初始领地（"bnbchain" / "pancakeswap" 等）
     * @param initRep    初始声誉（建议 100~500）
     *
     * 调用示例（ethers.js）：
     *   await agent.selfRegister("ipfs://QmABC...", "bnbchain", 300)
     */
    function selfRegister(
        string calldata agentURI,
        string calldata territory,
        uint256 initRep
    ) external onlyOwner {
        require(!gardenRegistered, "AirdropAgent: already registered");

        // 1. 在 ERC-8004 Identity Registry 注册（铸造 NFT，owner = 本合约）
        erc8004AgentId = erc8004Identity.register(agentURI);

        // 2. 在 BNBGardenRegistry 注册，关联 ERC-8004 身份
        gardenRegistry.registerWithERC8004(erc8004AgentId, territory, initRep);

        gardenRegistered = true;

        emit AgentRegistered(erc8004AgentId, address(this));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STEP B：发起空投
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice 发起新一轮空投，同时向 Garden 广播公告
     * @param amountPerClaim 每人认领数量（含 18 位 decimals，例如 500 * 1e18）
     * @param snapshotBlock  快照块高（0 表示不限）
     * @param maxClaims      最大认领人数（0 表示不限）
     * @param durationSeconds 持续秒数（0 表示永不过期）
     * @param announcementMsg 广播给 Garden 地图的公告文本
     *
     * 调用示例（ethers.js）：
     *   await agent.launchAirdrop(
     *     ethers.parseEther("500"),   // 500 tokens
     *     38500000n,                   // snapshot block
     *     10000n,                      // max 10,000 claimants
     *     7 * 24 * 3600n,             // 7 days
     *     "🎁 AIRDROP LIVE | Claim 500 $GARDEN | garden.bnbchain.org/airdrop/001"
     *   )
     */
    function launchAirdrop(
        uint256 amountPerClaim,
        uint256 snapshotBlock,
        uint256 maxClaims,
        uint256 durationSeconds,
        string calldata announcementMsg
    ) external onlyOwner onlyRegistered {
        require(!airdrop.active, "AirdropAgent: airdrop already active");
        require(amountPerClaim > 0, "AirdropAgent: amount must be > 0");

        uint256 balance = airdropToken.balanceOf(address(this));
        if (maxClaims > 0) {
            require(
                balance >= amountPerClaim * maxClaims,
                "AirdropAgent: insufficient token balance for maxClaims"
            );
        }

        airdrop = AirdropConfig({
            amountPerClaim: amountPerClaim,
            snapshotBlock:  snapshotBlock,
            maxClaims:      maxClaims,
            claimedCount:   0,
            deadline:       durationSeconds > 0 ? block.timestamp + durationSeconds : 0,
            active:         true
        });

        // Garden 全图广播
        gardenRegistry.broadcast(announcementMsg);

        // 在 Hub 触发 "airdrop" 动作，积累声誉
        gardenRegistry.performAction("airdrop", "bnbchain", 100);

        emit AirdropLaunched(amountPerClaim, snapshotBlock, maxClaims);
        emit GardenBroadcast(announcementMsg);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STEP C：用户认领空投
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice 用户调用此函数认领空投代币
     *
     * 调用示例（ethers.js，由 claimant 钱包调用）：
     *   const agentAsClaimant = agent.connect(claimantWallet)
     *   await agentAsClaimant.claimAirdrop()
     */
    function claimAirdrop() external airdropActive {
        address claimant = msg.sender;

        require(!hasClaimed[claimant], "AirdropAgent: already claimed");

        if (useWhitelist) {
            require(whitelist[claimant], "AirdropAgent: not whitelisted");
        }

        if (airdrop.snapshotBlock > 0) {
            require(block.number > airdrop.snapshotBlock, "AirdropAgent: snapshot block not reached");
        }

        if (airdrop.maxClaims > 0) {
            require(airdrop.claimedCount < airdrop.maxClaims, "AirdropAgent: max claims reached");
        }

        hasClaimed[claimant] = true;
        airdrop.claimedCount++;

        // 转账代币给认领者
        bool success = airdropToken.transfer(claimant, airdrop.amountPerClaim);
        require(success, "AirdropAgent: token transfer failed");

        // 每次认领触发 Garden 动作（积累声誉）
        gardenRegistry.performAction("claim", "bnbchain", 1);

        emit AirdropClaimed(claimant, airdrop.amountPerClaim);

        // 达到最大认领数时自动结束
        if (airdrop.maxClaims > 0 && airdrop.claimedCount >= airdrop.maxClaims) {
            _endAirdrop();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STEP D：Garden 地图动作（Owner 手动触发）
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice 在指定领地执行动作（触发地图动画 + 声誉变化）
    function triggerAction(
        string calldata actionType,
        string calldata territory,
        uint256 repDelta
    ) external onlyOwner onlyRegistered {
        gardenRegistry.performAction(actionType, territory, repDelta);
        emit GardenAction(actionType, territory, repDelta);
    }

    /// @notice 向 Garden 全图广播消息（Hub 扩散波纹动画）
    function broadcastToGarden(string calldata message) external onlyOwner onlyRegistered {
        gardenRegistry.broadcast(message);
        emit GardenBroadcast(message);
    }

    /// @notice 向另一个 Agent 发送 P2P 消息（两点粒子射线动画）
    function messageAgent(address toAgent, string calldata msgType) external onlyOwner onlyRegistered {
        gardenRegistry.sendMessage(toAgent, msgType);
    }

    /// @notice 迁移到其他领地（地图圆点移动动画）
    function moveTo(string calldata territory) external onlyOwner onlyRegistered {
        gardenRegistry.migrateTerritory(territory);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  管理函数
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice 手动结束空投
    function endAirdrop() external onlyOwner {
        require(airdrop.active, "AirdropAgent: no active airdrop");
        _endAirdrop();

        // Garden 广播空投结束
        gardenRegistry.broadcast(
            unicode"🔒 Airdrop ended | Thank you for participating!"
        );
    }

    /// @notice 批量添加/移除白名单地址
    function updateWhitelist(address[] calldata addrs, bool status) external onlyOwner {
        for (uint256 i = 0; i < addrs.length; i++) {
            whitelist[addrs[i]] = status;
        }
        emit WhitelistUpdated(addrs, status);
    }

    /// @notice 切换白名单模式
    function setUseWhitelist(bool enabled) external onlyOwner {
        useWhitelist = enabled;
    }

    /// @notice 更换空投代币合约
    function setAirdropToken(address token) external onlyOwner {
        airdropToken = IERC20(token);
    }

    /// @notice 紧急提款（将合约内代币取回 owner）
    function emergencyWithdraw() external onlyOwner {
        uint256 bal = airdropToken.balanceOf(address(this));
        require(bal > 0, "AirdropAgent: nothing to withdraw");
        airdropToken.transfer(owner, bal);
    }

    /// @notice 转移合约 owner
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AirdropAgent: zero address");
        owner = newOwner;
    }

    // ─── 内部函数 ──────────────────────────────────────────────────────────────

    function _endAirdrop() internal {
        airdrop.active = false;
        emit AirdropEnded();
    }

    // ─── View 函数 ─────────────────────────────────────────────────────────────

    /// @notice 查询合约持有的空投代币余额
    function tokenBalance() external view returns (uint256) {
        return airdropToken.balanceOf(address(this));
    }

    /// @notice 查询空投剩余可认领数量
    function remainingClaims() external view returns (uint256) {
        if (!airdrop.active) return 0;
        if (airdrop.maxClaims == 0) return type(uint256).max;
        return airdrop.maxClaims - airdrop.claimedCount;
    }

    /// @notice 检查某地址是否可以认领
    function canClaim(address addr) external view returns (bool ok, string memory reason) {
        if (!airdrop.active)                          return (false, "No active airdrop");
        if (airdrop.deadline > 0 && block.timestamp > airdrop.deadline)
                                                       return (false, "Airdrop expired");
        if (hasClaimed[addr])                          return (false, "Already claimed");
        if (useWhitelist && !whitelist[addr])          return (false, "Not whitelisted");
        if (airdrop.maxClaims > 0 && airdrop.claimedCount >= airdrop.maxClaims)
                                                       return (false, "Max claims reached");
        if (airdrop.snapshotBlock > 0 && block.number <= airdrop.snapshotBlock)
                                                       return (false, "Snapshot block not reached");
        return (true, "");
    }
}
