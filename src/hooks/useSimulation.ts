import { useEffect, useRef } from 'react'
import { useGardenStore } from '@/store'
import {
  makeMessageEvent,
  makeActivityEvent,
  makeBroadcastEvent,
  makeMigrateEvent,
} from '@/services/mockData'
import type { MainMapScene } from '@/phaser/scenes/MainMapScene'

/** Retrieve the Phaser scene reference registered by PhaserGame.tsx */
function getScene(): MainMapScene | null {
  const ref = (window as unknown as Record<string, unknown>).__gardenScene as
    | React.MutableRefObject<MainMapScene | null>
    | undefined
  return ref?.current ?? null
}

/** Schedule a callback at a random interval within [minMs, maxMs] */
function randomInterval(
  cb: () => void,
  minMs: number,
  maxMs: number,
): ReturnType<typeof setTimeout> {
  const delay = minMs + Math.random() * (maxMs - minMs)
  return setTimeout(() => {
    cb()
  }, delay)
}

/**
 * @param enabled   Whether the simulation is running at all.
 * @param slowMode  When true, intervals are 3× longer (background heartbeat
 *                  while live chain data is the primary source).
 */
export function useSimulation(enabled = true, slowMode = false) {
  const { agents, pushFeedEvent, updateAgent, incrementMessages, incrementActivities } =
    useGardenStore.getState()

  // Keep a stable ref to the latest agents list so interval callbacks always
  // see fresh data without needing to re-register timers.
  const agentsRef = useRef(agents)
  useEffect(() => {
    agentsRef.current = useGardenStore.getState().agents
  })

  // Subscribe to store changes to keep agentsRef fresh
  useEffect(() => {
    const unsub = useGardenStore.subscribe(state => {
      agentsRef.current = state.agents
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []

    // In slow (heartbeat) mode multiply all intervals by 3
    const x = slowMode ? 3 : 1

    // ── Message events (frequent: 0.8–2 s, slow: 2.4–6 s) ──────────────────
    const scheduleMessage = () => {
      if (cancelled) return
      const t = randomInterval(() => {
        const store = useGardenStore.getState()
        const result = makeMessageEvent(agentsRef.current)
        if (result) {
          store.pushFeedEvent(result.event)
          store.incrementMessages()
          getScene()?.spawnMessageParticle(result.msg)
        }
        scheduleMessage()
      }, 800 * x, 2000 * x)
      timers.push(t)
    }

    // ── Activity events (medium: 2–5 s, slow: 6–15 s) ───────────────────────
    const scheduleActivity = () => {
      if (cancelled) return
      const t = randomInterval(() => {
        const store = useGardenStore.getState()
        const event = makeActivityEvent(agentsRef.current)
        if (event) {
          store.pushFeedEvent(event)
          store.incrementActivities()
        }
        scheduleActivity()
      }, 2000 * x, 5000 * x)
      timers.push(t)
    }

    // ── Broadcast waves (rare: 6–15 s, slow: 18–45 s) ───────────────────────
    const scheduleBroadcast = () => {
      if (cancelled) return
      const t = randomInterval(() => {
        const store = useGardenStore.getState()
        store.pushFeedEvent(makeBroadcastEvent())
        getScene()?.spawnBroadcastWave()
        scheduleBroadcast()
      }, 6000 * x, 15000 * x)
      timers.push(t)
    }

    // ── Migration events (very rare: 12–25 s, slow: 36–75 s) ────────────────
    const scheduleMigrate = () => {
      if (cancelled) return
      const t = randomInterval(() => {
        const store = useGardenStore.getState()
        const a = agentsRef.current[Math.floor(Math.random() * agentsRef.current.length)]
        if (a) {
          const territories = ['bnbchain', 'pancakeswap', 'venus', 'listadao', 'binance', 'coinmktcap', 'aster']
          const next = territories.filter(tid => tid !== a.territory)
          const newTerritory = next[Math.floor(Math.random() * next.length)]
          const event = makeMigrateEvent(a, a.territory, newTerritory)
          store.pushFeedEvent(event)
          store.updateAgent(a.id, { territory: newTerritory })
        }
        scheduleMigrate()
      }, 12000 * x, 25000 * x)
      timers.push(t)
    }

    // ── Joint task beams (rare: 10–20 s, slow: 30–60 s) ─────────────────────
    const scheduleJointTask = () => {
      if (cancelled) return
      const t = randomInterval(() => {
        const territories = ['bnbchain', 'pancakeswap', 'venus', 'listadao', 'binance', 'coinmktcap', 'aster']
        const t1 = territories[Math.floor(Math.random() * territories.length)]
        const t2 = territories.filter(z => z !== t1)[Math.floor(Math.random() * (territories.length - 1))]
        getScene()?.spawnJointTaskBeam(t1, t2)
        scheduleJointTask()
      }, 10000 * x, 20000 * x)
      timers.push(t)
    }

    // ── Agent drift: nudge positions each frame ───────────────────────────────
    // (handled inside MainMapScene.update() — no React interval needed)

    // ── Reputation ticks (slow: 5–8 s, heartbeat: 15–24 s) ──────────────────
    const scheduleRepTick = () => {
      if (cancelled) return
      const t = randomInterval(() => {
        const store = useGardenStore.getState()
        agentsRef.current.forEach(agent => {
          const delta = Math.floor(Math.random() * 5) - 1 // –1 to +3
          const newRep = Math.max(0, Math.min(1000, agent.reputation + delta))
          if (newRep !== agent.reputation) {
            store.updateAgent(agent.id, { reputation: newRep })
          }
        })
        scheduleRepTick()
      }, 5000 * x, 8000 * x)
      timers.push(t)
    }

    // Start all loops
    scheduleMessage()
    scheduleActivity()
    scheduleBroadcast()
    scheduleMigrate()
    scheduleJointTask()
    scheduleRepTick()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [enabled, slowMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-expose for external control
  const { pushFeedEvent: _pfe, updateAgent: _ua, incrementMessages: _im, incrementActivities: _ia } =
    { pushFeedEvent, updateAgent, incrementMessages, incrementActivities }
  void _pfe; void _ua; void _im; void _ia
}
