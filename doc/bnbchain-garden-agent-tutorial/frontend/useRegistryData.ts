/**
 * useRegistryData.ts
 *
 * 替换 useChainData.ts，将 RegistryWatcher 接入 Garden store。
 *
 * 用法（在 App.tsx 的 DataDriver 里替换 useChainData）：
 *   import { useRegistryData } from '@/hooks/useRegistryData'
 *   useRegistryData(true)
 */

import { useEffect, useRef } from 'react'
import { createBscProvider } from '@/services/rpc'
import { RegistryWatcher, type RegistryEvent } from './registryWatcher'   // 调整路径
import { useGardenStore } from '@/store'

export function useRegistryData(enabled = true) {
  const watcherRef = useRef<RegistryWatcher | null>(null)

  const setChainStatus    = useGardenStore(s => s.setChainStatus)
  const setRpcEndpoint    = useGardenStore(s => s.setRpcEndpoint)
  const pushFeedEvent     = useGardenStore(s => s.pushFeedEvent)
  const updateAgent       = useGardenStore(s => s.updateAgent)
  const setAgents         = useGardenStore(s => s.setAgents)
  const incrementMessages = useGardenStore(s => s.incrementMessages)
  const incrementActivities = useGardenStore(s => s.incrementActivities)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const init = async () => {
      setChainStatus('connecting')
      try {
        const { provider, endpoint } = await createBscProvider()
        if (cancelled) return
        setChainStatus('connected')
        setRpcEndpoint(endpoint)

        const onEvents = (events: RegistryEvent[]) => {
          if (cancelled) return
          for (const evt of events) {
            pushFeedEvent(evt.feedEvent)

            switch (evt.kind) {
              case 'register': {
                // 把新 Agent 追加到 store
                if (evt.newAgent) {
                  const current = useGardenStore.getState().agents
                  const exists  = current.find(a => a.id === evt.newAgent!.id)
                  if (!exists) setAgents([...current, evt.newAgent])
                }
                break
              }
              case 'action': {
                // 找到对应 Agent，更新声誉
                const all = useGardenStore.getState().agents
                const target = all.find(
                  a => a.tba.toLowerCase() === evt.agentAddress.toLowerCase()
                )
                if (target && evt.repDelta) {
                  updateAgent(target.id, {
                    reputation: Math.min(target.reputation + evt.repDelta, 9999),
                  })
                }
                incrementActivities()
                break
              }
              case 'migrate': {
                const all = useGardenStore.getState().agents
                const target = all.find(
                  a => a.tba.toLowerCase() === evt.agentAddress.toLowerCase()
                )
                if (target && evt.toTerritory) {
                  updateAgent(target.id, { territory: evt.toTerritory })
                }
                break
              }
              case 'message': {
                // 触发粒子动画（通过 window.__gardenScene）
                if (evt.agentMsg) {
                  const scene = (window as any).__gardenScene?.current
                  scene?.spawnMessageParticle(evt.agentMsg)
                }
                incrementMessages()
                break
              }
              case 'broadcast': {
                const scene = (window as any).__gardenScene?.current
                scene?.spawnBroadcastWave()
                break
              }
            }
          }
        }

        const watcher = new RegistryWatcher(provider, onEvents)
        watcherRef.current = watcher
        await watcher.start()

      } catch (err) {
        if (!cancelled) {
          console.warn('[useRegistryData] Failed:', err)
          setChainStatus('error')
        }
      }
    }

    init()
    return () => {
      cancelled = true
      watcherRef.current?.stop()
      watcherRef.current = null
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
