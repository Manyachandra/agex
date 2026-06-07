// Real trader
//
// Executes REAL on-chain swaps for an agent using its own wallet, via Uniswap
// V3 on Base. Buy = ETH -> token, Sell = token -> ETH. Uses QuoterV2 for a
// price quote and applies slippage. Every swap spends real money, so all of
// this is gated by REAL_TRADING_ENABLED and per-trade caps in the scheduler.

const { ethers } = require('ethers')
const { getProvider } = require('./agentWallet')

// ── Base mainnet Uniswap V3 addresses ────────────────────────────────────────
const WETH = '0x4200000000000000000000000000000000000006'
const SWAP_ROUTER_02 = '0x2626664c2603336E57B271c5C0b26F421741e481'
const QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'

const FEE_TIERS = [500, 3000, 10000]

const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
]
const WETH_ABI = [
  ...ERC20_ABI,
  'function withdraw(uint256 amount)',
]

const SLIPPAGE = parseFloat(process.env.REAL_TRADE_SLIPPAGE || '0.08') // 8% default (memecoins are volatile)

// The public Base RPC (mainnet.base.org) intermittently rejects eth_call with
// "missing revert data" / CALL_EXCEPTION / network errors under load. These are
// transient, not real reverts, so retry read-only calls a few times with a
// short backoff before giving up. A genuine pool-not-found revert also lands
// here, but retrying a few times is cheap and avoids aborting a whole trade on
// a flaky read.
function isTransientRpcError(e) {
  const code = e && e.code
  const msg = String((e && (e.shortMessage || e.message)) || '')
  return (
    code === 'CALL_EXCEPTION' ||
    code === 'NETWORK_ERROR' ||
    code === 'TIMEOUT' ||
    code === 'SERVER_ERROR' ||
    code === 'UNKNOWN_ERROR' ||
    /missing revert data|could not coalesce|timeout|429|rate ?limit|bad response|failed to detect network/i.test(msg)
  )
}

async function withRetry(fn, { tries = 3, delayMs = 350, label = 'rpc' } = {}) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isTransientRpcError(e) || i === tries - 1) throw e
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}

// Find the fee tier with the best quote for a given swap direction.
async function bestQuote(tokenIn, tokenOut, amountIn) {
  const provider = getProvider()
  const quoter = new ethers.Contract(QUOTER_V2, QUOTER_ABI, provider)
  let best = null
  for (const fee of FEE_TIERS) {
    try {
      // A revert here usually means "no pool at this fee tier", but the public
      // RPC also throws the same shape on transient failures. One quick retry
      // recovers a real pool that was hidden by a flaky read.
      const res = await withRetry(
        () => quoter.quoteExactInputSingle.staticCall({ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0 }),
        { tries: 2, delayMs: 250, label: `quote-${fee}` },
      )
      const amountOut = res[0] ?? res.amountOut
      if (amountOut && amountOut > 0n && (!best || amountOut > best.amountOut)) {
        best = { fee, amountOut }
      }
    } catch (e) { /* no pool at this fee tier (or persistently flaky) */ }
  }
  return best
}

function applySlippage(amountOut, slippage) {
  // amountOut is a BigInt; reduce by slippage using basis points.
  const s = Number.isFinite(slippage) ? slippage : SLIPPAGE
  const clamped = Math.max(0, Math.min(0.99, s))
  const bps = BigInt(Math.round((1 - clamped) * 10000))
  return (amountOut * bps) / 10000n
}

async function getTokenMeta(tokenAddress) {
  const provider = getProvider()
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
  const [decimals, symbol] = await Promise.all([
    withRetry(() => token.decimals(), { tries: 2, label: 'decimals' }).catch(() => 18),
    withRetry(() => token.symbol(), { tries: 2, label: 'symbol' }).catch(() => '???'),
  ])
  return { decimals: Number(decimals), symbol }
}

// BUY: swap `ethAmount` (in ETH, human string/number) of the agent's ETH into token.
async function buyToken(signer, tokenAddress, ethAmount, slippage) {
  const amountIn = ethers.parseEther(String(ethAmount))
  const quote = await bestQuote(WETH, tokenAddress, amountIn)
  if (!quote) throw new Error('No Uniswap V3 WETH pool found for token')

  const minOut = applySlippage(quote.amountOut, slippage)
  const router = new ethers.Contract(SWAP_ROUTER_02, ROUTER_ABI, signer)
  const recipient = await signer.getAddress()
  const meta = await getTokenMeta(tokenAddress)

  // Snapshot balance before so we can record the ACTUAL amount received,
  // not the quote (which is slightly higher than the post-slippage amount).
  const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, getProvider())
  let balBefore = 0n
  try { balBefore = await erc20.balanceOf(recipient) } catch { balBefore = 0n }

  const tx = await router.exactInputSingle({
    tokenIn: WETH,
    tokenOut: tokenAddress,
    fee: quote.fee,
    recipient,
    amountIn,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0,
  }, { value: amountIn })

  const receipt = await tx.wait()

  // Actual received = balance delta. Fall back to the quote if the read fails.
  let received = quote.amountOut
  try {
    const balAfter = await erc20.balanceOf(recipient)
    const delta = balAfter - balBefore
    if (delta > 0n) received = delta
  } catch { /* keep quote-based estimate */ }

  const tokenAmount = parseFloat(ethers.formatUnits(received, meta.decimals))
  return {
    txHash: receipt.hash,
    fee: quote.fee,
    ethSpent: parseFloat(ethAmount),
    tokenAmount,
    symbol: meta.symbol,
    decimals: meta.decimals,
  }
}

