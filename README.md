# ChainMind

> Autonomous AI agents with on-chain accountability — built on Base Sepolia.

ChainMind lets users deploy autonomous AI agents that execute on-chain tasks (token swaps, wallet monitoring, price alerts) using Coinbase AgentKit wallets. Every action an agent takes is recorded as an on-chain attestation via the Ethereum Attestation Service (EAS), creating a permanent, verifiable audit trail.

---

## Architecture

```
apps/
  web/         — Next.js 14 frontend (Privy auth, Wagmi, React Query)
  agent/       — Express + BullMQ backend (AgentKit, LangChain, EAS)
packages/
  contracts/   — Solidity contracts (AgentRegistry + ChainMindAttester)
```

### How it works

1. User connects wallet (Privy) and creates an agent via the dashboard
2. The backend provisions a Coinbase CDP wallet for the agent (Base Sepolia)
3. A BullMQ job runs an LLM-powered ReAct agent (LangChain + GPT-4o-mini)
4. After execution, an EAS attestation is written on-chain recording the action
5. The agent detail page fetches all attestations from the EAS GraphQL API

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

Copy the example and fill in your values:

```bash
cp .env.example .env
```

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | [Alchemy](https://alchemy.com) |
| `ALCHEMY_API_KEY` | [Alchemy](https://alchemy.com) |
| `PRIVATE_KEY` | Your deployer wallet private key |
| `BASE_SEPOLIA_RPC_URL` | [Alchemy](https://alchemy.com) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | [Privy Dashboard](https://privy.io) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com) |
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com) |
| `CDP_API_KEY_NAME` | [Coinbase CDP Portal](https://portal.cdp.coinbase.com) → API Keys → Download JSON |
| `CDP_API_KEY_PRIVATE_KEY` | From the downloaded `cdp_api_key.json` (the `privateKey` field) |
| `EAS_CONTRACT_ADDRESS` | `0x4200000000000000000000000000000000000021` (canonical Base Sepolia) |
| `SCHEMA_UID` | From [EAS Explorer](https://base-sepolia.easscan.org) after registering your schema |
| `REDIS_URL` | `redis://localhost:6379` (local) |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/chainmind` |

> **Getting your CDP API Key:**  
> 1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)  
> 2. Click **API Keys** → **New API Key**  
> 3. **Download the JSON file** — this is a one-time download!  
> 4. Copy `name` → `CDP_API_KEY_NAME` and `privateKey` → `CDP_API_KEY_PRIVATE_KEY`  
> 5. The private key value already has `\n` in it — keep it on one line in `.env`

### 3. Set up the database

```bash
cd apps/agent
npx prisma migrate dev --name init
cd ../..
```

### 4. Deploy contracts to Base Sepolia

Make sure `PRIVATE_KEY` and `BASE_SEPOLIA_RPC_URL` are set in `.env`, then:

```bash
cd packages/contracts
npx hardhat compile
npx hardhat run scripts/deploy.ts --network baseSepolia
```

Copy the output `AGENT_REGISTRY_ADDRESS` and `CHAINMIND_ATTESTER_ADDRESS` into your `.env`.

---

## Running Locally

Start all services:

```bash
# Terminal 1 — Redis
redis-server

# Terminal 2 — PostgreSQL (if not running)
pg_ctl start

# Terminal 3 — Full monorepo dev server
pnpm dev
```

- **Frontend:** http://localhost:3000  
- **Agent API:** http://localhost:3001

---

## Key Technologies

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity (Hardhat, OpenZeppelin) |
| Blockchain | Base Sepolia (Ethereum L2) |
| Wallet Provisioning | [Coinbase AgentKit](https://docs.cdp.coinbase.com/agentkit) |
| LLM | OpenAI GPT-4o-mini via LangChain |
| Attestations | [Ethereum Attestation Service (EAS)](https://attest.org) |
| Background Jobs | BullMQ + Redis |
| Auth | [Privy](https://privy.io) |
| Database | PostgreSQL + Prisma |
| Frontend | Next.js 14, Wagmi, React Query |

---

## Project Structure

```
chainmind/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── page.tsx        # Landing page
│   │   │   ├── dashboard/      # Agent list
│   │   │   └── agents/
│   │   │       ├── new/        # Create agent form (Zod validated)
│   │   │       └── [id]/       # Agent detail + attestation history
│   │   └── lib/
│   │       ├── wagmi.ts        # Wagmi config
│   │       └── providers.tsx   # App-wide providers
│   └── agent/                  # Express API + BullMQ worker
│       ├── src/
│       │   ├── index.ts        # Server entry point
│       │   ├── lib/
│       │   │   ├── agentkit.ts # CDP wallet provisioning
│       │   │   ├── eas.ts      # EAS write + fetch attestations
│       │   │   ├── llm.ts      # OpenAI / Vercel AI SDK
│       │   │   └── prisma.ts   # Prisma client singleton
│       │   ├── middleware/
│       │   │   └── auth.ts     # Privy JWT verification
│       │   ├── queue/
│       │   │   └── worker.ts   # BullMQ worker + agent execution
│       │   └── routes/
│       │       └── agents.ts   # REST API routes (Zod validated)
│       └── prisma/
│           └── schema.prisma   # Agent model definition
└── packages/
    └── contracts/
        ├── contracts/
        │   ├── AgentRegistry.sol       # Maps owners → agent wallets
        │   └── ChainMindAttester.sol   # EAS attestation gateway
        └── scripts/
            └── deploy.ts       # Hardhat deploy script
```

---

## Learn More

- [EAS Docs](https://docs.attest.org) — how schemas and attestations work
- [AgentKit Docs](https://docs.cdp.coinbase.com/agentkit/docs/welcome) — CDP wallet lifecycle
- [BullMQ Docs](https://docs.bullmq.io) — job queues and worker retries
- [Wagmi Docs](https://wagmi.sh) — reading/writing to contracts from React
- [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia) — get test ETH
- [EAS Explorer (Base Sepolia)](https://base-sepolia.easscan.org) — view attestations
