# ChainMind

> Autonomous AI agents with on-chain accountability — built on Base Sepolia.

ChainMind lets users deploy autonomous AI agents that execute on-chain tasks (token swaps, wallet monitoring, price alerts) using Coinbase AgentKit wallets. Every action an agent takes is recorded as a permanent, verifiable attestation via the Ethereum Attestation Service (EAS), creating a tamper-proof audit trail directly on Base Sepolia.

---

## What Makes This Interesting

This project goes beyond a typical Web3 CRUD app. A few engineering decisions worth noting:

- **Autonomous agent execution** — agents run a LangGraph ReAct loop (LLM → tool call → observe → repeat) with a `recursionLimit: 5` circuit breaker to prevent runaway token spend or gas usage
- **Tool scoping by task type** — MONITOR agents cannot access swap/ERC-20 tools, preventing accidental fund movements even if the LLM hallucinates
- **AES-256-GCM wallet encryption** — CDP wallet key material is encrypted at rest in PostgreSQL before being written; the key is validated at startup (not runtime)
- **Idempotent job retries** — a `pendingJobId` checkpoint in the database means BullMQ retries skip the LLM/transaction steps and go straight to attestation, avoiding double-spend on failure
- **Per-user rate limiting** — keyed to Privy user ID (not IP), preventing shared-IP false positives on cloud deployments
- **Prompt injection mitigation** — the system modifier is hardcoded server-side; user description is passed as a separate `HumanMessage` so it cannot override core agent constraints

---

## Architecture

```
apps/
  web/         — Next.js 14 frontend (Privy auth, Wagmi, TanStack Query)
  agent/       — Express + BullMQ backend (AgentKit, LangGraph, EAS)
packages/
  contracts/   — Solidity contracts (AgentRegistry + ChainMindAttester)
```

### How it works

1. User connects wallet via Privy and creates an agent from the dashboard
2. The backend provisions a Coinbase CDP wallet for the agent on Base Sepolia
3. A BullMQ job runs an LLM-powered ReAct agent (LangGraph + GPT-4o-mini)
4. After execution, an EAS attestation is written on-chain recording the action, rationale, and tx hash
5. The agent detail page polls the EAS GraphQL API to display the attestation history

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24 (Hardhat, OpenZeppelin) |
| Blockchain | Base Sepolia (Ethereum L2) |
| Wallet Provisioning | Coinbase AgentKit (CDP EVM Wallet) |
| AI Agent | LangGraph ReAct + OpenAI GPT-4o-mini |
| Attestations | Ethereum Attestation Service (EAS) |
| Background Jobs | BullMQ + Redis |
| Auth | Privy (JWT verification server-side) |
| Database | PostgreSQL + Prisma |
| Frontend | Next.js 14 App Router, Wagmi, TanStack Query |
| API | Express.js + Zod validation |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |
| PostgreSQL | ≥ 15 |
| Redis | ≥ 7 |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/dannymairena01/chainmind
cd chainmind
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in all values. The table below lists every required variable and where to get it:

