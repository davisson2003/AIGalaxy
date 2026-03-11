import Phaser from 'phaser'
import { TERRITORIES, TERRITORY_MAP } from '@/constants/territories'
import { PALETTE, MSG_COLORS, toPhaserColor } from '@/constants/colors'
import type { Agent, AgentMessage, PhaserEvent } from '@/types'

// ─── Internal types ───────────────────────────────────────────────────────────

interface AgentSprite {
  agent: Agent
  circle: Phaser.GameObjects.Arc
  glow:   Phaser.GameObjects.Arc
  ring:   Phaser.GameObjects.Arc
  glowTween: Phaser.Tweens.Tween
}

interface Particle {
  x: number; y: number
  sx: number; sy: number
  ex: number; ey: number
  progress: number
  speed: number
  color: number
  graphics: Phaser.GameObjects.Arc
  trail: Phaser.GameObjects.Arc[]
}

interface Wave {
  circle: Phaser.GameObjects.Arc
  maxR: number
  speed: number
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class MainMapScene extends Phaser.Scene {
  // Event emitter — channel name 'phaser-event' used by both scene and PhaserGame.tsx
  eventBus!: Phaser.Events.EventEmitter

  // Sprite registries
  private agentSprites: Map<number, AgentSprite> = new Map()
  private particles: Particle[] = []
  private waves: Wave[] = []
  private beamGraphics: Phaser.GameObjects.Graphics[] = []

  // Layers
  private bgLayer!: Phaser.GameObjects.Graphics
  private roadLayer!: Phaser.GameObjects.Graphics
  private tileLayer!: Phaser.GameObjects.Container
  private agentLayer!: Phaser.GameObjects.Container
  private fxLayer!: Phaser.GameObjects.Container

  // State (injected from React/store)
  private _agents: Agent[] = []

  // Prevents MAP_CLICKED from firing when a zone/agent already consumed the click
  private _clickConsumed = false

  // Guards all public API methods — true only after create() completes.
  // The scene object is stored in sceneRef BEFORE Phaser calls create(), so
  // React effects can run against an uninitialised scene.  Every public method
  // that accesses this.scale or layer objects must check this flag first.
  private _ready = false

  // Called by PhaserGame.tsx to receive a notification once create() finishes.
  // Using a plain callback avoids having to access scene.events before the
  // Phaser Systems object has been wired up by the Game constructor.
  onReady?: () => void

  constructor() {
    super({ key: 'MainMapScene' })
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create() {
    this.eventBus = new Phaser.Events.EventEmitter()

    this.bgLayer    = this.add.graphics()
    this.roadLayer  = this.add.graphics()
    this.tileLayer  = this.add.container(0, 0)
    this.fxLayer    = this.add.container(0, 0)
    this.agentLayer = this.add.container(0, 0)

    this.drawBackground()
    this.drawGrid()
    this.drawRoads()
    this.drawTerritories()

    this.scale.on('resize', this.onResize, this)
    this.input.on('pointerdown', this.onPointerDown, this)

    // Mark the scene as fully initialised.  Any buffered agent data that
    // arrived before this point is applied now.
    this._ready = true
    if (this._agents.length > 0) this.syncAgents(this._agents)

    // Notify React that the scene is live (safe to access eventBus etc.)
    this.onReady?.()
  }

  update() {
    this.updateAgents()
    this.updateParticles()
    this.updateWaves()
  }

  onResize() {
    this.bgLayer.clear()
    this.roadLayer.clear()
    this.tileLayer.removeAll(true)
    this.drawBackground()
    this.drawGrid()
    this.drawRoads()
    this.drawTerritories()
    this.agentSprites.forEach((_, id) => {
      const a = this._agents.find(x => x.id === id)
      if (a) this.repositionAgent(a)
    })
  }

  // ── Public API (called by React) ───────────────────────────────────────────

  syncAgents(agents: Agent[]) {
    // Buffer agents even before the scene is ready so create() can flush them
    this._agents = agents
    if (!this._ready) return   // layers don't exist yet — create() will call us again
    for (const agent of agents) {
      if (!this.agentSprites.has(agent.id)) this.createAgentSprite(agent)
    }
    this.agentSprites.forEach((_, id) => {
      if (!agents.find(a => a.id === id)) this.removeAgentSprite(id)
    })
  }

  spawnMessageParticle(msg: AgentMessage) {
    if (!this._ready) return
    const from = this._agents.find(a => a.id === msg.fromAgentId)
    const to   = this._agents.find(a => a.id === msg.toAgentId)
    if (!from || !to) return
    this.createParticle(from.x, from.y, to.x, to.y, MSG_COLORS[msg.msgType] ?? PALETTE.gold)
  }

  spawnBroadcastWave() {
    if (!this._ready) return
    const hub = TERRITORY_MAP['bnbchain']   // hub id = 'bnbchain' per constants
    if (!hub) return
    const cx = hub.cx * this.scale.width
    const cy = hub.cy * this.scale.height

    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 150, () => {
        const circle = this.add.arc(cx, cy, 10 + i * 15, 0, 360)
        circle.setStrokeStyle(2, toPhaserColor(PALETTE.gold), 0.7)
        circle.setFillStyle()
        circle.setDepth(5)
        this.fxLayer.add(circle)
        this.waves.push({ circle, maxR: 350, speed: 3.5 })
      })
    }
    TERRITORIES.slice(1).forEach((t, i) => {
      this.time.delayedCall(i * 60, () => {
        this.createParticle(cx, cy, t.cx * this.scale.width, t.cy * this.scale.height, PALETTE.gold)
      })
    })
  }

