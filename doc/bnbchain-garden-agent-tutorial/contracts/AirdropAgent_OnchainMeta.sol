// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ═══════════════════════════════════════════════════════════════════════════
//  BNBChain Garden — AirdropAgent（链上元数据版）
//
//  元数据完全存储在合约 storage 中，无需 IPFS。
//  注册时自动生成 data:application/json;base64,... URI 传给 ERC-8004。
//
//  优势：
//    ✅ 不依赖 IPFS / 外部服务，永久可访问
//    ✅ 元数据可更新（agentName、description 等）
//    ✅ 注册更简单，无需提前上传文件
//  注意：
//    ⚠️ 字符串存链上消耗 Gas，建议 name ≤ 40 字，description ≤ 200 字
// ═══════════════════════════════════════════════════════════════════════════

// ─── 接口 ─────────────────────────────────────────────────────────────────────

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IBNBGardenRegistry {
    function registerWithERC8004(uint256 erc8004AgentId, string calldata territory, uint256 initRep) external;
    function performAction(string calldata actionType, string calldata territory, uint256 repDelta) external;
    function migrateTerritory(string calldata toTerritory) external;
    function sendMessage(address toAgent, string calldata msgType) external;
    function broadcast(string calldata content) external;
    function isRegistered(address addr) external view returns (bool);
}

interface IERC8004IdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
}

// ─── Base64 编码库（内联，无需外部依赖） ─────────────────────────────────────

library Base64 {
    bytes internal constant TABLE =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function encode(bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) return "";

        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        bytes memory result = new bytes(encodedLen);
        bytes memory table = TABLE;

        assembly {
            let tablePtr := add(table, 1)
            let resultPtr := add(result, 32)
            for { let i := 0 } lt(i, mload(data)) { } {
                i := add(i, 3)
                let input := and(mload(add(data, i)), 0xffffff)
                let out := mload(add(tablePtr, and(shr(18, input), 0x3F)))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(12, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(6, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(input, 0x3F))), 0xFF))
                out := shl(224, out)
                mstore(resultPtr, out)
                resultPtr := add(resultPtr, 4)
            }
            switch mod(mload(data), 3)
            case 1 { mstore(sub(resultPtr, 2), shl(240, 0x3d3d)) }
            case 2 { mstore(sub(resultPtr, 1), shl(248, 0x3d)) }
        }
        return string(result);
    }
}

// ─── JSON 拼接工具 ─────────────────────────────────────────────────────────────

library JSON {
    /// 将 bytes memory 拼接为 data:application/json;base64,xxx URI
    function toDataURI(bytes memory json) internal pure returns (string memory) {
        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(json)
        ));
    }

    /// 对字符串中的双引号和反斜杠做简单转义（防止 JSON 注入）
    function escapeString(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 extras = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == '\\') extras++;
        }
        if (extras == 0) return s;

        bytes memory out = new bytes(b.length + extras);
        uint256 j = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == '\\') { out[j++] = '\\'; }
            out[j++] = b[i];
        }
        return string(out);
    }
}

// ─── 主合约 ───────────────────────────────────────────────────────────────────