// SELL: swap an agent's full/partial token balance back into ETH.
// tokenAmount is human-readable; if omitted, sells the entire balance.
async function sellToken(signer, tokenAddress, tokenAmount, slippage) {
  const provider = getProvider()
  const address = await signer.getAddress()
  const meta = await getTokenMeta(tokenAddress)
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer)

  // Retry the balance read — a single transient public-RPC failure here should
  // not abort the whole sell. A zero balance is a real (stale-holding) state.
  const balance = await withRetry(() => token.balanceOf(address), { tries: 3, label: 'balanceOf' })
  if (balance <= 0n) {
    const err = new Error('Insufficient token balance to sell')
    err.code = 'ZERO_BALANCE'
    throw err
  }
  // Clamp the requested amount to the actual on-chain balance. Stored holdings
  // can drift slightly above the real balance because buys record the quoted
  // amount, while the wallet receives the (slightly lower) post-slippage amount.
  let amountIn = (tokenAmount == null)
    ? balance
    : ethers.parseUnits(String(tokenAmount), meta.decimals)
  if (amountIn > balance) amountIn = balance
  if (amountIn <= 0n) {
    throw new Error('Insufficient token balance to sell')
  }

  // Ensure router allowance.
  const allowance = await token.allowance(address, SWAP_ROUTER_02)
  if (allowance < amountIn) {
    const atx = await token.approve(SWAP_ROUTER_02, ethers.MaxUint256)
    await atx.wait()
  }

  const quote = await bestQuote(tokenAddress, WETH, amountIn)
  if (!quote) throw new Error('No Uniswap V3 WETH pool found for token')
  const minOut = applySlippage(quote.amountOut, slippage)

  const router = new ethers.Contract(SWAP_ROUTER_02, ROUTER_ABI, signer)
  const tx = await router.exactInputSingle({
    tokenIn: tokenAddress,
    tokenOut: WETH,
    fee: quote.fee,
    recipient: address,
    amountIn,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0,
  })
  const receipt = await tx.wait()

  // Unwrap received WETH back to native ETH.
  let unwrapTxHash = null
  try {
    const weth = new ethers.Contract(WETH, WETH_ABI, signer)
    const wethBal = await weth.balanceOf(address)
    if (wethBal > 0n) {
      const wtx = await weth.withdraw(wethBal)
      const wr = await wtx.wait()
      unwrapTxHash = wr.hash
    }
  } catch (e) {
    console.error('WETH unwrap failed (proceeds remain as WETH):', e.message)
  }

  return {
    txHash: receipt.hash,
    unwrapTxHash,
    fee: quote.fee,
    tokenSold: parseFloat(ethers.formatUnits(amountIn, meta.decimals)),
    soldAll: amountIn >= balance,
    ethReceived: parseFloat(ethers.formatEther(quote.amountOut)),
    symbol: meta.symbol,
    decimals: meta.decimals,
  }
}

async function getEthBalance(address) {
  const provider = getProvider()
  const wei = await withRetry(() => provider.getBalance(address), { tries: 3, label: 'getBalance' })
  return parseFloat(ethers.formatEther(wei))
}

// Quote the current ETH value of selling `tokenAmount` of a token (no tx sent).
// Used to compare a holding's live market value against its cost basis so the
// engine can sell the most profitable position. Returns 0 if no pool/quote.
async function quoteSellEth(tokenAddress, tokenAmount) {
  if (tokenAmount == null || !(parseFloat(tokenAmount) > 0)) return 0
  const meta = await getTokenMeta(tokenAddress)
  // Clamp decimal places to the token's decimals so parseUnits never throws.
  const fixed = Number(tokenAmount).toFixed(Math.min(meta.decimals, 18))
  let amountIn
  try { amountIn = ethers.parseUnits(fixed, meta.decimals) } catch { return 0 }
  if (amountIn <= 0n) return 0
  const quote = await bestQuote(tokenAddress, WETH, amountIn)
  if (!quote) return 0
  return parseFloat(ethers.formatEther(quote.amountOut))
}

// Send a native ETH fee from the agent's wallet to the house wallet. Returns
// the tx hash, or null if the amount rounds to zero / the wallet can't cover it.
async function sendEthFee(signer, toAddress, ethFee) {
  if (!toAddress || !ethers.isAddress(toAddress)) return null
  const value = ethers.parseEther(Number(ethFee).toFixed(18))
  if (value <= 0n) return null

  // Make sure the wallet can cover the fee plus its gas, otherwise skip.
  const provider = getProvider()
  const from = await signer.getAddress()
  const balance = await provider.getBalance(from)
  const gasReserve = ethers.parseEther('0.00005') // rough native-transfer gas headroom
  if (balance < value + gasReserve) return null

  const tx = await signer.sendTransaction({ to: toAddress, value })
  const receipt = await tx.wait()
  return receipt.hash
}

module.exports = {
  WETH,
  SWAP_ROUTER_02,
  QUOTER_V2,
  buyToken,
  sellToken,
  bestQuote,
  getTokenMeta,
  getEthBalance,
  quoteSellEth,
  sendEthFee,
  withRetry,
  isTransientRpcError,
  SLIPPAGE,
}