| Variable | Required | Where to get it |
|----------|----------|----------------|
| `NEXT_PUBLIC_FRONTEND_URL` | Yes | `http://localhost:3000` for local dev |
| `DATABASE_URL` | Yes | Your PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PRIVATE_KEY` | Yes | Your deployer wallet private key (never expose publicly) |
| `BASE_SEPOLIA_RPC_URL` | Yes | [Alchemy](https://alchemy.com) or `https://sepolia.base.org` |
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | Yes | Same as above |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | [Privy Dashboard](https://privy.io) → Settings → API Keys |
| `PRIVY_APP_SECRET` | Yes | [Privy Dashboard](https://privy.io) → Settings → API Keys |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | [WalletConnect Cloud](https://cloud.walletconnect.com) |
| `OPENAI_API_KEY` | Yes | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `CDP_API_KEY_ID` | Yes | [Coinbase CDP Portal](https://portal.cdp.coinbase.com) → API Keys |
| `CDP_API_KEY_SECRET` | Yes | [Coinbase CDP Portal](https://portal.cdp.coinbase.com) → API Keys |
| `REDIS_URL` | Yes | `redis://localhost:6379` for local dev |
| `SCHEMA_UID` | Yes | From [EAS Explorer](https://base-sepolia.easscan.org) after registering your schema |
| `CHAINMIND_ATTESTER_ADDRESS` | Optional | Populated after running the deploy script |
| `AGENT_REGISTRY_ADDRESS` | Optional | Populated after running the deploy script |
| `ALCHEMY_API_KEY` | Optional | [Alchemy Dashboard](https://dashboard.alchemy.com) |

> **Getting your CDP API Key:**
> 1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
> 2. Click **API Keys** → **New API Key**
> 3. Copy the **Key ID** → `CDP_API_KEY_ID`
> 4. Copy the **Key Secret** → `CDP_API_KEY_SECRET`
>
> ⚠️ Do not use the old v1 field names `CDP_API_KEY_NAME` / `CDP_API_KEY_PRIVATE_KEY` — AgentKit v2 uses the names above.

### 3. Set up the database

```bash
cd apps/agent
npx prisma migrate deploy
cd ../..
```

### 4. Deploy contracts to Base Sepolia

Make sure `PRIVATE_KEY` and `BASE_SEPOLIA_RPC_URL` are set in `.env`, then:

```bash
cd packages/contracts
npx hardhat compile
npx hardhat run scripts/deploy.ts --network baseSepolia
```

Copy the printed `AGENT_REGISTRY_ADDRESS` and `CHAINMIND_ATTESTER_ADDRESS` values into your `.env`.

> **Stub mode:** If you leave `CHAINMIND_ATTESTER_ADDRESS` blank, the agent runtime skips on-chain attestations and logs a stub UID instead. Everything else (wallet provisioning, job execution, dashboard) still works.

---

## Running Locally

```bash
# Terminal 1 — Redis
redis-server

# Terminal 2 — PostgreSQL (if not running as a service)
pg_ctl start

# Terminal 3 — Full monorepo dev server
pnpm dev
```

- **Frontend:** http://localhost:3000
- **Agent API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

---

## Running Tests

```bash
cd apps/agent
pnpm test
```

The test suite covers all API routes (auth, ownership, validation, job queuing) using Vitest + Supertest with mocked Prisma and BullMQ.

---

## Project Structure

```
chainmind/
├── apps/
│   ├── web/                        # Next.js 14 App Router frontend
│   │   ├── app/
│   │   │   ├── page.tsx            # Landing page
│   │   │   ├── dashboard/          # Agent list with polling
│   │   │   └── agents/
│   │   │       ├── new/            # Create agent form (client-side Zod)
│   │   │       └── [id]/           # Agent detail + EAS attestation history
│   │   └── lib/
│   │       ├── wagmi.ts            # Wagmi config
│   │       └── providers.tsx       # App-wide providers
│   └── agent/                      # Express API + BullMQ worker
│       ├── src/
│       │   ├── index.ts            # Server entry (CORS, helmet, rate limit, graceful shutdown)
│       │   ├── lib/
│       │   │   ├── eas.ts          # EAS write + GraphQL fetch attestations
│       │   │   ├── encryption.ts   # AES-256-GCM wallet data encryption
│       │   │   ├── prisma.ts       # Prisma client singleton
│       │   │   ├── alchemy.ts      # Alchemy RPC helpers
│       │   │   └── validateEnv.ts  # Boot-time env var validation
│       │   ├── middleware/
│       │   │   └── auth.ts         # Privy JWT verification
│       │   ├── queue/
│       │   │   └── worker.ts       # BullMQ worker + LangGraph agent execution
│       │   ├── routes/
│       │   │   ├── agents.ts       # REST API routes (Zod validated)
│       │   │   └── health.ts       # /health — DB + Redis liveness check
│       │   └── scripts/
│       │       └── register-schema.ts  # One-time EAS schema registration
│       └── prisma/
│           ├── schema.prisma       # Agent model definition
│           └── migrations/         # SQL migration history
└── packages/
    └── contracts/
        ├── contracts/
        │   ├── AgentRegistry.sol       # Maps owner addresses → agent wallets
        │   └── ChainMindAttester.sol   # EAS attestation gateway (onlyRegistered)
        └── scripts/
            └── deploy.ts               # Hardhat deploy script
```

---

## Known Limitations

- **On-chain attestations are currently stubbed** — `ChainMindAttester.attest()` requires the agent wallet to be registered in `AgentRegistry`, which in turn requires the user's EVM wallet address. Privy stores this in `linkedAccounts` but it isn't yet persisted to the database at agent creation time. Until this is wired up, leave `CHAINMIND_ATTESTER_ADDRESS` unset to run in stub mode.

- **Activity log will be empty in stub mode** — since no real attestations are written, the EAS GraphQL query returns nothing. Running a job still provisions the wallet and executes the LLM agent; only the on-chain record is missing.

---

## Learn More

- [EAS Docs](https://docs.attest.org) — how schemas and attestations work
- [AgentKit Docs](https://docs.cdp.coinbase.com/agentkit/docs/welcome) — CDP wallet lifecycle
- [LangGraph Docs](https://langchain-ai.github.io/langgraphjs/) — ReAct agent implementation
- [BullMQ Docs](https://docs.bullmq.io) — job queues and worker retries
- [Privy Docs](https://docs.privy.io) — embedded wallet auth
- [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia) — get test ETH
- [EAS Explorer (Base Sepolia)](https://base-sepolia.easscan.org) — view attestations