contract AirdropAgent {
    using JSON for bytes;
    using JSON for string;

    // ── 元数据结构（全部存链上） ───────────────────────────────────────────────
    struct AgentMeta {
        string name;           // Agent 显示名，≤ 40 字符
        string description;    // 简介，≤ 200 字符
        string imageDataURI;   // 头像 data URI（可选，留空则不显示）
        string territory;      // Garden 初始领地
        string a2aEndpoint;    // A2A 服务 URL（可选，留空则省略）
        bool   x402Support;    // 是否支持 x402 微支付
    }

    // ── 状态变量 ───────────────────────────────────────────────────────────────

    address public owner;
    IBNBGardenRegistry      public immutable gardenRegistry;
    IERC8004IdentityRegistry public immutable erc8004Identity;
    IERC20  public airdropToken;

    AgentMeta public meta;               // 链上元数据
    uint256   public erc8004AgentId;     // ERC-8004 注册后的 agentId
    bool      public gardenRegistered;

    // 空投状态
    struct AirdropConfig {
        uint256 amountPerClaim;
        uint256 snapshotBlock;
        uint256 maxClaims;
        uint256 claimedCount;
        uint256 deadline;
        bool    active;
    }
    AirdropConfig public airdrop;

    mapping(address => bool) public hasClaimed;
    mapping(address => bool) public whitelist;
    bool public useWhitelist;

    // ── 事件 ───────────────────────────────────────────────────────────────────

    event AgentRegistered(uint256 indexed erc8004AgentId, string agentURI);
    event MetaUpdated(string field);
    event AirdropLaunched(uint256 amountPerClaim, uint256 snapshotBlock, uint256 maxClaims);
    event AirdropClaimed(address indexed claimant, uint256 amount);
    event AirdropEnded();

    // ── 修饰符 ────────────────────────────────────────────────────────────────

    modifier onlyOwner()       { require(msg.sender == owner, "not owner"); _; }
    modifier onlyRegistered()  { require(gardenRegistered,   "not registered"); _; }
    modifier airdropActive()   {
        require(airdrop.active, "no active airdrop");
        require(airdrop.deadline == 0 || block.timestamp <= airdrop.deadline, "expired");
        _;
    }

    // ─── 构造函数 ─────────────────────────────────────────────────────────────

    /**
     * @param _gardenRegistry  BNBGardenRegistry_ERC8004 地址
     * @param _erc8004Identity BRC-8004 Identity Registry 地址（BSC 主网固定）
     * @param _airdropToken    空投 BEP-20 代币地址
     * @param _meta            Agent 元数据（直接在构造时写入链上）
     *
     * 部署示例（ethers.js）：
     *   const agent = await Factory.deploy(
     *     GARDEN_REGISTRY,
     *     ERC8004_IDENTITY,
     *     AIRDROP_TOKEN,
     *     {
     *       name:          "AirdropBot #001",
     *       description:   "Automated airdrop agent on BNB Chain",
     *       imageDataURI:  "",          // 留空，或传入 data:image/svg+xml;base64,...
     *       territory:     "bnbchain",
     *       a2aEndpoint:   "https://your-agent.com/a2a",  // 可留空
     *       x402Support:   true,
     *     }
     *   )
     */
    constructor(
        address _gardenRegistry,
        address _erc8004Identity,
        address _airdropToken,
        AgentMeta memory _meta
    ) {
        owner          = msg.sender;
        gardenRegistry = IBNBGardenRegistry(_gardenRegistry);
        erc8004Identity = IERC8004IdentityRegistry(_erc8004Identity);
        airdropToken   = IERC20(_airdropToken);
        meta           = _meta;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  元数据 — 链上生成 agentURI
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice 根据链上 meta 动态生成 ERC-8004 合规的 JSON，返回 data URI
     *
     * 生成的 JSON 结构：
     * {
     *   "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
     *   "name": "...",
     *   "description": "...",
     *   "image": "...",           // 如果 imageDataURI 非空
     *   "services": [...],        // 如果 a2aEndpoint 非空
     *   "x402Support": true/false,
     *   "active": true,
     *   "garden": { "territory": "..." }
     * }
     */
    function generateAgentURI() public view returns (string memory) {
        // 逐段拼接 JSON，避免 stack-too-deep
        bytes memory json = abi.encodePacked(
            '{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"',
            ',"name":"',   JSON.escapeString(meta.name),        '"',
            ',"description":"', JSON.escapeString(meta.description), '"'
        );

        // 可选：头像
        if (bytes(meta.imageDataURI).length > 0) {
            json = abi.encodePacked(json, ',"image":"', meta.imageDataURI, '"');
        }

        // 可选：A2A 服务
        if (bytes(meta.a2aEndpoint).length > 0) {
            json = abi.encodePacked(
                json,
                ',"services":[{"type":"A2A","url":"',
                JSON.escapeString(meta.a2aEndpoint),
                '"}]'
            );
        }

        // x402 支持标志
        json = abi.encodePacked(
            json,
            ',"x402Support":', meta.x402Support ? "true" : "false",
            ',"active":true'
        );

        // Garden 专用扩展字段
        json = abi.encodePacked(
            json,
            ',"garden":{"territory":"', JSON.escapeString(meta.territory), '"',
            ',"agentContract":"', _addressToString(address(this)), '"',
            '}}'
        );

        return JSON.toDataURI(json);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  注册
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice 使用链上元数据完成 ERC-8004 + Garden 双注册，无需 IPFS
     * @param initRep 初始声誉（建议 100~500）
     *
     * 调用示例：
     *   await agent.selfRegister(300n)
     */
    function selfRegister(uint256 initRep) external onlyOwner {
        require(!gardenRegistered, "already registered");

        // 链上动态生成 agentURI
        string memory agentURI = generateAgentURI();

        // ERC-8004 注册
        erc8004AgentId = erc8004Identity.register(agentURI);

        // Garden 注册
        gardenRegistry.registerWithERC8004(erc8004AgentId, meta.territory, initRep);

        gardenRegistered = true;

        emit AgentRegistered(erc8004AgentId, agentURI);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  元数据更新（注册后仍可修改）
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice 更新 Agent 名称（更新后调用 syncMetaToERC8004 同步）
    function updateName(string calldata newName) external onlyOwner {
        meta.name = newName;
        emit MetaUpdated("name");
    }

    /// @notice 更新 Agent 简介
    function updateDescription(string calldata newDesc) external onlyOwner {
        meta.description = newDesc;
        emit MetaUpdated("description");
    }

    /// @notice 更新头像（传入 data:image/svg+xml;base64,... 或 data:image/png;base64,...）
    function updateImage(string calldata newImageDataURI) external onlyOwner {
        meta.imageDataURI = newImageDataURI;
        emit MetaUpdated("imageDataURI");
    }

    /// @notice 更新 A2A 端点
    function updateA2AEndpoint(string calldata endpoint) external onlyOwner {
        meta.a2aEndpoint = endpoint;
        emit MetaUpdated("a2aEndpoint");
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  空投
    // ═══════════════════════════════════════════════════════════════════════

    function launchAirdrop(
        uint256 amountPerClaim,
        uint256 snapshotBlock,
        uint256 maxClaims,
        uint256 durationSeconds,
        string calldata announcementMsg
    ) external onlyOwner onlyRegistered {
        require(!airdrop.active, "airdrop already active");
        require(amountPerClaim > 0, "amount must be > 0");

        if (maxClaims > 0) {
            require(
                airdropToken.balanceOf(address(this)) >= amountPerClaim * maxClaims,
                "insufficient balance"
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

        gardenRegistry.broadcast(announcementMsg);
        gardenRegistry.performAction("airdrop", meta.territory, 100);

        emit AirdropLaunched(amountPerClaim, snapshotBlock, maxClaims);
    }

    function claimAirdrop() external airdropActive {
        address claimant = msg.sender;
        require(!hasClaimed[claimant],    "already claimed");
        if (useWhitelist) require(whitelist[claimant], "not whitelisted");
        if (airdrop.snapshotBlock > 0)
            require(block.number > airdrop.snapshotBlock, "snapshot not reached");
        if (airdrop.maxClaims > 0)
            require(airdrop.claimedCount < airdrop.maxClaims, "max claims reached");

        hasClaimed[claimant] = true;
        airdrop.claimedCount++;

        require(airdropToken.transfer(claimant, airdrop.amountPerClaim), "transfer failed");

        gardenRegistry.performAction("claim", meta.territory, 1);
        emit AirdropClaimed(claimant, airdrop.amountPerClaim);

        if (airdrop.maxClaims > 0 && airdrop.claimedCount >= airdrop.maxClaims) {
            airdrop.active = false;
            emit AirdropEnded();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Garden 地图动作
    // ═══════════════════════════════════════════════════════════════════════

    function broadcastToGarden(string calldata message) external onlyOwner onlyRegistered {
        gardenRegistry.broadcast(message);
    }

    function triggerAction(string calldata actionType, string calldata territory, uint256 repDelta)
        external onlyOwner onlyRegistered {
        gardenRegistry.performAction(actionType, territory, repDelta);
    }

    function messageAgent(address toAgent, string calldata msgType)
        external onlyOwner onlyRegistered {
        gardenRegistry.sendMessage(toAgent, msgType);
    }

    function moveTo(string calldata territory) external onlyOwner onlyRegistered {
        gardenRegistry.migrateTerritory(territory);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  管理
    // ═══════════════════════════════════════════════════════════════════════

    function endAirdrop() external onlyOwner {
        require(airdrop.active, "no active airdrop");
        airdrop.active = false;
        emit AirdropEnded();
        gardenRegistry.broadcast(unicode"🔒 Airdrop ended. Thank you for participating!");
    }

    function updateWhitelist(address[] calldata addrs, bool status) external onlyOwner {
        for (uint256 i = 0; i < addrs.length; i++) whitelist[addrs[i]] = status;
    }

    function setUseWhitelist(bool enabled) external onlyOwner { useWhitelist = enabled; }

    function setAirdropToken(address token) external onlyOwner { airdropToken = IERC20(token); }

    function emergencyWithdraw() external onlyOwner {
        uint256 bal = airdropToken.balanceOf(address(this));
        require(bal > 0, "nothing to withdraw");
        airdropToken.transfer(owner, bal);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    // ─── View ────────────────────────────────────────────────────────────────

    function tokenBalance() external view returns (uint256) {
        return airdropToken.balanceOf(address(this));
    }

    function remainingClaims() external view returns (uint256) {
        if (!airdrop.active) return 0;
        if (airdrop.maxClaims == 0) return type(uint256).max;
        return airdrop.maxClaims - airdrop.claimedCount;
    }

    function canClaim(address addr) external view returns (bool ok, string memory reason) {
        if (!airdrop.active)                                    return (false, "No active airdrop");
        if (airdrop.deadline > 0 && block.timestamp > airdrop.deadline)
                                                                return (false, "Airdrop expired");
        if (hasClaimed[addr])                                   return (false, "Already claimed");
        if (useWhitelist && !whitelist[addr])                   return (false, "Not whitelisted");
        if (airdrop.maxClaims > 0 && airdrop.claimedCount >= airdrop.maxClaims)
                                                                return (false, "Max claims reached");
        if (airdrop.snapshotBlock > 0 && block.number <= airdrop.snapshotBlock)
                                                                return (false, "Snapshot not reached");
        return (true, "");
    }

    // ─── 内部工具 ──────────────────────────────────────────────────────────────

    function _addressToString(address addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0"; str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2]     = alphabet[uint8(bytes20(addr)[i] >> 4)];
            str[3 + i * 2]     = alphabet[uint8(bytes20(addr)[i] & 0x0f)];
        }
        return string(str);
    }
}
