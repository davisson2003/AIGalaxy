import { ethers } from 'ethers'

/**
 * Free public BSC Mainnet RPC endpoints, in priority order.
 * - No API key required for any of these.
 * - MegaNode (NodeReal) can also be used by registering a free key at nodereal.io.
 */
export const BSC_RPC_ENDPOINTS = [
  // NodeReal MegaNode — free public key (shared, may be rate-limited)
  'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de12d21',
  // Binance official public RPC
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.ninicoin.io/',
  // Ankr free public
  'https://rpc.ankr.com/bsc',
]

export type ProviderStatus = 'connecting' | 'connected' | 'error' | 'offline'

export interface RpcInfo {
  provider: ethers.JsonRpcProvider
  endpoint: string
  chainId: number
  blockNumber: number
}

/**
 * Try each endpoint in order and return the first one that responds.
 * Times out after 4 s per attempt.
 */
export async function createBscProvider(
  customEndpoint?: string,
): Promise<RpcInfo> {
  const endpoints = customEndpoint
    ? [customEndpoint, ...BSC_RPC_ENDPOINTS]
    : BSC_RPC_ENDPOINTS

  const errors: string[] = []

  for (const url of endpoints) {
    try {
      const provider = new ethers.JsonRpcProvider(url, undefined, {
        staticNetwork: true,          // skip eth_chainId on every request
        polling: true,
        pollingInterval: 5000,
      })

      // Verify connection with a timeout
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 4000),
      )
      const blockNumber = await Promise.race([provider.getBlockNumber(), timeout])

      console.log(`[RPC] Connected to ${url} at block ${blockNumber}`)
      return { provider, endpoint: url, chainId: 56, blockNumber }
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`)
      continue
    }
  }

  throw new Error(
    `All BSC RPC endpoints failed:\n${errors.join('\n')}`,
  )
}
