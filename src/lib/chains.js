/** Robinhood Chain mainnet (EVM L2). */
export const robinhood = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://robinhoodchain.blockscout.com',
    },
  },
}

export const EXPLORER_BASE = robinhood.blockExplorers.default.url

export function explorerTx(hash) {
  if (!hash) return undefined
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function explorerAddress(address) {
  if (!address) return undefined
  return `${EXPLORER_BASE}/address/${address}`
}

export function explorerToken(address) {
  if (!address) return undefined
  return `${EXPLORER_BASE}/token/${address}`
}
