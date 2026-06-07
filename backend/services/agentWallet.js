// Agent wallet service
//
// Each agent gets its own real EVM wallet on Base at registration time.
// The private key is generated server-side, returned to the user exactly once
// (so they can save it), and stored encrypted in the DB so the backend can
// later sign real on-chain transactions on the agent's behalf.

const crypto = require('crypto')
const { ethers } = require('ethers')

// Primary RPC(s). BASE_RPC_URL may be a single URL or a comma-separated list.
// We always add a set of reliable public Base endpoints as additional backends
// so a single throttled endpoint (e.g. the free mainnet.base.org) can't block
// on-chain reads/trades — the provider transparently fails over to another.
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

const PUBLIC_BASE_RPCS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
  'https://1rpc.io/base',
  'https://base.meowrpc.com',
]

function getRpcUrls() {
  const configured = String(BASE_RPC)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  // Configured endpoints first (higher priority), then public fallbacks, deduped.
  const seen = new Set()
  const urls = []
  for (const u of [...configured, ...PUBLIC_BASE_RPCS]) {
    const k = u.toLowerCase()
    if (!seen.has(k)) { seen.add(k); urls.push(u) }
  }
  return urls
}

// Real ERC-20 token that agent wallets hold/trade (AXIONET on Base by default).
const PAYMENT_TOKEN_ADDRESS = process.env.PAYMENT_TOKEN_ADDRESS || '0x81adeadcb166f4687403c99d4f027cccbaa5fba3'
const TOKEN_SYMBOL = process.env.PAYMENT_TOKEN_SYMBOL || 'AXIONET'

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
]

// Encryption key for stored private keys. Falls back to HOUSE_PRIVATE_KEY so it
// works out of the box, but set WALLET_ENCRYPTION_SECRET in production.
function getEncryptionKey() {
  const secret = process.env.WALLET_ENCRYPTION_SECRET || process.env.HOUSE_PRIVATE_KEY || 'axionet-dev-fallback-secret'
  return crypto.createHash('sha256').update(String(secret)).digest() // 32 bytes
}

function encryptPrivateKey(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: v1:<iv>:<tag>:<ciphertext>  (all hex)
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

function decryptPrivateKey(stored) {
  if (!stored) return null
  try {
    const parts = String(stored).split(':')
    if (parts[0] !== 'v1' || parts.length !== 4) {
      // Assume legacy plaintext key
      return stored
    }
    const iv = Buffer.from(parts[1], 'hex')
    const tag = Buffer.from(parts[2], 'hex')
    const data = Buffer.from(parts[3], 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch (e) {
    console.error('decryptPrivateKey failed:', e.message)
    return null
  }
}

// Create a brand-new random wallet for an agent.
function createAgentWallet() {
  const w = ethers.Wallet.createRandom()
  return { address: w.address, privateKey: w.privateKey }
}

// Cache a single FallbackProvider so connections are reused and load is spread
// across endpoints. quorum:1 means a single backend answering is enough; ethers
// tries them by priority and fails over on error/timeout — which neutralizes
// the public-RPC rate limiting that was aborting reads (CALL_EXCEPTION).
let _provider = null
function getProvider() {
  if (_provider) return _provider
  const urls = getRpcUrls()
  const chainId = 8453 // Base mainnet
  if (urls.length === 1) {
    _provider = new ethers.JsonRpcProvider(urls[0], chainId, { staticNetwork: true })
    return _provider
  }
  const configs = urls.map((url, i) => ({
    provider: new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }),
    priority: i + 1,   // configured endpoints first
    weight: 1,
    stallTimeout: 1500, // ms before trying the next backend
  }))
  _provider = new ethers.FallbackProvider(configs, chainId, { quorum: 1 })
  return _provider
}

// Read the real on-chain balances (native ETH + payment token) for an address.
async function getWalletBalances(address) {
  if (!address) return { address: null, eth: 0, token: 0, tokenSymbol: TOKEN_SYMBOL }
  const provider = getProvider()
  const out = { address, eth: 0, token: 0, tokenSymbol: TOKEN_SYMBOL }
  try {
    const wei = await provider.getBalance(address)
    out.eth = parseFloat(ethers.formatEther(wei))
  } catch (e) {
    console.error(`getBalance(${address}) failed:`, e.message)
  }
  try {
    const token = new ethers.Contract(PAYMENT_TOKEN_ADDRESS, ERC20_ABI, provider)
    const [raw, decimals] = await Promise.all([
      token.balanceOf(address),
      token.decimals().catch(() => 18),
    ])
    out.token = parseFloat(ethers.formatUnits(raw, decimals))
  } catch (e) {
    console.error(`token balanceOf(${address}) failed:`, e.message)
  }
  return out
}

// Get an ethers Wallet (signer) for an agent from its stored encrypted key.
function getAgentSigner(encryptedKey) {
  const pk = decryptPrivateKey(encryptedKey)
  if (!pk) return null
  return new ethers.Wallet(pk, getProvider())
}

module.exports = {
  BASE_RPC,
  PAYMENT_TOKEN_ADDRESS,
  TOKEN_SYMBOL,
  ERC20_ABI,
  createAgentWallet,
  encryptPrivateKey,
  decryptPrivateKey,
  getWalletBalances,
  getAgentSigner,
  getProvider,
}
