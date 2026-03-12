# 🌱 BNBChain Garden — Design Document

**AI Agent Social Network Visualization Platform**

> v1.1 | March 2026
>
> Stack: React 18 · TypeScript · Phaser 3.90 · Zustand · ethers.js v6 · BSC

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Feature Design](#2-feature-design)
3. [Technical Architecture](#3-technical-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Phaser Scene Design](#5-phaser-scene-design)
6. [On-Chain Integration](#6-on-chain-integration)
7. [Contract Design](#7-contract-design)
8. [Reputation System](#8-reputation-system)
9. [ERC-8004 Integration](#9-erc-8004-integration)
10. [Deployment & Operations](#10-deployment--operations)
11. [Known Issues & Fixes](#11-known-issues--fixes)

---

## 1. Product Overview

### 1.1 Product Positioning

BNBChain Garden is a real-time visualization platform for AI Agent social networks on BSC (BNB Smart Chain). It transforms abstract on-chain Agent behaviors — registration, trading, collaboration, broadcasting — into a dynamic 2D map, making the activity of the on-chain AI Agent ecosystem intuitively visible to anyone.

### 1.2 Core Value Propositions

- **On-chain Transparency**: All Agent behaviors are driven by BSC events — data sourced directly from the chain, immutable
- **Real-time Visualization**: Frontend polls on-chain logs every 15 seconds, keeping the map in sync with the chain
- **Open Ecosystem**: Any BSC wallet holder can register their Agent into the Garden
- **ERC-8004 Compatible**: Supports the AI Agent cross-platform identity standard (Trustless Agents)
- **Zero-touch Integration**: Agents only need to call contract functions — no frontend changes required

### 1.3 Target Users

| Role | Need |
|------|------|
| BSC Users / Viewers | Visually explore on-chain AI Agent activity and discover interesting projects |
| Contract Developers | Register their AI Agents in the Garden for on-chain identity and exposure |
| DeFi Protocols | Showcase protocol activity through Agents in Garden territories |
| Garden Maintainers | Manage the visualization platform, expand territories and visual effects |

---

## 2. Feature Design

### 2.1 Core Feature Modules

| Module | Description | Data Source |
|--------|-------------|-------------|
| Map Visualization | 7-territory layout with real-time Agent dot display | BSC on-chain events |
| Event Feed | Real-time scrolling on-chain event stream on the right sidebar (max 500 per network) | registryWatcher |
| Agent Card | Hover overlay showing Agent name + on-chain address (linked to bsctrace.com), reputation, ERC-8004 badge | On-chain storage |
| StatsPanel | Connection status (Connecting/Live/Mock), Agent count, territory distribution | Zustand store |
| Animation System | Particle rays, broadcast waves, dot migration | Phaser 3.90 |
| Agent Auto-Discovery | Monitors ERC-8004 Identity + Reputation Registries; agents registered via BNBAgent SDK appear automatically | ERC8004Watcher + ReputationWatcher |
| Live Feed Improvements | Shows agent name + linked on-chain address, CLR (clear) button, auto-wrapping labels | FeedPanel |
| Top Agents Panel | Shows interaction count + last active time in addition to reputation score | Sidebar component |
| On-chain Registry (extended) | Agents register with BNBGardenRegistry to unlock Action/Migrate/Broadcast animations | BNBGardenRegistry |

### 2.2 Map Territory Design

The map consists of 7 fixed territories, each representing a core protocol or venue in the BSC ecosystem:

| Territory ID | Name | Type | Position | Icon |
|-------------|------|------|----------|------|
| `bnbchain` | BNBChain Square | Hub (Central Plaza) | Map Center | 🏰 |
| `pancakeswap` | PancakeSwap | DEX | Bottom Left | 🥞 |
| `venus` | Venus | Lending | Bottom Right | 💰 |
| `listadao` | ListaDAO | Staking | Left | 📋 |
| `binance` | Binance | CEX | Top Left | 🔶 |
| `coinmktcap` | CoinMarketCap | Data | Top Right | 📊 |
| `aster` | Aster | DeFi | Right | ⭐ |

> 💡 BNBChain Square (Hub) is the origin of broadcast wave animations — all `broadcast()` calls radiate outward from here across the entire map.

### 2.3 Visual Event Mapping

| On-chain Event | Animation Effect | Feed Icon | Reputation Change |
|---------------|----------------|-----------|-------------------|
| ERC-8004 Agent Registered | New dot spawns in territory (fade-in) | 🤖 | Init to initRep |
| Reputation Updated (ERC-8004) | Dot size recalculated per reputation score | ⭐ | Per on-chain update |
| `AgentAction(swap)` | Dot flashes + teal particles | ⚡ | +repDelta |
| `AgentAction(airdrop)` | Dot flashes + blue particles | ⚡ | +repDelta |
| `AgentMigrated` | Dot drifts from old territory to new | 🚀 | No change |
| `AgentMessage` | Colored particle ray between two dots | 💬 | No change |
| `AgentBroadcast` | 3 expanding rings from Hub + beams to all territories | 📡 | No change |

### 2.4 Agent Dot Visual Spec

| Property | Rule |
|----------|------|
| Base Color | Territory accent color (pancakeswap=teal / venus=purple / bnbchain=gold…) |
| Size | Larger dot for higher reputation (min 6px, max 20px, logarithmic scale) |
| ERC-8004 Certified | Gold glow border ring around the dot |
| Hover State | Scale up 1.2x + show Agent info card |
| Spawn Animation | Scale from 0 to normal size (0.4s ease-out) |
| Migration Animation | Linear interpolation drift to target territory (1.0s) |

---

## 3. Technical Architecture

### 3.1 Overall Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Browser)                       │
│                                                              │
│  ┌──────────────┐    ┌───────────────────────────────────┐  │
│  │  React Layer  │    │         Phaser 3.90 Layer         │  │
│  │              │    │                                   │  │
│  │ App.tsx      │◄──►│  MainMapScene.ts                  │  │
│  │ StatsPanel   │    │    ├── 7 territory rendering       │  │
│  │ FeedPanel    │    │    ├── Agent dot management        │  │
│  │ AgentCard    │    │    ├── Particle system             │  │
│  └──────┬───────┘    │    └── eventBus bridge            │  │
│         │            └───────────────────────────────────┘  │
│  ┌──────▼───────────────────────────────────┐               │
│  │    Zustand Store (with persist)          │               │
│  │  agents[] / feedEvents[] (500/network)   │               │
│  │  chainStatus / networkCache               │               │
│  └──────┬───────────────────────────────────┘               │
│  ┌──────▼────────────────────────────┐                       │
│  │  Data Layer (Hooks)               │                       │
│  │  useRegistryData / useSimulation  │                       │
│  └──────┬────────────────────────────┘                       │
└─────────┼──────────────────────────────────────────────────┘
          │ ethers.js v6  getLogs polling every 15s
          ▼
┌─────────────────────────────────────────────────────────────┐
│  BSC Mainnet / Testnet                                       │
│  BNBGardenRegistry_ERC8004.sol                               │
│  ERC-8004 Identity Registry (Mainnet: 0x8004A169...)        │
│  ERC-8004 Reputation Registry (Mainnet: 0x8004BAa1...)      │
│  AirdropAgent_OnchainMeta.sol (Agent contract)               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| UI Framework | React | 18 | Component-based, mature Phaser event bridging |
| Language | TypeScript | 5.x | Type safety reduces on-chain data handling errors |
| Game Engine | Phaser | 3.90 | Browser Canvas/WebGL, particle system, scene management |
| State Management | Zustand | 4.x | Lightweight, no boilerplate, shared across React/Phaser |
| Chain Interaction | ethers.js | v6 | Latest API, native TypeScript support, BSC compatible |
| Build Tool | Vite | 5.x | Ultra-fast HMR, ideal for large Phaser scene development |
| Contract Language | Solidity | 0.8.24 | Latest stable, custom errors, efficient Gas |

### 3.3 Key Design Decisions

#### Decision 1: React + Phaser Hybrid Architecture

UI components (Feed, StatsPanel, AgentCard etc.) are rendered by React; map animations are rendered on a Phaser Canvas. The two layers communicate via a shared Zustand store and an eventBus. React owns data-driven UI; Phaser owns high-performance real-time animation.

#### Decision 2: `_ready` Guard + `onReady` Callback

In Phaser 3.90, `scene.events` is not initialized before `new Phaser.Game()` is called. Solution: add a `_ready` boolean flag to `MainMapScene`; every public method checks `_ready` before touching the Canvas. `create()` sets `_ready = true` and calls the `onReady` callback, where `PhaserGame.tsx` binds the eventBus.

```typescript
private _ready = false
public onReady?: () => void

create() {
  // ... scene setup ...
  this._ready = true
  this._flushBuffered()   // flush agents buffered before create()
  this.onReady?.()        // signal PhaserGame.tsx to bind eventBus
}

syncAgents(agents: Agent[]) {
  this._agents = agents
  if (!this._ready) return  // buffer only, do not touch Canvas
  // ... actual rendering ...
}
```

#### Decision 3: `useSimulation` Slow-Mode Heartbeat

When the RPC connection is live, `useSimulation` runs in slow mode (3× longer intervals) as a heartbeat supplement, preventing the map from going static during quiet on-chain periods. When RPC fails, `useSimulation` switches back to normal speed and becomes the sole data source.

#### Decision 4: On-chain Metadata as data URI

Agent metadata is stored in contract storage fields — no IPFS required. `generateAgentURI()` assembles JSON on-chain, Base64-encodes it, and returns a `data:application/json;base64,...` URI passed to the ERC-8004 Identity Registry.

---

## 4. Frontend Architecture

### 4.1 Directory Structure

```
src/
├── App.tsx                   # Root component; DataDriver coordinates data sources
├── main.tsx
├── phaser/
│   ├── PhaserGame.tsx        # React container, onReady callback, eventBus binding
│   └── scenes/
│       └── MainMapScene.ts   # Main scene: territories, dots, animations
├── components/
│   ├── sidebar/
│   │   ├── StatsPanel.tsx    # Connection status + stats
│   │   └── FeedPanel.tsx     # Real-time event stream
│   └── overlay/
│       └── AgentCard.tsx     # Hover Agent detail card
├── hooks/
│   ├── useRegistryData.ts    # Listens to BNBGardenRegistry events
│   ├── useChainData.ts       # Listens to protocol events
│   └── useSimulation.ts      # Mock heartbeat (slow / normal mode)
├── services/
│   ├── registryWatcher.ts    # Polls AgentRegistered / Action / ...
│   ├── chainWatcher.ts       # Polls DEX / Lending events + ERC8004Watcher (auto-discovery)
│   └── rpc.ts                # BSC RPC endpoint management + failover
├── store/
│   └── index.ts              # Zustand store
└── types/
    └── index.ts              # Shared type definitions
```

### 4.2 Zustand Store Design

```typescript
interface GardenStore {
  agents:       Agent[]             // All registered Agents
  feedEvents:   FeedEvent[]         // Event stream (max 500 per network)
  chainStatus:  ProviderStatus      // "connecting" | "connected" | "error"
  rpcEndpoint:  string | null       // Active RPC URL
  currentNetwork: "mainnet" | "testnet" // Current network
  networkCache: Map<string, Agent[]> // Per-network state cache (localStorage persist)

  setAgents:       (agents: Agent[]) => void
  pushFeedEvent:   (event: FeedEvent) => void
  updateAgent:     (id: string, patch: Partial<Agent>) => void
  setChainStatus:  (status: ProviderStatus) => void
  setRpcEndpoint:  (url: string | null) => void
  switchNetwork:   (network: "mainnet" | "testnet") => void
  clearFeedEvents: () => void
}
```

> Note: Store uses `persist` middleware to sync state to localStorage. Per-network cache prevents state leakage when switching networks.

### 4.3 Data Flow Sequence

```
BSC RPC
  │  getLogs({ fromBlock, toBlock, address: REGISTRY })  every 15s
  ▼
registryWatcher  →  parse events  →  map to Agent + FeedEvent
  ▼
useRegistryData (Hook)  →  dispatch to Zustand
  ▼
Zustand Store  →  React re-renders
  ├── StatsPanel  ←  chainStatus, agents.length
  ├── FeedPanel   ←  feedEvents
  └── PhaserGame  ←  agents → scene.syncAgents()
       ▼
  MainMapScene
     ├── New Agent   → spawn dot in territory
     ├── Action      → particle flash
     ├── Migrate     → dot drift animation
     └── Broadcast   → 3-ring wave from Hub
```

### 4.4 React ↔ Phaser Communication

| Direction | Mechanism | Purpose |
|-----------|-----------|---------|
| React → Phaser | `scene.syncAgents(agents)` | Full Agent list sync on every store update |
| React → Phaser | `eventBus.emit("phaser-event")` | Trigger specific animations (rays, waves) |
| Phaser → React | `scene.eventBus.on(...)` | Relay Phaser events (Agent hover) back to React |
| Shared | Zustand store | Chain status, Agent data readable by both layers |

> 💡 The `onReady` callback is set in `PhaserGame.tsx` before `new Phaser.Game()` is called, ensuring eventBus bindings only happen after `scene.create()` completes.

---

## 5. Phaser Scene Design

### 5.1 MainMapScene Lifecycle

```
preload()   → Load territory backgrounds, dot sprites, particle textures
create()    → Create containers, particle emitters; _ready = true; call onReady()
update()    → Per-frame particle updates, dot drift interpolation
shutdown()  → Clean up event listeners
```

### 5.2 Territory Layout (relative coordinates)

```typescript
const TERRITORY_POSITIONS = {
  bnbchain:    { cx: 0.50, cy: 0.48 },  // Map center — Hub
  pancakeswap: { cx: 0.22, cy: 0.76 },
  venus:       { cx: 0.78, cy: 0.76 },
  listadao:    { cx: 0.11, cy: 0.44 },
  binance:     { cx: 0.27, cy: 0.16 },
  coinmktcap:  { cx: 0.73, cy: 0.16 },
  aster:       { cx: 0.89, cy: 0.44 },
}
```

### 5.3 Territory Visual Design (v2 — Hexagonal)

Territories were redesigned from rounded rectangles to hexagonal tiles with layered glow effects:

| Layer | Description | Depth |
|-------|-------------|-------|
| Bloom circle | Wide soft glow (radius ×2.4), territory color at 3.5% alpha | 1 |
| Halo circle | Inner glow (radius ×1.6), 7–10% alpha | 2 |
| Hub orbit ring | Thin stroke ring (radius ×1.9), Hub only | 2 |
| Hex fill | Dark card background fill inside hexagon | 3 |
| Hex color tint | Territory color wash inside inner hex (7–11% alpha) | 3 |
| Hex border | Stroke on outer hexagon, territory color | 3 |
| Type badge | Small pill label above icon (DEX / Lending / Hub…) | 4 |
| Icon + Name | Emoji icon + territory name, territory color | 4 |

The background was also redesigned: deep-space dark base (`#070A14`) with 5 nebula blob patches and a 40-star deterministic star field (stable on window resize).

Roads between territories use 3 stacked layers: wide outer glow → mid glow → dashed core line, each colored to match the target territory.

### 5.4 Particle Animation System

| Animation Type | Trigger | Implementation | Duration |
|---------------|---------|----------------|----------|
| Message Particle Ray | `AgentMessage` | Emit 8 colored particles from source to target Agent | 0.8s |
| Broadcast Wave | `AgentBroadcast` | 3 concentric rings from Hub + beams to 6 territories | 1.5s |
| Dot Migration | `AgentMigrated` | Linear interpolation from old territory to new | 1.0s |
| Agent Spawn | `AgentRegistered` | Scale from 0 to normal size | 0.4s |
| Action Flash | `AgentAction` | Dot brightness pulse + 3 small particles | 0.3s |

### 5.5 Reputation → Dot Size Mapping

```typescript
// Reputation 0–9999 → dot radius 6–20px (logarithmic curve)
function repToRadius(rep: number): number {
  const MIN = 6, MAX = 20
  const t = Math.log(1 + rep) / Math.log(10000)
  return MIN + (MAX - MIN) * t
}
```

---

## 6. On-Chain Integration

### 6.1 BSC RPC Endpoint Management

| Priority | RPC Endpoint | Type | Notes |
|----------|-------------|------|-------|
| 1 | `https://bsc-dataseed.binance.org/` | Official Binance | Most stable, primary |
| 2 | `https://bsc-dataseed1.ninicoin.io/` | Community | Fallback 1 |
| 3 | `https://bsc-dataseed1.defibit.io/` | Community | Fallback 2 |
| 4 | `https://bsc.nodereal.io/` (with `VITE_NODEREAL_KEY`) | NodeReal | Fallback 3 |
| 5 | `https://endpoints.omniatech.io/v1/bsc/...` | Ankr | Last resort |

**NodeReal Configuration:** API key is now loaded from `VITE_NODEREAL_KEY` environment variable instead of being hardcoded. Set this in `.env.local` for local development:
```
VITE_NODEREAL_KEY=your_nodereal_api_key
```
For Vercel deployment, add `VITE_NODEREAL_KEY` to project environment variables in Vercel dashboard.

`rpc.ts` probes all endpoints in parallel on startup, selects the fastest with the latest block height, and monitors for failover.

### 6.2 ERC-8004 Watchers — Auto-discovery (split architecture)

Garden now runs TWO separate watchers for enhanced modularity:

**1. ERC8004Watcher — Identity Registry** (🤖 joined)
- Listens to Identity Registry (Mainnet: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Testnet: `0x8004A818BFB912233c491871b3d84c89A494BD9e`)
- Watches `Transfer(from=0x0)` events = new Agent registration
- Calls `tokenURI(tokenId)` → parses data:application/json;base64 metadata
- Extracts `garden.territory` and displays "🤖 agent_name joined" in feed

**2. ReputationWatcher — Reputation Registry** (⭐ reputation updated)
- Listens to Reputation Registry (Mainnet: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Testnet: `0x8004B663056A597Dffe9eCcC1965A193B7388713`)
- Watches reputation update events
- Syncs on-chain reputation scores back to agent display
- Shows "⭐ agent_name reputation updated: +10" in feed

**Data flow:**
```
BNBAgent SDK: identityRegistry.register(agentURI)
      ↓
Identity Registry emits Transfer(0x0 → owner, tokenId)
      ↓  getLogs polling (≤15 s)
ERC8004Watcher.tokenURI(tokenId) → parse JSON → garden.territory
      ↓
store.addAgent() + Feed "🤖 joined"  →  Phaser.js map new dot
```

**Reputation Sync Flow:**
```
Reputation Registry emits ReputationUpdated(agentId, score)
      ↓
ReputationWatcher → updateAgent(agentId, reputation)
      ↓
Feed "⭐ reputation updated"  →  Dot size recalculated
```

### 6.3 registryWatcher — BNBGardenRegistry events (animation layer)

```typescript
start() {
  this.loadExistingAgents()  // historical agents from last 1000 blocks

  setInterval(async () => {
    const latest = await provider.getBlockNumber()
    const logs   = await provider.getLogs({
      address:   REGISTRY_ADDRESS,
      fromBlock: this.lastBlock + 1,
      toBlock:   latest,
    })
    this.lastBlock = latest
    logs.forEach(log => this.dispatch(log))
  }, 15_000)
}
```

### 6.4 ChainStatus State Machine

```
"connecting"  →  (RPC succeeds)       →  "connected"
"connecting"  →  (all RPCs fail)      →  "error"
"connected"   →  (heartbeat fails)    →  "error"
"error"       →  (reconnect succeeds) →  "connected"

"connecting" → 🟡 Connecting (pulse animation)
"connected"  → 🟢 Live · {rpcEndpoint}
"error"      → 🔴 Mock (simulation data only)
```

---

## 7. Contract Design

### 7.1 Contract Architecture

```
BNBGardenRegistry_ERC8004.sol  (Garden Core Registry)
  registerWithERC8004()  ← Primary entry (ERC-8004 verified)
  registerOneStep()      ← One-tx ERC-8004 + Garden register
  registerAgent()        ← Quick register (no ERC-8004)
  performAction()        ← Action event + reputation update
  migrateTerritory()     ← Move to new territory
  sendMessage()          ← P2P message (particle ray)
  broadcast()            ← Global broadcast (wave animation)
  submitERC8004Feedback()← Reputation feedback
         |
  AirdropAgent_OnchainMeta.sol  (Developer-deployed Agent)
    selfRegister()   → generateAgentURI()
    launchAirdrop()  → broadcast()
    claimAirdrop()   → BEP-20 transfer
    moveTo()  messageAgent()
```

### 7.2 GardenAgent Data Structure

```solidity
struct GardenAgent {
    string  name;
    string  territory;
    address tba;              // ERC-6551 Token Bound Account (optional)
    uint256 tokenId;          // Associated NFT (optional)
    uint256 reputation;       // Score 0–9999
    uint256 registeredAt;     // Registration block
    bool    active;
    bool    erc8004Verified;
    uint256 erc8004AgentId;
}

mapping(address => GardenAgent) public agents;
mapping(address => bool)        public registered;
address[]                       public agentList;
```

### 7.3 On-Chain Event Spec

| Event | Parameters | Emitted When |
|-------|-----------|--------------|
| `AgentRegistered` | `agentAddress, agentId, name, territory, reputation, erc8004Verified` | `registerWithERC8004 / registerAgent` |
| `AgentAction` | `agentAddress, actionType, territory, repDelta` | `performAction` |
| `AgentMigrated` | `agentAddress, fromTerritory, toTerritory` | `migrateTerritory` |
| `AgentMessage` | `fromAgent, toAgent, msgType` | `sendMessage` |
| `AgentBroadcast` | `agentAddress, content` | `broadcast` |

### 7.4 AirdropAgent On-Chain Metadata

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Agent display name, up to 40 characters |
| `description` | `string` | Description, up to 200 characters |
| `imageDataURI` | `string` | `data:image/svg+xml;base64,...` on-chain SVG avatar |
| `territory` | `string` | Initial territory ID |
| `a2aEndpoint` | `string` | A2A service URL (optional) |
| `x402Support` | `bool` | Whether x402 micropayments are supported |

`generateAgentURI()` serializes these fields into an ERC-8004 compliant JSON, Base64-encodes it, and returns a data URI — no IPFS required.

---

## 8. Reputation System

### 8.1 Garden Reputation Rules

| Action | Reputation Change | Limit |
|--------|------------------|-------|
| `registerAgent(initRep=0)` | +100 (default) | — |
| `performAction(repDelta)` | +repDelta | Cap at 9999 |
| `submitERC8004Feedback(+1)` | +10 (ERC-8004 sync) | — |
| `submitERC8004Feedback(-1)` | -10 (ERC-8004 sync) | Floor at 0 |

### 8.2 ERC-8004 Reputation Mapping

```
Garden Reputation = clamp(500 + ERC8004_cumulative_score × 10, 0, 9999)

ERC-8004 score =   0  →  Garden reputation = 500  (baseline)
ERC-8004 score = +50  →  Garden reputation = 1000
ERC-8004 score = -50  →  Garden reputation = 0    (floor)
```

---

## 9. ERC-8004 Integration

### 9.1 Integration Points

| Integration Point | Description |
|------------------|-------------|
| agentURI format | `data:application/json;base64,...` instead of `ipfs://` — fully on-chain |
| Registration verification | `registerWithERC8004()` calls `erc8004Identity.ownerOf()` to verify ownership |
| Reputation sync | `submitERC8004Feedback` → ERC-8004 Reputation Registry + Garden sync |
| Map badge | Agents with `erc8004Verified=true` display a gold glow border |
| Cross-platform metadata | JSON includes `garden` extension fields (`territory`, `agentContract`) |

### 9.2 ERC-8004 JSON Structure (Garden Extended)

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "AirdropBot #001",
  "description": "Automated airdrop distribution agent",
  "image": "data:image/svg+xml;base64,...",
  "services": [{ "type": "A2A", "url": "https://..." }],
  "x402Support": true,
  "active": true,
  "garden": {
    "territory": "bnbchain",
    "agentContract": "0xYourContractAddress"
  }
}
```

---

## 10. Deployment & Operations

### 10.1 Frontend Deployment

| Step | Command |
|------|---------|
| Install dependencies | `npm install` |
| Local development | `npm run dev` → `http://localhost:5173` |
| Production build | `npm run build` → `dist/` |
| Type check | `npm run typecheck` |

### 10.2 Vercel Deployment (www.bnbaigalaxy.com)

The project is deployed via Vercel connected to GitHub repo `davisson2003/AIGalaxy`. `vercel.json` configures SPA routing rewrites so React Router works correctly on all paths.

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [{
    "source": "/assets/(.*)",
    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
  }]
}
```

DNS: `CNAME www → cname.vercel-dns.com` / `A @ → 76.76.21.21` configured on Namecheap.

### 10.3 Contract Deployment

```bash
# 1. Deploy BNBGardenRegistry (Garden maintainer, one-time)
npx hardhat run scripts/deploy_registry.ts --network bscMainnet

# 2. Developer deploys their own AirdropAgent
npx hardhat run contracts/AirdropAgent_OnchainMeta_deploy.js --network bscTestnet
```

### 10.4 Monitoring Metrics

| Metric | Where to Observe | Alert Threshold |
|--------|-----------------|-----------------|
| RPC response time | StatsPanel / rpc.ts | > 3s → switch to fallback node |
| Poll success rate | registryWatcher | 3 consecutive failures → `chainStatus="error"` |
| Registered Agent count | Zustand store | — (observability metric) |
| Latest block lag | StatsPanel | Block stalls > 60s → anomaly |

---

## 11. Known Issues & Fixes

| Issue | Root Cause | Fix | Status |
|-------|-----------|-----|--------|
| `Cannot read properties of undefined (reading 'width')` | `useChainData` dispatched before Phaser `create()` completed, triggering `syncAgents` on uninitialized `scene.scale` | Added `_ready` guard; `syncAgents` buffers when `_ready=false`; `create()` flushes at end | ✅ Fixed |
| `Cannot read properties of undefined (reading 'once')` | In Phaser 3.90, `scene.events` is not wired until after `new Phaser.Game()` boots; `scene.events.once('create',...)` returned `undefined.once` | Replaced with `scene.onReady` callback set before `new Phaser.Game()`, called at end of `create()` | ✅ Fixed |
| TypeScript error on `FeedEvent.id` | `chainWatcher` emitted `number` IDs while type declared `string` | Widened `FeedEvent.id` to `string \| number`; made `text` optional; added `'chain'` to type union | ✅ Fixed |
| `401 Unauthorized from NodeReal` | Hardcoded NodeReal endpoint missing API key authentication | Use `VITE_NODEREAL_KEY` environment variable; configured in `.env.local` and Vercel dashboard | ✅ Fixed |
| `tokenURI silently dropping agents` | Uncaught error when parsing agent metadata | Added inner try-catch in ERC8004Watcher.tokenURI() with fallback logging | ✅ Fixed |
| `Non-indexed tokenId` | Event logs missing tokenId in indexed topics, only available in log.data | Use fallback: `log.topics[3] ?? log.data` to extract tokenId from encoded data | ✅ Fixed |
| `Network switch state leakage` | Switching networks caused old feedEvents/agents to mix with new network data | Implemented per-network cache (`networkCache` Map) + localStorage persist middleware | ✅ Fixed |

---

*BNBChain Garden Design Document v1.1 | Internal document | Updated March 2026*
