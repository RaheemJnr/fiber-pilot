# fiber-pilot ⚡

> Your Fiber Network node on autopilot — AI-managed channels, payments, liquidity, and routing fees.

fiber-pilot is an AI agent that gives Claude autonomous control over a [Fiber Network](https://github.com/nervosnetwork/fiber) node on CKB. It ships as both an **MCP server** (for Claude Code / Claude Desktop) and a **web chat interface** (browser-based). Built for the **CKB AI Agent Hackathon** (March 2026).

---

## What it does

Talk to your Fiber node in plain English:

- *"How's my node doing?"* → calls `fp_get_node_info`, `fp_list_peers`, summarizes status
- *"Analyze my channels"* → scores each channel by balance ratio and health
- *"Open a 500 CKB channel with bootnodehk"* → executes on-chain with safety checks
- *"Suggest fee optimizations"* → reads network graph, recommends fee rates
- *"Create an invoice for 100 CKB"* → generates a Fiber invoice instantly

All actions go through a **safety layer** (spend caps, approval thresholds, audit log) so the agent can never exceed your configured limits without human approval.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User (browser chat UI  OR  Claude Code / Claude Desktop)   │
└──────────────┬──────────────────────────┬───────────────────┘
               │ HTTP/SSE chat             │ MCP protocol
               ▼                           ▼
┌──────────────────────────┐   ┌───────────────────────────┐
│  Web Chat Server          │   │  MCP Server               │
│  Express + Claude API     │   │  stdio (local)            │
│  SSE streaming            │   │  HTTP /mcp (hosted)       │
│  Tool cards in browser    │   │  17 tools registered      │
└──────────────┬────────────┘   └──────────────┬────────────┘
               │                               │
               └───────────┬───────────────────┘
                           │ JSON-RPC over HTTP
               ┌───────────▼───────────────────┐
               │  Fiber Network Node (fnn)      │
               │  v0.7.1 · CKB Testnet          │
               │  Channels · Payments · Gossip  │
               └───────────────────────────────┘
```

---

## Quick Start

### 1. Prerequisites

- **Node.js 20+**
- **Fiber node** (`fnn` v0.7.1+) running on CKB testnet — [Fiber releases](https://github.com/nervosnetwork/fiber/releases)
- **CKB testnet coins** from the [Nervos Pudge Faucet](https://faucet.nervos.org/)
- **Anthropic API key** with credits — [console.anthropic.com](https://console.anthropic.com)

### 2. Clone & Build

```bash
git clone https://github.com/RaheemJnr/fiber-pilot
cd fiber-pilot
npm install
npm run build
```

### 3. Start your Fiber node

Always run from inside your fiber-node directory with `-d .` so Fiber uses the local key file:

```bash
cd ~/path/to/fiber-node
FIBER_SECRET_KEY_PASSWORD='your-password' ./fnn -d . -c config.yml
```

> **Key format:** Fiber needs a raw 32-byte hex private key (64 chars, single line).
> If you exported with `ckb-cli --extended-privkey-path`, it writes two lines — keep only the first:
> ```bash
> head -1 ckb/key > ckb/key.tmp && mv ckb/key.tmp ckb/key
> chmod 600 ckb/key
> ```

---

## Usage: Web Chat Interface

The web UI lets anyone connect their Fiber node and chat with the agent in a browser — no coding required.

### Setup

Create a `.env` file:

```env
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
PORT=3000
```

> **Important:** Use a proper API key from console.anthropic.com (starts with `sk-ant-api03-`).
> The token Claude Code uses (`sk-ant-oat01-...`) is an OAuth token and won't work here.

### Run

```bash
npm run server
```

Open **http://localhost:3000**, enter your Fiber node RPC URL (default `http://127.0.0.1:8227`), and click **Connect Node**.

The status bar shows your node's pubkey, channel count, and peer count in real time.

---

## Usage: MCP Server (Claude Code / Claude Desktop)

fiber-pilot is a fully spec-compliant MCP server. Claude Code spawns it and calls all 17 tools autonomously — using your **subscription** (no API billing needed).

### Option A — Hosted HTTP MCP (no install)

The hosted server exposes a `/mcp` HTTP endpoint. Users pass their Fiber node's **public** RPC URL as a query parameter.

Add to your `.mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "fiber-pilot": {
      "type": "http",
      "url": "https://your-hosted-server.com/mcp?rpc=http://YOUR-FIBER-NODE-IP:8227"
    }
  }
}
```

> **Note:** Your Fiber node's RPC port must be reachable from the hosted server (public IP or port-forwarded). Do not expose it without a firewall on mainnet.

### Option B — Local stdio MCP (fully private)

Clone the repo, build, and point Claude Code at your local binary. Your node never leaves your machine.

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "fiber-pilot": {
      "command": "node",
      "args": ["/absolute/path/to/fiber-pilot/dist/index.js"],
      "env": {
        "FIBER_RPC_URL": "http://127.0.0.1:8227",
        "FP_MAX_CHANNEL_OPEN": "10000",
        "FP_MAX_PAYMENT": "5000",
        "FP_DAILY_LIMIT": "50000",
        "FP_APPROVAL_THRESHOLD": "5000"
      }
    }
  }
}
```

Then open Claude Code in any project — fiber-pilot tools will be available automatically.

### Test locally with MCP Inspector

```bash
npm run inspect
```

---

## Self-Hosting (VPS Deployment)

To host fiber-pilot publicly so others can connect their nodes:

```bash
# On your server (Ubuntu/Debian)
git clone https://github.com/RaheemJnr/fiber-pilot
cd fiber-pilot
npm install && npm run build

