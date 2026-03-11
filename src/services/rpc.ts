import { ethers } from 'ethers'

/**
 * Free public BSC Mainnet RPC endpoints, in priority order.
 * - No API key required for any of these.
 * - MegaNode (NodeReal) can also be used by registering a free key at nodereal.io.
 */
export const BSC_RPC_ENDPOINTS = [
  // Binance official public RPC
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.ninicoin.io/',
  // Ankr free public
  'https://rpc.ankr.com/bsc',
]

export const BSC_TESTNET_RPC_ENDPOINTS = [
  // BNB Chain official testnet
  'https://bsc-testnet.bnbchain.org',
  'https://data-seed-prebsc-1-s1.bnbchain.org:8545/',
  'https://data-seed-prebsc-2-s1.bnbchain.org:8545/',
  // Public node
  'https://bsc-testnet-rpc.publicnode.com',
  // Ankr testnet
  'https://rpc.ankr.com/bsc_testnet_chapel',
]

export type ProviderStatus = 'connecting' | 'connected' | 'error' | 'offline'
export type NetworkMode = 'mainnet' | 'testnet' | 'mock'

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
  network: NetworkMode = 'mainnet',
  customEndpoint?: string,
): Promise<RpcInfo> {
  const baseEndpoints = network === 'testnet' ? BSC_TESTNET_RPC_ENDPOINTS : BSC_RPC_ENDPOINTS
  const endpoints = customEndpoint ? [customEndpoint, ...baseEndpoints] : baseEndpoints
  const chainId = network === 'testnet' ? 97 : 56

  const errors: string[] = []

  for (const url of endpoints) {
    try {
      const provider = new ethers.JsonRpcProvider(url, undefined, {
        staticNetwork: true,
        polling: true,
        pollingInterval: 5000,
      })

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 4000),
      )
      const blockNumber = await Promise.race([provider.getBlockNumber(), timeout])

      console.log(`[RPC] Connected to ${url} (chain ${chainId}) at block ${blockNumber}`)
      return { provider, endpoint: url, chainId, blockNumber }
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`)
      continue
    }
  }

  throw new Error(
    `All BSC ${network} RPC endpoints failed:\n${errors.join('\n')}`,
  )
}