  spawnJointTaskBeam(terrId1: string, terrId2: string) {
    if (!this._ready) return
    const t1 = TERRITORY_MAP[terrId1]
    const t2 = TERRITORY_MAP[terrId2]
    if (!t1 || !t2) return
    const x1 = t1.cx * this.scale.width,  y1 = t1.cy * this.scale.height
    const x2 = t2.cx * this.scale.width,  y2 = t2.cy * this.scale.height
    const g = this.add.graphics()
    g.setDepth(6)
    this.fxLayer.add(g)
    this.beamGraphics.push(g)
    let alpha = 0.7

    const drawDashed = () => {
      g.clear()
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy)
      const nx = dx / len, ny = dy / len
      const dashLen = 10, gapLen = 8
      let pos = 0, seg = true
      while (pos < len) {
        const segLen = Math.min(seg ? dashLen : gapLen, len - pos)
        if (seg) {
          const sx = x1 + nx * pos, sy = y1 + ny * pos
          const ex = x1 + nx * (pos + segLen), ey = y1 + ny * (pos + segLen)
          g.lineStyle(2, toPhaserColor(PALETTE.muted), alpha)
          g.strokeLineShape(new Phaser.Geom.Line(sx, sy, ex, ey))
        }
        pos += segLen; seg = !seg
      }
    }

