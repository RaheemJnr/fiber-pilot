# fiber-pilot

> Your Fiber node on autopilot — AI-managed liquidity, routing, and channel optimization.

An MCP (Model Context Protocol) server that gives Claude autonomous control over a [Fiber Network](https://github.com/nervosnetwork/fiber) node on CKB. It manages liquidity, rebalances channels, optimizes routing fees, and provides natural language control over your Fiber node.

Built for the **Claw & Order: CKB AI Agent Hackathon** (March 2026).

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Claude (AI Agent via Claude Code)    │
│                                                  │
│  Analyzes node state → decides actions →         │
│  executes via MCP tools                          │
└────────────────────┬─────────────────────────────┘
                     │ MCP Protocol (stdio)
┌────────────────────▼─────────────────────────────┐
│           fiber-pilot MCP Server (TypeScript)     │
│                                                  │
│  Channel Tools ── Payment Tools ── Network Tools │
│  Analysis Tools ── Safety Layer ── Audit Trail   │
└────────────────────┬─────────────────────────────┘
                     │ JSON-RPC over HTTP
┌────────────────────▼─────────────────────────────┐
│         Fiber Network Node (FNN v0.6.1)          │
│         Running on CKB Testnet                   │
└──────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- A running Fiber testnet node (see [Fiber docs](https://github.com/nervosnetwork/fiber))
- CKB testnet coins from the [Nervos Pudge Faucet](https://faucet.nervos.org/)

### Install & Build

```bash
git clone <repo-url>
cd fiber-pilot
npm install
npm run build
```

### Configure

Edit `.mcp.json` to set your Fiber node URL and safety limits:

```json
{
  "mcpServers": {
    "fiber-pilot": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "FIBER_RPC_URL": "http://127.0.0.1:8227",
        "FP_MAX_CHANNEL_OPEN": "10000",
        "FP_MAX_PAYMENT": "5000",
        "FP_DAILY_LIMIT": "50000",
        "FP_APPROVAL_THRESHOLD": "5000",
        "FP_AUTO_REBALANCE": "true",
        "FP_MAX_REBALANCE": "3000"
      }
    }
  }
}
```

### Run with Claude Code

```bash
# Start Claude Code in the project directory — it will auto-detect .mcp.json
claude
```

### Test with MCP Inspector

```bash
npm run inspect
```

## Tools Reference (17 tools)

### Channel Management
| Tool | Description |
|------|-------------|
| `fp_list_channels` | List all channels with balances, status, and peer info |
| `fp_open_channel` | Open a payment channel with a peer (with safety checks) |
| `fp_close_channel` | Cooperatively or force-close a channel |
| `fp_update_channel` | Update channel settings (fees, enabled, min HTLC) |

### Payment & Routing
| Tool | Description |
|------|-------------|
| `fp_send_payment` | Send payment via invoice or to a node (auto-routing) |
| `fp_create_invoice` | Create an invoice for receiving payment |
| `fp_get_payment` | Check payment status by hash |
| `fp_build_route` | Manually construct a payment route |

### Network Intelligence
| Tool | Description |
|------|-------------|
| `fp_connect_peer` | Connect to a Fiber network peer |
| `fp_list_peers` | Show connected peers |
| `fp_get_node_info` | Get node status and configuration |
| `fp_get_network_graph` | Get full network topology (nodes + channels) |

### Smart Analysis
| Tool | Description |
|------|-------------|
| `fp_analyze_channels` | Analyze channel health, balance ratios, recommendations |
| `fp_suggest_rebalance` | Suggest circular payments to rebalance channels |
| `fp_suggest_fees` | Suggest optimal routing fees based on network data |

### Safety & Audit
| Tool | Description |
|------|-------------|
| `fp_get_config` | View current safety limits |
| `fp_get_audit_log` | View history of all agent actions |

## Safety Layer

The agent operates within configurable safety guardrails:

| Setting | Default | Description |
|---------|---------|-------------|
| `FP_MAX_CHANNEL_OPEN` | 10,000 | Max CKB for opening a channel |
| `FP_MAX_PAYMENT` | 5,000 | Max per-payment amount |
| `FP_DAILY_LIMIT` | 50,000 | Total daily outflow cap |
| `FP_APPROVAL_THRESHOLD` | 5,000 | Human approval required above this |
| `FP_ALLOWED_PEERS` | (empty) | Comma-separated peer whitelist |
| `FP_AUTO_REBALANCE` | true | Allow auto-rebalancing |
| `FP_MAX_REBALANCE` | 3,000 | Max auto-rebalance amount |

When an action exceeds a limit, the tool returns an `approval_required` status and the AI agent asks the human for confirmation.

## Demo Walkthrough

**1. Check node status:**
> "How's my Fiber node doing?"

**2. Analyze channels:**
> "Analyze my channels and suggest improvements."

**3. Rebalance:**
> "Rebalance Channel A."

**4. Optimize fees:**
> "Optimize my routing fees."

**5. Safety checkpoint:**
> "Open a 20,000 CKB channel." → Agent requests human approval.

## Development

```bash
npm run dev        # Run with tsx (no build needed)
npm run build      # Compile TypeScript
npm test           # Run unit tests
npm run test:watch # Watch mode
npm run inspect    # MCP Inspector
```

## Tech Stack

- **TypeScript** + `@modelcontextprotocol/sdk`
- **Zod** for schema validation
- **Vitest** for testing
- **Fiber Node RPC** (38 JSON-RPC methods)
- **CKB Testnet**

## License

MIT
