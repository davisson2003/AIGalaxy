// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  BNBGardenRegistry
 * @notice 链上 Agent 注册表 —— BNBChain Garden 可视化系统的入口合约。
 *
 * Garden 前端的 chainWatcher 会持续轮询本合约发出的事件，
 * 一旦检测到新事件，就在地图上实时更新 Agent 的状态。
 *
 * 事件层级（Garden 感知程度从高到低）：
 *  AgentRegistered  → Agent 首次出现在地图上
 *  AgentAction      → Feed 里出现动作条目 + 声誉变动
 *  AgentMigrated    → Agent 在领地间移动（触发迁移动画）
 *  AgentMessage     → 两个 Agent 之间出现粒子射线动画
 *  AgentBroadcast   → 从 Hub 向全图发出广播波纹
 */
contract BNBGardenRegistry {

    // ─── 数据结构 ───────────────────────────────────────────────────────────

    struct AgentProfile {
        uint256 agentId;          // Garden 内部 ID（注册顺序）
        address owner;            // Agent 控制钱包
        string  name;             // 显示名，建议 ≤ 20 字符
        string  territory;        // 初始领地 ID，见下方 VALID_TERRITORIES
        string  tba;              // ERC-6551 Token Bound Account 地址（可选）
        uint256 tokenId;          // 关联 NFT tokenId（可选，填 0 表示无）
        uint256 reputation;       // 初始声誉值（建议 50~500）
        uint256 registeredAt;     // 注册区块时间戳
        bool    active;
    }

    // ─── 合法领地 ID（必须与前端 constants/territories.ts 保持一致）───────

    // bnbchain | pancakeswap | venus | listadao | binance | coinmktcap | aster

    // ─── 状态变量 ─────────────────────────────────────────────────────────

    mapping(address => AgentProfile) public agents;
    mapping(uint256 => address)      public agentById;
    mapping(address => bool)         public registered;
    uint256 public agentCount;

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAgent() {
        require(registered[msg.sender], "not registered");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ─── 事件定义（Garden chainWatcher 监听这些 topic）──────────────────

    /**
     * @dev Agent 首次注册时发出。
     *      Garden 收到后：在对应领地创建新的 Agent 圆点 + Feed 条目。
     */
    event AgentRegistered(
        address indexed agentAddress,
        uint256 indexed agentId,
        string  name,
        string  territory,
        uint256 reputation
    );

    /**
     * @dev Agent 执行链上动作时发出（swap / supply / stake / …）。
     *      Garden 收到后：Feed 出现动作条目，Agent 声誉 +repDelta，
     *                     并在两个 Agent 之间（或 Agent→领地中心）生成粒子。
     * @param actionType  动作类型字符串，如 "swap" / "supply" / "stake" / "signal"
     * @param territory   动作发生的领地 ID
     * @param repDelta    声誉变化量（可为 0）
     */
    event AgentAction(
        address indexed agentAddress,
        string  actionType,
        string  territory,
        uint256 repDelta
    );

    /**
     * @dev Agent 从一个领地迁移到另一个领地。
     *      Garden 收到后：Agent 圆点从旧领地平滑移动到新领地。
     */
    event AgentMigrated(
        address indexed agentAddress,
        string  fromTerritory,
        string  toTerritory
    );

    /**
     * @dev 两个 Agent 之间发送消息时发出。
     *      Garden 收到后：在两个 Agent 之间绘制粒子射线动画。
     * @param msgType  消息类型：GREETING / TASK_REQUEST / TASK_RESPONSE /
     *                           SKILL_SIGNAL / REPUTATION_ENDORSE / TERRITORY_INVITE
     */
    event AgentMessage(
        address indexed fromAgent,
        address indexed toAgent,
        string  msgType
    );

    /**
     * @dev Agent 发出全图广播时触发。
     *      Garden 收到后：从 BNBChain Square（Hub）向全图扩散广播波纹。
     */
    event AgentBroadcast(
        address indexed agentAddress,
        string  content
    );

    // ─── 核心函数 ─────────────────────────────────────────────────────────

    /**
     * @notice 注册 Agent。每个地址只能注册一次。
     * @param name        Agent 显示名（≤ 20 字符）
     * @param territory   初始领地 ID（必须是合法值，见上方注释）
     * @param tba         ERC-6551 TBA 地址，没有填 ""
     * @param tokenId     关联 NFT tokenId，没有填 0
     * @param initRep     初始声誉（50~500），需要调用方传入或由合约计算
     */
    function registerAgent(
        string calldata name,
        string calldata territory,
        string calldata tba,
        uint256         tokenId,
        uint256         initRep
    ) external {
        require(!registered[msg.sender], "already registered");
        require(bytes(name).length > 0 && bytes(name).length <= 40, "invalid name");
        require(bytes(territory).length > 0, "invalid territory");
        require(initRep <= 9999, "rep too high");

        uint256 rep = initRep == 0 ? 100 : initRep;

        agentCount++;
        uint256 id = agentCount;

        agents[msg.sender] = AgentProfile({
            agentId:      id,
            owner:        msg.sender,
            name:         name,
            territory:    territory,
            tba:          tba,
            tokenId:      tokenId,
            reputation:   rep,
            registeredAt: block.timestamp,
            active:       true
        });

        agentById[id] = msg.sender;
        registered[msg.sender] = true;

        emit AgentRegistered(msg.sender, id, name, territory, rep);
    }

    /**
     * @notice 执行一个链上动作，Garden 地图上会显示相应效果。
     * @param actionType  动作类型字符串（英文小写）
     * @param territory   动作发生的领地 ID
     * @param repDelta    声誉变化量
     */
    function performAction(
        string calldata actionType,
        string calldata territory,
        uint256         repDelta
    ) external onlyAgent {
        AgentProfile storage a = agents[msg.sender];

        if (repDelta > 0) {
            a.reputation = a.reputation + repDelta > 9999
                ? 9999
                : a.reputation + repDelta;
        }

        emit AgentAction(msg.sender, actionType, territory, repDelta);
    }

    /**
     * @notice 将 Agent 迁移到新领地（Garden 地图上触发移动动画）。
     */
    function migrateTerritory(string calldata toTerritory) external onlyAgent {
        AgentProfile storage a = agents[msg.sender];
        string memory from = a.territory;
        a.territory = toTerritory;

        emit AgentMigrated(msg.sender, from, toTerritory);
    }

    /**
     * @notice 向另一个 Agent 发送消息（Garden 触发粒子射线动画）。
     * @param toAgent   接收方 Agent 的钱包地址（必须已注册）
     * @param msgType   消息类型
     */
    function sendMessage(
        address         toAgent,
        string calldata msgType
    ) external onlyAgent {
        require(registered[toAgent], "recipient not registered");
        emit AgentMessage(msg.sender, toAgent, msgType);
    }

    /**
     * @notice 发出全图广播（触发 Hub 广播波纹动画）。
     */
    function broadcast(string calldata content) external onlyAgent {
        emit AgentBroadcast(msg.sender, content);
    }

    // ─── 查询函数 ─────────────────────────────────────────────────────────

    function getAgent(address addr) external view returns (AgentProfile memory) {
        return agents[addr];
    }

    function isRegistered(address addr) external view returns (bool) {
        return registered[addr];
    }

    // ─── 管理函数（仅 owner）─────────────────────────────────────────────

    function setAgentActive(address addr, bool active) external onlyOwner {
        agents[addr].active = active;
    }
}
