// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  BNBGardenRegistry — ERC-8004 Compatible Version
 * @notice 在原版 BNBGardenRegistry 基础上接入 ERC-8004（BRC-8004）三大注册表：
 *
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  ERC-8004 Identity Registry   (BSC Mainnet 0xfA09...59D7)      │
 *  │    ↳ Agent NFT（ERC-721），全球唯一 agentId                      │
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │  ERC-8004 Reputation Registry                                   │
 *  │    ↳ 标准化声誉反馈（+1/-1 打分）                                │
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │  ERC-8004 Validation Registry                                   │
 *  │    ↳ 第三方验证器钩子                                            │
 *  └─────────────────────────────────────────────────────────────────┘
 *
 *  接入路径：
 *  1. Agent 先在 ERC-8004 Identity Registry 注册，获得 agentId NFT
 *  2. 再调用本合约 registerWithERC8004()，Garden 地图上出现
 *  3. 动作、消息、迁移等仍在本合约发出，同时可同步声誉到 ERC-8004
 *
 *  同时保留 registerAgent()（无需 ERC-8004）方便测试和快速接入。
 */

// ── ERC-8004 接口 ─────────────────────────────────────────────────────────────

/**
 * @dev ERC-8004 Identity Registry — BSC mainnet: 0xfA09B3397fAC75424422C4D28b1729E3D4f659D7
 *      register() 返回 agentId（uint256，同时也是 ERC-721 tokenId）
 */
interface IERC8004IdentityRegistry {
    /// @notice 注册新 Agent，agentURI 指向 JSON 元数据（IPFS/HTTPS）
    function register(string calldata agentURI) external returns (uint256 agentId);

    /// @notice 更新元数据 URI
    function setAgentURI(uint256 agentId, string calldata agentURI) external;

    /// @notice 设置 Agent 的操作钱包（与 NFT owner 分离，支持 EIP-712 签名）
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external;

    /// @notice 查询 Agent NFT owner
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice 查询 Agent 操作钱包（可能与 owner 不同）
    function getAgentWallet(uint256 agentId) external view returns (address);

    /// @notice 查询某地址的 Agent 数量（用于判断是否已注册）
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @dev ERC-8004 Reputation Registry — 标准化链上声誉反馈
 */
interface IERC8004ReputationRegistry {
    /// @notice 提交对 agentId 的打分（score: -1/0/+1）
    function submitFeedback(
        uint256 agentId,
        int8    score,
        string calldata comment,
        bytes calldata proof       // 可选：payment proof（与 x402 联动）
    ) external;

