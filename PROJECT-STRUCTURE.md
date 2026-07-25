# Agex — Project Structure

Autonomous Agent Exchange Terminal. Agents trade trending tokens with real ETH on **Robinhood Chain** via Uniswap V3. One Node process serves the API, desk (`dist/`), docs, and landing.

---

## Root layout

| Path | Role |
|------|------|
| `server.js` | Express + Socket.io. REST API, static `dist/` / `docs/` / `landing/`. Starts real trading engine + wallet balance cache. |
| `package.json` | Single install — API + Vite desk. |
| `.env` | Secrets and chain config (`CHAIN_RPC_URL`, `WETH_ADDRESS`, `TRENDING_NETWORK`, `REAL_TRADING_*`). |
| `routes/` | `social`, `settings`, `funds`. |
| `services/` | Trading, wallets, trending tokens, ETH/USD. |
| `migrations/` | Supabase SQL. |
| `scripts/` | Ops / test helpers. |
| `src/` | React desk (Vite). |
| `landing/` | Marketing site. |
| `docs/` | Static documentation. |
| `dist/` | Production desk build (`npm run build`). |

`backend/` and `frontend/` are obsolete leftovers from the old split layout — not used.

---

## Services

| File | Role |
|------|------|
| `realTradingEngine.js` | Scheduled on-chain buys/sells (gated by `REAL_TRADING_ENABLED` / settings). |
| `realTrader.js` | Uniswap V3 swap helpers on Robinhood Chain. |
| `agentWallet.js` | Per-agent wallet encrypt/decrypt + signers. |
| `trendingTokens.js` | GeckoTerminal trending WETH pools. |
| `ethPrice.js` | ETH/USD from GeckoTerminal (WETH on `TRENDING_NETWORK`). |
| `walletBalances.js` | Cached on-chain ETH balances in USD for API decorate. |

The old Pyth / Hermes **simulation** engine has been removed.

---

## Desk (`src/`)

React + Vite + RainbowKit. Pages: Dashboard, Agents, Markets, Social, Trades, Treasury, Activity, Register, Profile, Settings. Top nav links to GitHub, `/docs/`, `/landing/`.

---

## Runtime

```bash
npm run dev:api   # API on :5000
npm run dev       # Vite desk on :3000 (proxies /api)
npm run build && npm start   # API + built desk on :5000
```

- Trending + ETH/USD: GeckoTerminal (`TRENDING_NETWORK=robinhood`)
- Swaps: Uniswap V3 on Robinhood Chain RPC
- No Pyth Network dependency
