import { useEffect, useRef, useCallback } from 'react'
import Phaser from 'phaser'
import { MainMapScene } from './scenes/MainMapScene'
import { useGardenStore } from '@/store'
import type { PhaserEvent } from '@/types'

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef      = useRef<Phaser.Game | null>(null)
  const sceneRef     = useRef<MainMapScene | null>(null)
  const busReadyRef  = useRef(false)

  const agents          = useGardenStore(s => s.agents)
  const selectAgent     = useGardenStore(s => s.selectAgent)
  const selectTerritory = useGardenStore(s => s.selectTerritory)
  const clearSelection  = useGardenStore(s => s.clearSelection)

  const handlePhaserEvent = useCallback((evt: PhaserEvent) => {
    switch (evt.type) {
      case 'AGENT_CLICKED':     selectAgent(evt.agentId);         break
      case 'TERRITORY_CLICKED': selectTerritory(evt.territoryId);  break
      case 'MAP_CLICKED':       clearSelection();                  break
    }
  }, [selectAgent, selectTerritory, clearSelection])

  // ── Boot Phaser once the container has real pixel dimensions ─────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || gameRef.current) return

    const startPhaser = (w: number, h: number) => {
      if (gameRef.current) return
      const scene = new MainMapScene()
      sceneRef.current = scene

      console.log('[Garden] Phaser init', w, 'x', h)

      // Register ready callback BEFORE creating the Game so it's in place
      // when Phaser calls scene.create() (which invokes onReady at the end).
      // We deliberately avoid scene.events.once() here because scene.events
      // (scene.sys.events) may not yet exist at the point new Phaser.Game()
      // returns in Phaser 3.90.
      scene.onReady = () => {
        console.log('[Garden] Scene ready ✓')
        scene.eventBus.on('phaser-event', handlePhaserEvent)
        busReadyRef.current = true
      }

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        backgroundColor: '#0D0F1A',
        width: w,
        height: h,
        scene: [scene],
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: { antialias: true, powerPreference: 'high-performance' },
      })
    }

    // Use ResizeObserver so we wait until the element has layout dimensions
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect
        if (width > 0 && height > 0 && !gameRef.current) {
          startPhaser(Math.floor(width), Math.floor(height))
        }
      })
      ro.observe(container)
    }

    // Immediate fallback for browsers without ResizeObserver or if already laid out
    const { clientWidth: cw, clientHeight: ch } = container
    if (cw > 0 && ch > 0) {
      startPhaser(cw, ch)
    } else {
      // If zero, try after a frame
      const raf = requestAnimationFrame(() => {
        const { clientWidth: w2, clientHeight: h2 } = container
        startPhaser(w2 || window.innerWidth - 464, h2 || window.innerHeight)
      })
      return () => {
        cancelAnimationFrame(raf)
        ro?.disconnect()
        cleanup()
      }
    }

    const cleanup = () => {
      ro?.disconnect()
      if (sceneRef.current?.eventBus) {
        sceneRef.current.eventBus.off('phaser-event', handlePhaserEvent)
      }
      gameRef.current?.destroy(true)
      gameRef.current = null
      sceneRef.current = null
      busReadyRef.current = false
    }

    return cleanup
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep event handler reference fresh ───────────────────────────────────
  useEffect(() => {
    if (!busReadyRef.current || !sceneRef.current?.eventBus) return
    const bus = sceneRef.current.eventBus
    bus.off('phaser-event', handlePhaserEvent)
    bus.on('phaser-event', handlePhaserEvent)
  }, [handlePhaserEvent])

  // ── Sync store agents → Phaser ────────────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.syncAgents(agents)
  }, [agents])

  // ── Expose scene for simulation hook ──────────────────────────────────────
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__gardenScene = sceneRef
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0D0F1A', display: 'block' }}
      className="w-full h-full"
    />
  )
}