# Create .env
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY
PORT=3000
EOF

# Install PM2 and start
npm install -g pm2
pm2 start --name fiber-pilot -- node --env-file=.env dist/server.js
pm2 save && pm2 startup

# Open port
sudo ufw allow 3000
```

Your hosted URL: `http://your-server-ip:3000`
Hosted MCP URL: `http://your-server-ip:3000/mcp?rpc=http://USER-FIBER-IP:8227`

---

## Tools Reference (17 tools)

### Channel Management
| Tool | Description |
|------|-------------|
| `fp_list_channels` | List all channels with balances, state, and peer info |
| `fp_open_channel` | Open a payment channel with a peer (safety-checked) |
| `fp_close_channel` | Cooperatively close a channel, settle on-chain |
| `fp_update_channel` | Update fee rate, min HTLC value, expiry delta |

### Payments
| Tool | Description |
|------|-------------|
| `fp_send_payment` | Send payment via invoice or direct pubkey |
| `fp_create_invoice` | Generate a Fiber invoice for receiving payment |
| `fp_get_payment` | Check payment status by hash |
| `fp_build_route` | Manually construct a payment route |

### Network
| Tool | Description |
|------|-------------|
| `fp_connect_peer` | Connect to a Fiber peer by multiaddr |
| `fp_list_peers` | Show all connected peers |
| `fp_get_node_info` | Node pubkey, version, channel/peer counts |
| `fp_get_network_graph` | Full gossip-discovered network topology |

### Analysis & Automation
| Tool | Description |
|------|-------------|
| `fp_analyze_channels` | Health scores, balance ratios, recommendations |
| `fp_suggest_rebalance` | Identify imbalanced channels, suggest amounts |
| `fp_suggest_fees` | Optimal fee rates based on network position |

### Safety & Audit
| Tool | Description |
|------|-------------|
| `fp_get_config` | View current safety limits |
| `fp_get_audit_log` | Full tamper-evident log of every agent action |

---

## Safety Layer

Every financial action passes through configurable guardrails:

| Variable | Default | Description |
|----------|---------|-------------|
| `FP_MAX_CHANNEL_OPEN` | 10,000 CKB | Max funding per channel open |
| `FP_MAX_PAYMENT` | 5,000 CKB | Max per-payment amount |
| `FP_DAILY_LIMIT` | 50,000 CKB | Total daily outflow cap |
| `FP_APPROVAL_THRESHOLD` | 5,000 CKB | Human approval required above this |
| `FP_ALLOWED_PEERS` | (any) | Comma-separated peer pubkey whitelist |
| `FP_AUTO_REBALANCE` | true | Allow autonomous rebalancing |
| `FP_MAX_REBALANCE` | 3,000 CKB | Max auto-rebalance per operation |

When a tool call exceeds a limit, it returns `approval_required` and the agent asks for human confirmation before proceeding.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `401 invalid x-api-key` | Using Claude Code OAuth token — create an API key at console.anthropic.com |
| `400 credit balance too low` | Add credits at console.anthropic.com → Billing |
| `503 No available accounts` | Proxy issue — check that your API key is valid and has quota |
| `Decryption failed: aead::Error` | Key file has two lines (extended format) — keep only the first line |
| `No such file or directory` for key | Missing `-d .` flag — Fiber defaults to `~/.fiber-node` |
| Node disconnected in UI | Fiber RPC not reachable — verify `fnn` is running and the URL is correct |
| `RocksDB LOCK error` | Stale lock from a crash — delete `fiber/store/LOCK` and restart |
| `Resource temporarily unavailable` | `fnn` is already running — `pkill -9 fnn` then restart |

---

## Development

```bash
npm run dev          # Run MCP server with tsx (no build)
npm run dev:server   # Run web server with tsx (no build)
npm run build        # Compile TypeScript → dist/
npm test             # Run unit tests (vitest)
npm run inspect      # MCP Inspector UI
```

---

## Tech Stack

- **TypeScript** (ESM, Node.js 20+)
- **`@modelcontextprotocol/sdk`** — MCP server (stdio + StreamableHTTP)
- **`@anthropic-ai/sdk`** — Claude API with streaming tool use
- **Express 5** — Web server + SSE streaming
- **Zod** — Schema validation
- **Vitest** — Unit tests
- **Fiber Network RPC** — JSON-RPC over HTTP to `fnn`
- **CKB Testnet**

---

## License

MIT
