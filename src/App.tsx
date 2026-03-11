import { lazy, Suspense, Component, type ReactNode } from 'react'
import GardenLayout from '@/components/layout/GardenLayout'
import { useSimulation } from '@/hooks/useSimulation'
import { useChainData }  from '@/hooks/useChainData'
import { useGardenStore } from '@/store'

// Lazy-load Phaser (it's a 1.4 MB library; don't block the React UI)
const PhaserGame = lazy(() => import('@/phaser/PhaserGame'))

// ── Error boundary ────────────────────────────────────────────────────────────
interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[Garden] Render error:', error) }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0D0F1A', color: '#E6EDF3', padding: 32,
        }}>
          <p style={{ fontSize: 32, marginBottom: 16 }}>⚠️</p>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Map rendering error
          </p>
          <p style={{ fontSize: 12, color: '#6B7A99', fontFamily: 'monospace', maxWidth: 480, textAlign: 'center' }}>
            {this.state.error.message}
          </p>
          <p style={{ fontSize: 11, color: '#6B7A99', marginTop: 16 }}>
            Check the browser console (F12) for more details.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Loading fallback shown while Phaser module loads ──────────────────────────
function MapFallback() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0D0F1A',
    }}
      className="w-full h-full flex items-center justify-center bg-[#0D1117]"
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36 }}>🌱</div>
        <p style={{ fontSize: 13, color: '#6B7A99', marginTop: 10 }}>
          Loading Garden Map…
        </p>
      </div>
    </div>
  )
}

// ── Combined data driver ───────────────────────────────────────────────────────
// Runs both the on-chain watcher AND the simulation in parallel.
// When the chain is live, chainWatcher provides real events.
// Simulation continues to fire mock events as a background heartbeat so the
// map always looks animated even during quiet on-chain periods.
function DataDriver() {
  const chainStatus = useGardenStore(s => s.chainStatus)
  const networkMode = useGardenStore(s => s.networkMode)

  // Connect to chain (or skip if mock mode). Re-connects when networkMode changes.
  useChainData(networkMode !== 'mock', networkMode)

  // Run mock simulation:
  //  - always in mock mode or while connecting/errored (sole data source)
  //  - at reduced rate while live-connected (background heartbeat only)
  const isMock = networkMode === 'mock'
  useSimulation(isMock || chainStatus !== 'connected', !isMock && chainStatus === 'connected')

  return null
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <DataDriver />
      <GardenLayout
        mapSlot={
          <ErrorBoundary>
            <Suspense fallback={<MapFallback />}>
              <PhaserGame />
            </Suspense>
          </ErrorBoundary>
        }
      />
    </>
  )
}
