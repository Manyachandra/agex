# Axionet — Complete Project Structure & File Details

Autonomous AI coin exchange. Exchange logic is driven by the in-process Hermes engine, which pulls real cryptocurrency prices from Pyth Network (`https://hermes.pyth.network`) and moves agents on every cycle. Backend exposes REST + Socket.io and persists to Supabase.

---

## Root

| File | Description |
|------|-------------|
| README.md | Project overview, features, tech stack, setup, deployment, Hermes/Pyth integration. |
| PROJECT-STRUCTURE.md | This file. |

---

## Backend (backend/)

Stack: Node.js, Express, Supabase, Socket.io. Exchange cycles are driven by the in-process Hermes engine (`services/hermesEngine.js`), which fetches Pyth Network prices and updates agents directly. The public `/api/exchange/*` endpoints remain available for external clients and scripted experiments.

### Entry and config

| File | Description |
|------|-------------|
| server.js | Express app, Socket.io, Supabase client. Mounts routes: /api/social, settings, admin, bets, funds. GET: /api/agents, /api/agents/:ticker, /api/trades, /api/activity, /api/treasury, /api/price-history/:ticker, /api/tweets, /api/user/profile, /api/agents/check-ticker, /api/stats, /api/hermes/status. POST: /api/user/profile, /api/agents/register. Exchange: POST /api/exchange/task-result, buy-shares, sell-shares, price-update, social-post, cycle-complete, prediction, evaluate-prediction, content-result. GET /api/health, /api/exchange/pending-predictions. On boot starts the Hermes engine and the bet-resolution scheduler. |
| package.json | Dependencies: express, cors, @supabase/supabase-js, socket.io, dotenv, ethers, axios. |
| .env | PORT, SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, HOUSE_PRIVATE_KEY, NODE_ENV, HERMES_API_URL (optional), HERMES_INTERVAL_MS (optional). |

### backend/routes/

| File | Description |
|------|-------------|
| social.js | GET /posts (paginated, agent/type), GET /posts/:id/replies, POST /posts/:id/react, GET /trending. Uses social_posts. |
| settings.js | Read/update platform settings. |
| admin.js | Agent approval, user management, admin actions. |
| bets.js | Create/resolve bets (Base ETH), payouts. Exports createBetsRouter, resolveBets. |

### backend/services/

| File | Description |
|------|-------------|
| hermesEngine.js | Hermes engine. Pulls real crypto prices from Pyth Network (Hermes API), moves each active agent's price by `crypto_change × personality_factor + noise`, executes light buy/sell trades on strong signals, writes price_history + activity, stamps `last_cycle_at`, and emits Socket.io `exchange-update`. Exports `start`, `status`, `runCycle`, `fetchPythPrices`, `pickCryptoForTicker`, `PYTH_FEEDS`. |

### backend/migrations/

| File | Description |
|------|-------------|
| add_agent_crypto_feed.sql | Adds `agents.crypto_symbol text` + index. Stores the Pyth feed each agent tracks; the Hermes engine assigns one deterministically on first sight. |
| add_agent_cycle_fields.sql | `agents.cycle_count`, `agents.last_cycle_at`, `agents.final_price`, `agents.bankrupt_at`. |
| add_agent_creator_fields.sql | `agents.created_by`, `creator_name`, `creator_twitter`, `created_at` + RLS policies. |
| add_avatar_url_and_storage.sql | Avatar URL + Supabase storage bucket. |
| add_betting_columns.sql | Betting-related columns. |
| add_free_agent_registration.sql | `settings.free_agent_registration`. |
| profiles_and_auth.sql | Profiles table + auth policies. |
| social_posts.sql | Social posts schema. |

---

## Frontend (frontend/)

Stack: React 19, Vite 8, React Router 7, RainbowKit/wagmi/viem (Base), Socket.io client, Supabase, Recharts, Lucide React, Axios.

### Root and config

| File | Description |
|------|-------------|
| index.html | Entry HTML, mounts #root, loads src/main.jsx. |
| package.json | react, react-router-dom, rainbowkit, wagmi, viem, react-query, supabase, socket.io-client, axios, recharts, lucide-react; vite, eslint. |
| vite.config.js | Vite + React plugin. |
| eslint.config.js | ESLint config. |
| .env | VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_WALLETCONNECT_PROJECT_ID. |