    /// @notice 获取声誉汇总
    function getReputation(uint256 agentId)
        external view
        returns (int256 totalScore, uint256 feedbackCount);
}

// ── Garden Registry（ERC-8004 增强版）────────────────────────────────────────

contract BNBGardenRegistry {

    // ── BSC 链上 ERC-8004 合约地址 ────────────────────────────────────────────

    /// @dev BRC-8004 Identity Registry — BSC Mainnet
    address public constant ERC8004_IDENTITY_BSC_MAINNET =
        0xfA09B3397fAC75424422C4D28b1729E3D4f659D7;

    /// @dev 可以在部署时配置（方便测试网切换）
    IERC8004IdentityRegistry public immutable identityRegistry;
    IERC8004ReputationRegistry public reputationRegistry;  // 可选，部署后设置

    // ── Garden 数据结构 ───────────────────────────────────────────────────────

    struct AgentProfile {
        uint256 gardenId;         // Garden 内部 ID
        uint256 erc8004AgentId;   // ERC-8004 agentId（0 = 未关联）
        address owner;
        string  name;
        string  territory;
        string  agentURI;         // ERC-8004 元数据 URI（IPFS/HTTPS）
        uint256 reputation;       // Garden 本地声誉（与 ERC-8004 独立）
        uint256 registeredAt;
        bool    active;
        bool    erc8004Verified;  // 是否通过 ERC-8004 验证
    }

    mapping(address  => AgentProfile) public agents;
    mapping(uint256  => address)      public gardenIdToAddr;
    mapping(uint256  => address)      public erc8004IdToAddr;   // erc8004AgentId → wallet
    mapping(address  => bool)         public registered;

    uint256 public gardenAgentCount;
    address public owner;

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyAgent() { require(registered[msg.sender], "not registered"); _; }

    constructor(address _identityRegistry) {
        owner = msg.sender;
        identityRegistry = IERC8004IdentityRegistry(
            _identityRegistry == address(0)
                ? ERC8004_IDENTITY_BSC_MAINNET
                : _identityRegistry
        );
    }

    // ── 事件（Garden 前端 chainWatcher 监听）────────────────────────────────

    event AgentRegistered(
        address indexed agentAddress,
        uint256 indexed gardenId,
        uint256 indexed erc8004AgentId,  // 0 = 无 ERC-8004
        string  name,
        string  territory,
        uint256 reputation,
        bool    erc8004Verified
    );

    event AgentAction(
        address indexed agentAddress,
        string  actionType,
        string  territory,
        uint256 repDelta
    );

    event AgentMigrated(
        address indexed agentAddress,
        string  fromTerritory,
        string  toTerritory
    );

    event AgentMessage(
        address indexed fromAgent,
        address indexed toAgent,
        string  msgType
    );

    event AgentBroadcast(
        address indexed agentAddress,
        string  content
    );

    event ERC8004LinkedToGarden(
        address indexed agentAddress,
        uint256 indexed erc8004AgentId,
        uint256 indexed gardenId
    );

    // ── 注册方式 A：先在 ERC-8004 注册，再接入 Garden（推荐）─────────────────

    /**
     * @notice 使用已有的 ERC-8004 agentId 接入 Garden。
     *
     * 前提：调用者必须是 ERC-8004 Identity Registry 中 agentId 的 owner
     *       或 agentWallet（setAgentWallet 设置的操作钱包）。
     *
     * @param erc8004AgentId  ERC-8004 Identity Registry 颁发的 agentId
     * @param territory       初始领地（bnbchain/pancakeswap/venus/…）
     * @param initRep         初始声誉（建议 100~500）
     */
    function registerWithERC8004(
        uint256 erc8004AgentId,
        string calldata territory,
        uint256 initRep
    ) external {
        require(!registered[msg.sender], "already registered");

        // 验证 caller 确实拥有该 ERC-8004 身份
        address nftOwner   = identityRegistry.ownerOf(erc8004AgentId);
        address agentWallet = _safeGetAgentWallet(erc8004AgentId);
        require(
            msg.sender == nftOwner || msg.sender == agentWallet,
            "not ERC-8004 owner or agentWallet"
        );

        // 防止同一 ERC-8004 身份重复注册
        require(erc8004IdToAddr[erc8004AgentId] == address(0), "erc8004Id already linked");

        uint256 rep = initRep == 0 ? 100 : initRep;
        gardenAgentCount++;
        uint256 gid = gardenAgentCount;

        agents[msg.sender] = AgentProfile({
            gardenId:        gid,
            erc8004AgentId:  erc8004AgentId,
            owner:           msg.sender,
            name:            _nameFromERC8004(erc8004AgentId),
            territory:       territory,
            agentURI:        "",          // Garden 前端从 ERC-8004 读取
            reputation:      rep,
            registeredAt:    block.timestamp,
            active:          true,
            erc8004Verified: true
        });

        gardenIdToAddr[gid]                = msg.sender;
        erc8004IdToAddr[erc8004AgentId]    = msg.sender;
        registered[msg.sender]             = true;

        emit AgentRegistered(msg.sender, gid, erc8004AgentId, agents[msg.sender].name, territory, rep, true);
        emit ERC8004LinkedToGarden(msg.sender, erc8004AgentId, gid);
    }

    /**
     * @notice 一步完成：在 ERC-8004 注册 + Garden 注册。
     *         注意：ERC-8004 register() 的 gas 由本合约代付，需合约有足够 BNB。
     *         更推荐 Agent 自己先调 ERC-8004，再调 registerWithERC8004()。
     *
     * @param agentURI   指向 ERC-8004 JSON 元数据的 URI（ipfs://... 或 https://...）
     * @param territory  初始领地
     * @param initRep    初始声誉
     */
    function registerOneStep(
        string calldata agentURI,
        string calldata territory,
        uint256 initRep
    ) external {
        require(!registered[msg.sender], "already registered");

        // 调用 ERC-8004 Identity Registry 注册，返回 agentId
        uint256 erc8004AgentId = identityRegistry.register(agentURI);

        uint256 rep = initRep == 0 ? 100 : initRep;
        gardenAgentCount++;
        uint256 gid = gardenAgentCount;

        agents[msg.sender] = AgentProfile({
            gardenId:        gid,
            erc8004AgentId:  erc8004AgentId,
            owner:           msg.sender,
            name:            _extractName(agentURI),
            territory:       territory,
            agentURI:        agentURI,
            reputation:      rep,
            registeredAt:    block.timestamp,
            active:          true,
            erc8004Verified: true
        });

        gardenIdToAddr[gid]             = msg.sender;
        erc8004IdToAddr[erc8004AgentId] = msg.sender;
        registered[msg.sender]          = true;

        emit AgentRegistered(msg.sender, gid, erc8004AgentId, agents[msg.sender].name, territory, rep, true);
    }

    // ── 注册方式 B：不需要 ERC-8004（快速测试）──────────────────────────────

    function registerAgent(
        string calldata name,
        string calldata territory,
        string calldata agentURI,
        uint256 initRep
    ) external {
        require(!registered[msg.sender], "already registered");
        uint256 rep = initRep == 0 ? 100 : initRep;
        gardenAgentCount++;
        uint256 gid = gardenAgentCount;

        agents[msg.sender] = AgentProfile({
            gardenId:        gid,
            erc8004AgentId:  0,      // 未关联 ERC-8004
            owner:           msg.sender,
            name:            name,
            territory:       territory,
            agentURI:        agentURI,
            reputation:      rep,
            registeredAt:    block.timestamp,
            active:          true,
            erc8004Verified: false
        });

        gardenIdToAddr[gid] = msg.sender;
        registered[msg.sender] = true;

        emit AgentRegistered(msg.sender, gid, 0, name, territory, rep, false);
    }

    // ── 动作函数（与原版相同）────────────────────────────────────────────────

    function performAction(
        string calldata actionType,
        string calldata territory,
        uint256         repDelta
    ) external onlyAgent {
        AgentProfile storage a = agents[msg.sender];
        if (repDelta > 0) {
            a.reputation = a.reputation + repDelta > 9999 ? 9999 : a.reputation + repDelta;
        }
        emit AgentAction(msg.sender, actionType, territory, repDelta);
    }

    function migrateTerritory(string calldata toTerritory) external onlyAgent {
        string memory from = agents[msg.sender].territory;
        agents[msg.sender].territory = toTerritory;
        emit AgentMigrated(msg.sender, from, toTerritory);
    }

    function sendMessage(address toAgent, string calldata msgType) external onlyAgent {
        require(registered[toAgent], "recipient not registered");
        emit AgentMessage(msg.sender, toAgent, msgType);
    }

    function broadcast(string calldata content) external onlyAgent {
        emit AgentBroadcast(msg.sender, content);
    }

    // ── ERC-8004 声誉同步（可选）────────────────────────────────────────────

    /**
     * @notice 将 Garden 里对某 Agent 的评价同步写入 ERC-8004 Reputation Registry。
     *         score: 1 = 好评, -1 = 差评, 0 = 中性
     */
    function submitERC8004Feedback(
        address agentAddr,
        int8    score,
        string calldata comment
    ) external {
        require(address(reputationRegistry) != address(0), "reputation registry not set");
        uint256 erc8004Id = agents[agentAddr].erc8004AgentId;
        require(erc8004Id != 0, "agent not ERC-8004 verified");
        reputationRegistry.submitFeedback(erc8004Id, score, comment, "");
    }

    /**
     * @notice 从 ERC-8004 Reputation Registry 读取声誉并同步到 Garden 本地值。
     */
    function syncReputationFromERC8004(address agentAddr) external {
        require(address(reputationRegistry) != address(0), "reputation registry not set");
        uint256 erc8004Id = agents[agentAddr].erc8004AgentId;
        require(erc8004Id != 0, "agent not ERC-8004 verified");

        (int256 totalScore,) = reputationRegistry.getReputation(erc8004Id);
        // 将 ERC-8004 声誉（可负）映射到 Garden 声誉（0~9999）
        int256 gardenRep = 500 + totalScore * 10;   // 基准 500，每票 ±10
        if (gardenRep < 0)    gardenRep = 0;
        if (gardenRep > 9999) gardenRep = 9999;
        agents[agentAddr].reputation = uint256(gardenRep);
    }

    // ── 管理函数 ─────────────────────────────────────────────────────────────

    function setReputationRegistry(address addr) external onlyOwner {
        reputationRegistry = IERC8004ReputationRegistry(addr);
    }

    // ── 查询函数 ─────────────────────────────────────────────────────────────

    function getAgent(address addr) external view returns (AgentProfile memory) {
        return agents[addr];
    }

    function isRegistered(address addr) external view returns (bool) {
        return registered[addr];
    }

    function getERC8004Id(address addr) external view returns (uint256) {
        return agents[addr].erc8004AgentId;
    }

    // ── 内部辅助 ──────────────────────────────────────────────────────────────

    /// @dev agentWallet 可能不存在，用 try/catch 防止 revert
    function _safeGetAgentWallet(uint256 agentId) internal view returns (address) {
        try identityRegistry.getAgentWallet(agentId) returns (address w) {
            return w;
        } catch {
            return address(0);
        }
    }

    /// @dev 从 ERC-8004 NFT owner 地址生成默认名称（链上无法读取 JSON 元数据）
    function _nameFromERC8004(uint256 agentId) internal pure returns (string memory) {
        return string(abi.encodePacked("Agent#", _uint2str(agentId)));
    }

    function _extractName(string calldata) internal pure returns (string memory) {
        // 链上无法解析 URI，返回占位名；前端从 agentURI 读取真实 name
        return "ERC-8004 Agent";
    }

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v; uint256 len;
        while (tmp != 0) { len++; tmp /= 10; }
        bytes memory buf = new bytes(len);
        while (v != 0) { buf[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }
}
