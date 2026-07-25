// Agent wallet service
//
// Each agent gets its own real EVM wallet on Robinhood Chain at registration.
// The private key is generated server-side, returned to the user exactly once
// (so they can save it), and stored encrypted in the DB so the backend can
// later sign real on-chain transactions on the agent's behalf.

const crypto = require('crypto')
const { ethers } = require('ethers')

// Primary RPC(s). CHAIN_RPC_URL (or legacy BASE_RPC_URL) may be a single URL
// or a comma-separated list. Default is Robinhood Chain public RPC.
const DEFAULT_RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CHAIN_RPC = process.env.CHAIN_RPC_URL || process.env.BASE_RPC_URL || DEFAULT_RPC
const CHAIN_ID = Number(process.env.CHAIN_ID || 4663) // Robinhood Chain mainnet

function getRpcUrls() {
  const configured = String(CHAIN_RPC)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  // Deduped configured endpoints only — no Base public fallbacks.
  const seen = new Set()
  const urls = []
  for (const u of configured) {
    const k = u.toLowerCase()
    if (!seen.has(k)) { seen.add(k); urls.push(u) }
  }
  return urls.length ? urls : [DEFAULT_RPC]
}

// Optional ERC-20 that agent wallets may hold (unset until RH token is known).
const PAYMENT_TOKEN_ADDRESS = process.env.PAYMENT_TOKEN_ADDRESS || ''
const TOKEN_SYMBOL = process.env.PAYMENT_TOKEN_SYMBOL || 'TOKEN'

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
]

// Encryption key for stored private keys. Falls back to HOUSE_PRIVATE_KEY so it
// works out of the box, but set WALLET_ENCRYPTION_SECRET in production.
function getEncryptionKey() {
  const secret = process.env.WALLET_ENCRYPTION_SECRET || process.env.HOUSE_PRIVATE_KEY || 'agex-dev-fallback-secret'
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
// across endpoints. quorum:1 means a single backend answering is enough.
let _provider = null
function getProvider() {
  if (_provider) return _provider
  const urls = getRpcUrls()
  const chainId = CHAIN_ID
  if (urls.length === 1) {
    _provider = new ethers.JsonRpcProvider(urls[0], chainId, { staticNetwork: true })
    return _provider
  }
  const configs = urls.map((url, i) => ({
    provider: new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }),
    priority: i + 1,
    weight: 1,
    stallTimeout: 1500,
  }))
  _provider = new ethers.FallbackProvider(configs, chainId, { quorum: 1 })
  return _provider
}

// Read the real on-chain balances (native ETH + optional payment token).
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
  if (PAYMENT_TOKEN_ADDRESS) {
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
  CHAIN_RPC,
  BASE_RPC: CHAIN_RPC, // legacy alias
  CHAIN_ID,
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