    const tween = this.tweens.add({
      targets: { v: 0.7 }, v: 0, duration: 2000, ease: 'Linear',
      onUpdate: (tw) => { alpha = (tw.targets[0] as { v: number }).v; drawDashed() },
      onComplete: () => { g.destroy(); this.beamGraphics = this.beamGraphics.filter(b => b !== g) }
    })
    drawDashed()
    return tween
  }

  highlightAgent(id: number | null) {
    if (!this._ready) return
    this.agentSprites.forEach((s, sid) => {
      const sel = sid === id
      s.circle.setAlpha(sel || id === null ? 1 : 0.5)
      s.circle.setScale(sel ? 1.4 : 1)
    })
  }

  highlightTerritory(id: string | null) {
    if (!this._ready) return
    this.tileLayer.removeAll(true)
    this.drawTerritories(id ?? undefined)
  }

  // ── Background & Static Layers ─────────────────────────────────────────────

  // Helper: pointy-top hexagon vertex array
  private getHexPoints(cx: number, cy: number, size: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6
      pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) })
    }
    return pts
  }

  private drawBackground() {
    const { width, height } = this.scale

    // Deep-space base
    this.bgLayer.fillStyle(0x070A14, 1)
    this.bgLayer.fillRect(0, 0, width, height)

    // Nebula blobs — soft atmosphere patches
    const nebulae: [number, number, number, number, number][] = [
      [0.20, 0.30, 180, 0x1A1040, 0.55],
      [0.75, 0.25, 150, 0x0A1828, 0.50],
      [0.55, 0.65, 160, 0x101830, 0.45],
      [0.30, 0.72, 120, 0x0F1A20, 0.40],
      [0.82, 0.68, 110, 0x18102A, 0.40],
    ]
    for (const [fx, fy, r, col, alpha] of nebulae) {
      this.bgLayer.fillStyle(col, alpha)
      this.bgLayer.fillCircle(fx * width, fy * height, r)
    }

    // Deterministic star field (stable fractions — no jitter on resize)
    const STARS: [number, number, number, number][] = [
      [0.04,0.07,0.8,0.5],[0.13,0.21,0.6,0.35],[0.27,0.04,1.1,0.7],[0.37,0.17,0.7,0.4],
      [0.51,0.02,0.9,0.6],[0.64,0.11,0.6,0.3],[0.76,0.06,1.0,0.65],[0.87,0.18,0.7,0.45],
      [0.93,0.30,1.2,0.8],[0.82,0.41,0.6,0.35],[0.90,0.54,0.9,0.55],[0.84,0.67,0.7,0.4],
      [0.75,0.78,1.1,0.7],[0.61,0.86,0.6,0.35],[0.47,0.91,0.8,0.5],[0.34,0.84,0.7,0.4],
      [0.20,0.90,1.0,0.6],[0.08,0.81,0.6,0.35],[0.03,0.66,0.9,0.55],[0.01,0.51,0.7,0.4],
      [0.06,0.37,0.8,0.5],[0.02,0.24,1.1,0.7],[0.17,0.34,0.6,0.35],[0.31,0.27,0.9,0.6],
      [0.44,0.13,0.7,0.45],[0.56,0.24,0.8,0.5],[0.69,0.32,0.6,0.35],[0.79,0.27,1.0,0.65],
      [0.71,0.53,0.7,0.4],[0.59,0.61,0.9,0.55],[0.42,0.56,0.6,0.35],[0.29,0.64,0.8,0.5],
      [0.15,0.57,0.7,0.4],[0.24,0.43,1.1,0.7],[0.37,0.71,0.6,0.35],[0.52,0.77,0.9,0.6],
      [0.66,0.71,0.7,0.45],[0.11,0.72,0.8,0.5],[0.88,0.77,0.6,0.35],[0.41,0.37,1.0,0.65],
    ]
    for (const [fx, fy, r, a] of STARS) {
      this.bgLayer.fillStyle(0xFFFFFF, a)
      this.bgLayer.fillCircle(fx * width, fy * height, r)
    }
  }

  private drawGrid() {
    const { width, height } = this.scale
    const size = 55
    for (let x = size; x < width; x += size) {
      for (let y = size; y < height; y += size) {
        this.bgLayer.fillStyle(0x3A4570, 0.22)
        this.bgLayer.fillCircle(x, y, 0.9)
      }
    }
  }

  private drawRoads() {
    const { width, height } = this.scale
    const hub = TERRITORIES[0]
    const hx = hub.cx * width, hy = hub.cy * height
    this.roadLayer.clear()

    for (let i = 1; i < TERRITORIES.length; i++) {
      const t     = TERRITORIES[i]
      const tx    = t.cx * width, ty = t.cy * height
      const color = toPhaserColor(t.color)

      // Layer 1: wide outer glow
      this.roadLayer.lineStyle(8, color, 0.04)
      this.roadLayer.strokeLineShape(new Phaser.Geom.Line(hx, hy, tx, ty))

      // Layer 2: mid glow
      this.roadLayer.lineStyle(3, color, 0.12)
      this.roadLayer.strokeLineShape(new Phaser.Geom.Line(hx, hy, tx, ty))

      // Layer 3: dashed core line
      const dx = tx - hx, dy = ty - hy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const nx = dx / dist, ny = dy / dist
      const dash = 10, gap = 8
      let pos = 0, draw = true
      while (pos < dist) {
        const seg = Math.min(draw ? dash : gap, dist - pos)
        if (draw) {
          this.roadLayer.lineStyle(1, color, 0.45)
          this.roadLayer.strokeLineShape(new Phaser.Geom.Line(
            hx + nx * pos,        hy + ny * pos,
            hx + nx * (pos + seg), hy + ny * (pos + seg),
          ))
        }
        pos += seg; draw = !draw
      }
    }
  }

  private drawTerritories(selectedId?: string) {
    const { width, height } = this.scale

    for (const t of TERRITORIES) {
      const cx      = t.cx * width
      const cy      = t.cy * height
      const isHub   = t.id === 'bnbchain'
      const isSel   = t.id === selectedId
      const hexSize = isHub ? t.radius * 1.55 : t.radius * 1.35
      const color   = toPhaserColor(t.color)

      // ── Bloom glow layers ──
      const bloom = this.add.arc(cx, cy, hexSize * 2.4, 0, 360)
      bloom.setFillStyle(color, 0.035).setDepth(1)
      this.tileLayer.add(bloom)

      const halo = this.add.arc(cx, cy, hexSize * 1.6, 0, 360)
      halo.setFillStyle(color, isHub ? 0.10 : 0.07).setDepth(2)
      this.tileLayer.add(halo)

      // Hub outer orbit ring
      if (isHub) {
        const outerRing = this.add.arc(cx, cy, hexSize * 1.9, 0, 360)
        outerRing.setStrokeStyle(1, color, 0.28).setFillStyle().setDepth(2)
        this.tileLayer.add(outerRing)
      }

      // ── Hexagon body ──
      const g         = this.add.graphics().setDepth(3)
      const outerPts  = this.getHexPoints(cx, cy, hexSize)
      const innerPts  = this.getHexPoints(cx, cy, hexSize * 0.82)

      // Dark fill
      g.fillStyle(toPhaserColor(isHub ? PALETTE.card2 : PALETTE.card), 0.96)
      g.fillPoints(outerPts, true, true)

      // Color tint wash
      g.fillStyle(color, isHub ? 0.11 : 0.07)
      g.fillPoints(innerPts, true, true)

      // Hex border
      g.lineStyle(isSel ? 2.5 : isHub ? 2.2 : 1.8, color, isSel ? 1 : isHub ? 0.9 : 0.70)
      g.strokePoints(outerPts, true, true)

      // Selected: extra inner ring
      if (isSel) {
        g.lineStyle(1, color, 0.45)
        g.strokePoints(innerPts, true, true)
      }

      this.tileLayer.add(g)

      // ── Type badge ──
      this.tileLayer.add(
        this.add.text(cx, cy - hexSize * 0.63, t.type, {
          fontSize: '8px', color: t.color,
          fontFamily: 'Inter, monospace',
          backgroundColor: t.color + '22',
          padding: { x: 5, y: 2 },
        }).setOrigin(0.5, 0.5).setDepth(4)
      )

      // ── Icon ──
      this.tileLayer.add(
        this.add.text(cx, cy - 11, t.icon, {
          fontSize: isHub ? '26px' : '21px', align: 'center',
        }).setOrigin(0.5).setDepth(4)
      )

      // ── Name ──
      const displayName = t.name.length > 13 ? t.name.slice(0, 12) + '…' : t.name
      this.tileLayer.add(
        this.add.text(cx, cy + 8, displayName, {
          fontSize: isHub ? '11px' : '10px',
          fontStyle: isHub ? 'bold' : 'normal',
          color: t.color,
          fontFamily: 'Inter, sans-serif',
          align: 'center',
        }).setOrigin(0.5, 0).setDepth(4)
      )

      // ── Agent count ──
      const count = this._agents.filter(a => a.territory === t.id).length
      this.tileLayer.add(
        this.add.text(cx, cy + 21, `${count} agents`, {
          fontSize: '9px', color: PALETTE.muted,
          fontFamily: 'Inter, sans-serif',
        }).setOrigin(0.5, 0).setDepth(4)
      )

      // ── Click zone ──
      const hitZone = this.add.zone(cx, cy, hexSize * 2, hexSize * 2).setDepth(10)
      hitZone.setInteractive({ useHandCursor: true })
      hitZone.on('pointerdown', () => {
        this._clickConsumed = true
        this.eventBus.emit('phaser-event', { type: 'TERRITORY_CLICKED', territoryId: t.id } as PhaserEvent)
      })
      this.tileLayer.add(hitZone)
    }
  }

  // ── Agent Sprites ─────────────────────────────────────────────────────────

  private createAgentSprite(agent: Agent) {
    const pos    = this.getAgentStartPos(agent)
    agent.x = pos.x; agent.y = pos.y
    const color  = toPhaserColor(agent.color)
    const radius = 5 + Math.random() * 2

    const glow = this.add.arc(agent.x, agent.y, radius + 4, 0, 360)
    glow.setFillStyle(color, 0.25).setDepth(8)
    this.agentLayer.add(glow)

    const circle = this.add.arc(agent.x, agent.y, radius, 0, 360)
    circle.setFillStyle(color, 1).setDepth(9)
    circle.setInteractive({ useHandCursor: true })
    circle.on('pointerdown', () => {
      this._clickConsumed = true
      this.eventBus.emit('phaser-event', { type: 'AGENT_CLICKED', agentId: agent.id } as PhaserEvent)
    })
    this.agentLayer.add(circle)

    const repFrac = Math.min(agent.reputation / 500, 1)
    const ring = this.add.arc(agent.x, agent.y, radius + 3, -90, -90 + repFrac * 360)
    ring.setStrokeStyle(2, color, 0.4).setFillStyle().setDepth(9)
    this.agentLayer.add(ring)

    const glowTween = this.tweens.add({
      targets: glow, alpha: { from: 0.15, to: 0.4 },
      duration: 1500 + Math.random() * 1000,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    this.agentSprites.set(agent.id, { agent, circle, glow, ring, glowTween })
  }

  private removeAgentSprite(id: number) {
    const s = this.agentSprites.get(id)
    if (!s) return
    s.glowTween.destroy()
    s.circle.destroy(); s.glow.destroy(); s.ring.destroy()
    this.agentSprites.delete(id)
  }

  private repositionAgent(agent: Agent) {
    const s = this.agentSprites.get(agent.id)
    if (!s) return
    s.circle.setPosition(agent.x, agent.y)
    s.glow.setPosition(agent.x, agent.y)
    s.ring.setPosition(agent.x, agent.y)
  }

  private getAgentStartPos(agent: Agent) {
    const t = TERRITORY_MAP[agent.territory]
    if (!t) return { x: this.scale.width / 2, y: this.scale.height / 2 }
    const cx = t.cx * this.scale.width, cy = t.cy * this.scale.height
    const ang = Math.random() * Math.PI * 2
    return {
      x: cx + Math.cos(ang) * t.radius * 0.7 * Math.random(),
      y: cy + Math.sin(ang) * t.radius * 0.7 * Math.random(),
    }
  }

  private updateAgents() {
    for (const agent of this._agents) {
      const t = TERRITORY_MAP[agent.territory]
      if (!t) continue
      const cx = t.cx * this.scale.width, cy = t.cy * this.scale.height
      const homeR = t.radius * 0.75

      agent.x += agent.vx; agent.y += agent.vy

      const dx = agent.x - cx, dy = agent.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > homeR) {
        agent.vx -= (dx / dist) * 0.06
        agent.vy -= (dy / dist) * 0.06
      }
      agent.vx += (Math.random() - 0.5) * 0.04
      agent.vy += (Math.random() - 0.5) * 0.04
      agent.vx *= 0.95; agent.vy *= 0.95

      this.repositionAgent(agent)
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private createParticle(sx: number, sy: number, ex: number, ey: number, colorHex: string) {
    const color = toPhaserColor(colorHex)
    const head = this.add.arc(sx, sy, 3.5, 0, 360)
    head.setFillStyle(color, 1).setDepth(15)
    this.fxLayer.add(head)

    const trail: Phaser.GameObjects.Arc[] = []
    for (let i = 0; i < 3; i++) {
      const tr = this.add.arc(sx, sy, 2.5 - i * 0.5, 0, 360)
      tr.setFillStyle(color, 0.5 - i * 0.15).setDepth(14)
      this.fxLayer.add(tr)
      trail.push(tr)
    }
    this.particles.push({ x: sx, y: sy, sx, sy, ex, ey, progress: 0, speed: 0.015 + Math.random() * 0.008, color, graphics: head, trail })
  }

  private updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.progress += p.speed
      if (p.progress >= 1) {
        p.graphics.destroy(); p.trail.forEach(tr => tr.destroy())
        this.particles.splice(i, 1); continue
      }
      p.x = p.sx + (p.ex - p.sx) * p.progress
      p.y = p.sy + (p.ey - p.sy) * p.progress
      const alpha = Math.sin(p.progress * Math.PI)
      p.graphics.setPosition(p.x, p.y).setAlpha(alpha)
      for (let j = 0; j < p.trail.length; j++) {
        const tp = p.progress - (j + 1) * 0.04
        if (tp < 0) { p.trail[j].setAlpha(0); continue }
        p.trail[j].setPosition(
          p.sx + (p.ex - p.sx) * tp,
          p.sy + (p.ey - p.sy) * tp,
        ).setAlpha(alpha * (1 - (j + 1) * 0.3))
      }
    }
  }

  // ── Waves ─────────────────────────────────────────────────────────────────

  private updateWaves() {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      const newR = (w.circle.radius ?? 10) + w.speed
      if (newR > w.maxR) { w.circle.destroy(); this.waves.splice(i, 1); continue }
      w.circle.setRadius(newR).setStrokeStyle(2, toPhaserColor(PALETTE.gold), (1 - newR / w.maxR) * 0.6)
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onPointerDown(_ptr: Phaser.Input.Pointer) {
    if (!this._clickConsumed) {
      this.eventBus.emit('phaser-event', { type: 'MAP_CLICKED' } as PhaserEvent)
    }
    this._clickConsumed = false
  }
}