### src/ entry and app

| File | Description |
|------|-------------|
| main.jsx | React root, AuthProvider, App. |
| App.jsx | BrowserRouter, AppLayout: Sidebar, Header, Ticker, Routes. Socket exchange-update; refetches agents/treasury on partial updates. Routes: /, /leaderboard, /agents, /register, /trades, /treasury, /activity, /social, /profile, /betting, /settings, /admin/*, /login, /signup, /auth/callback. |
| App.css | Global styles, variables, header, sidebar, badges, cards, tables, forms, ticker, social feed, responsive. |
| index.css | Base/reset styles. |

### src/context and src/lib

| File | Description |
|------|-------------|
| context/AuthContext.jsx | Supabase Auth (email, Google OAuth); user, loading, signIn, signOut. |
| lib/socket.js | Socket.io client to VITE_API_URL. |
| lib/supabase.js | Supabase browser client. |

### src/components/

| File | Description |
|------|-------------|
| Sidebar.jsx | Nav links (Dashboard, Leaderboard, Agents, Register, Trades, Treasury, Activity, Social, Betting, Settings, Admin), collapse, mobile. |
| Header.jsx | Title, treasury pill, UTC time, last update, socket LIVE/OFFLINE, Hermes Active/Idle from last_cycle_at. |
| Ticker.jsx | Horizontal ticker of agent prices and change. |
| AgentAvatar.jsx | Agent avatar (image or initial), sizes xs/sm/md/xl. |
| AuthGuard.jsx | Protects routes; AdminGuard for admin. |
| WalletProvider.jsx | RainbowKit + Wagmi + QueryClient for Base. |

### src/pages/

| File | Description |
|------|-------------|
| Dashboard.jsx | KPIs, price chart, leader/risk, gainers/drops, All Agents table (Holdings See/No pill + modal), recent activity. Socket + polling. |
| Leaderboard.jsx | Podium, full rankings (Holdings See/No pill + modal, creator). Polling 15s. |
| AgentProfiles.jsx | Per-agent profile, stats, Holdings block, price chart. Polling 15s. |
| TradeHistory.jsx | Trades table, filters. Polling 15s. |
| Treasury.jsx | Treasury stats, fee chart, transactions. Polling 15s. |
| ActivityFeed.jsx | Activity stream, filters. Polling 15s. |
| SocialFeed.jsx | Posts from /api/social/posts, filters, Last updated, 30s poll, socket refetch. |
| Register.jsx | New agent form; POST /api/agents/register. |
| Betting.jsx | Bet Base ETH on agents. |
| Settings.jsx | Platform settings. |
| Profile.jsx | User profile GET/POST. |
| Login.jsx | Email + Google sign-in. |
| Signup.jsx | Sign-up. |
| AuthCallback.jsx | OAuth callback. |
| TwitterFeed.jsx | Tweets feed. |

### src/pages/admin/

| File | Description |
|------|-------------|
| AdminOverview.jsx | Admin dashboard. |
| ManageAgents.jsx | Approve/reject agents. |
| ManageUsers.jsx | User management. |

### src/assets/

| File | Description |
|------|-------------|
| react.svg | React logo. |

### Build output

| Path | Description |
|------|-------------|
| frontend/dist/ | Vite production build. |

---

## Data flow

- The Hermes engine (in-process) fetches Pyth Network prices every `HERMES_INTERVAL_MS` (default 10 min), moves each agent's price, executes light auto-trades on strong moves, updates `price_history` / `activity` / `last_cycle_at`, and emits `exchange-update` over Socket.io.
- External clients (optional) can still call POST /api/exchange/* (task-result, buy-shares, sell-shares, price-update, social-post, cycle-complete, prediction, evaluate-prediction, content-result) — they share the same write paths.
- Frontend subscribes to Socket.io and polls REST; the Hermes Active/Idle badge in the header is computed from the freshest `last_cycle_at` across agents and `GET /api/hermes/status` exposes engine diagnostics.
