# Fiber Pilot — Design Document

**Date:** 2026-03-07
**Hackathon:** Claw & Order: CKB AI Agent Hackathon (Mar 11-25, 2026)
**Author:** Solo entry
**Prize Pool:** $10,000

---

## 1. Product Vision

**fiber-pilot** is an autonomous AI agent that operates and optimizes a Fiber Network node on CKB. It manages liquidity, rebalances channels, optimizes routing fees, and provides natural language control over a Fiber node.

**One-liner:** "Your Fiber node on autopilot — AI-managed liquidity, routing, and channel optimization."

### Why This Wins

- **Novel:** No one has built an AI liquidity manager for Fiber Network
- **Solves a real problem:** Fiber's 2026 roadmap explicitly lists "Liquidity Solutions" as a key challenge
- **Core Fiber usage:** Payment channels are the primary feature, not an add-on
- **Design autonomy:** Agent makes real economic decisions with human-in-the-loop safety
- **Product viability:** Every Fiber node operator would want this
- **Demo-friendly:** Clear before/after story for video submission

---

## 2. Fiber Network — Technical Background

### 2.1 What Is Fiber?

Fiber Network is a **Layer 2 payment channel network** built on CKB (Nervos), similar to Bitcoin's Lightning Network. It enables:

- **Instant payments** — no waiting for block confirmations
- **Micropayments** — fees so low you can pay 0.0001 CKB per transaction
- **Multi-asset** — supports CKB, RGB++ tokens, and UDT tokens
- **Cross-chain** — can bridge payments to/from Bitcoin Lightning Network
- **Privacy** — transactions are only visible to the participating peers

### 2.2 How Payment Channels Work

Think of a payment channel like a **bar tab between two friends:**

1. **Opening a channel:** Alice and Bob each deposit CKB into a shared on-chain "funding transaction" (a 2-of-2 multisig cell on CKB). Say Alice puts in 1000 CKB and Bob puts in 1000 CKB. Total channel capacity: 2000 CKB.

2. **Transacting off-chain:** Now they can send CKB back and forth WITHOUT touching the blockchain. Each payment updates a "commitment transaction" — a signed agreement of the current balance split.

   ```
   Initial:    Alice: 1000 | Bob: 1000
   After tx 1: Alice: 800  | Bob: 1200   (Alice paid Bob 200)
   After tx 2: Alice: 900  | Bob: 1100   (Bob paid Alice 100)
   After tx 3: Alice: 500  | Bob: 1500   (Alice paid Bob 400)
   ```

   Each update is just signing a new commitment transaction — instant, free, and private.

3. **Closing a channel:** Either party can close the channel by broadcasting the latest commitment transaction to CKB. The funds are settled on-chain according to the final balance.

### 2.3 The Commitment Transaction & Revocation

Every time the balance changes, both parties sign a NEW commitment transaction and **revoke** the old one. This prevents cheating:

- If Alice broadcasts an OLD commitment (where she had more money), Bob can use the **revocation key** to claim ALL the funds as a penalty.
- A **Watchtower** service can monitor for this fraud even when you're offline.

Fiber uses a protocol called **Daric** for this revocation mechanism, which is more storage-efficient than Lightning's approach.

### 2.4 Multi-Hop Payments (Routing)

You don't need a direct channel with everyone. Payments can route through intermediate nodes:

```
Alice → [Channel] → Charlie → [Channel] → Bob
```

Alice wants to pay Bob but only has a channel with Charlie. Charlie has a channel with Bob. The payment "hops" through Charlie.

**How it's secured:** Hash Time-Locked Contracts (HTLCs) ensure that either the entire payment succeeds across all hops, or it completely fails — no one loses money in between.

**Fiber's privacy improvement:** Fiber uses **PTLCs** (Point Time-Locked Contracts) instead of HTLCs for multi-hop privacy. With HTLCs, the same hash is used across all hops (so intermediaries can correlate payments). PTLCs use different keys at each hop, breaking the correlation.

### 2.5 Routing Algorithm

Fiber uses a **modified Dijkstra algorithm** that works backward from the recipient, weighing three factors:
- **Success probability** — based on channel capacity and known liquidity
- **Fees** — lower is better
- **Lock time** — shorter is better

The network topology is maintained via a **gossip protocol** (BOLT 7 compliant), where nodes broadcast channel updates to each other.

### 2.6 Architecture Internals

Fiber is written in **Rust** and uses the **Actor Model** for concurrency:

- **Network Actor** — routes messages between nodes
- **Channel Actor** — one per channel, manages channel state machine
- **Payment Session** — manages the lifecycle of a single payment
- **Network Graph** — bidirectional directed graph of all known nodes/channels
- **fiber-sphinx** — onion encryption for privacy-preserving route packets

Storage: **RocksDB** with Molecule serialization for deterministic cross-node consistency.

### 2.7 Channel Lifecycle (Protocol Messages)

```
Alice                                  Bob
  |                                     |
  |--- OpenChannel ------------------>  |  Alice proposes a channel
  |<-- AcceptChannel -----------------  |  Bob accepts
  |                                     |
  |  [Funding transaction created       |  Both sign the 2-of-2 multisig
  |   and submitted to CKB]            |
  |                                     |
  |--- ChannelReady ----------------->  |  Channel is live!
  |<-- ChannelReady ------------------  |
  |                                     |
  |--- AddTlc ---------------------->   |  Alice sends a payment (HTLC/PTLC)
  |--- CommitmentSigned ------------->  |  Alice signs new commitment
  |<-- RevokeAndAck -----------------  |  Bob revokes old state
  |<-- CommitmentSigned --------------  |  Bob signs new commitment
  |--- RevokeAndAck ---------------->  |  Alice revokes old state
  |                                     |
  |--- Shutdown --------------------->  |  Alice initiates close
  |<-- Shutdown ----------------------  |  Bob agrees
  |--- ClosingSigned ---------------->  |  Exchange closing signatures
  |<-- ClosingSigned -----------------  |
  |                                     |
  |  [Closing tx broadcast to CKB]     |  Funds settled on-chain
```

### 2.8 Fiber Node RPC API (38 Methods)

The Fiber node exposes a JSON-RPC API organized into modules:

| Module | Key Methods | Purpose |
|--------|------------|---------|
| **Channel** | `open_channel`, `accept_channel`, `list_channels`, `shutdown_channel`, `update_channel` | Manage payment channels |
| **Payment** | `send_payment`, `get_payment`, `build_router`, `send_payment_with_router` | Send and track payments |
| **Invoice** | `new_invoice`, `parse_invoice`, `get_invoice`, `cancel_invoice` | Create/manage payment requests |
| **Peer** | `connect_peer`, `disconnect_peer`, `list_peers` | Node connectivity |
| **Graph** | `graph_nodes`, `graph_channels` | Network topology |
| **Info** | `node_info` | Node status and config |
| **Cch** | `send_btc`, `receive_btc` | Cross-chain hub (BTC bridge) |
| **Watchtower** | `create_watch_channel`, `update_revocation`, etc. | Fraud monitoring |
| **Dev** | `commitment_signed`, `add_tlc`, `remove_tlc` | Low-level testing |

### 2.9 What Makes Fiber Different from Lightning?

| Aspect | Lightning (Bitcoin) | Fiber (CKB) |
|--------|-------------------|-------------|
| Base layer | Bitcoin (limited scripting) | CKB (Turing-complete RISC-V VM) |
| Assets | BTC only | CKB + RGB++ + UDT tokens |
| Privacy | HTLC (correlatable hashes) | PTLC (unique keys per hop) |
| Revocation | Per-commitment keys (storage heavy) | Daric protocol (storage efficient) |
| Cross-chain | N/A | Built-in Cross-Chain Hub for BTC |
| Smart contracts | Very limited | Full programmability via CKB scripts |

---

## 3. Technical Design

### 3.1 Architecture

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
│  ┌─────────────────────────────────────────────┐ │
│  │  Channel Tools                              │ │
│  │  • open_channel     • list_channels         │ │
│  │  • close_channel    • update_channel        │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  Payment & Routing Tools                    │ │
│  │  • send_payment     • create_invoice        │ │
│  │  • build_route      • get_payment_status    │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  Network Intelligence Tools                 │ │
│  │  • get_network_graph   • list_peers         │ │
│  │  • get_node_info       • analyze_channels   │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │  Safety Layer                               │ │
│  │  • Spending limits per action               │ │
│  │  • Human approval above threshold           │ │
│  │  • Action logging / audit trail             │ │
│  └─────────────────────────────────────────────┘ │
└────────────────────┬─────────────────────────────┘
                     │ JSON-RPC over HTTP
┌────────────────────▼─────────────────────────────┐
│         Fiber Network Node (FNN v0.6.1)          │
│         Running on CKB Testnet                   │
└──────────────────────────────────────────────────┘
```

### 3.2 MCP Tools

#### Channel Management
| Tool | Wraps RPC | Description |
|------|----------|-------------|
| `fp_open_channel` | `open_channel` | Open a payment channel with a peer. Requires prior peer connection. Params: peer_id, funding_amount |
| `fp_list_channels` | `list_channels` | List all channels with balances, status, and peer info |
| `fp_close_channel` | `shutdown_channel` | Cooperatively close a channel |
| `fp_update_channel` | `update_channel` | Update channel settings (fees, enabled status, min HTLC) |

#### Payment & Routing
| Tool | Wraps RPC | Description |
|------|----------|-------------|
| `fp_send_payment` | `send_payment` | Send payment to a destination with automatic routing |
| `fp_create_invoice` | `new_invoice` | Create an invoice for receiving payment |
| `fp_get_payment` | `get_payment` | Check payment status by hash |
| `fp_build_route` | `build_router` | Manually construct a payment route |

#### Network Intelligence
| Tool | Wraps RPC | Description |
|------|----------|-------------|
| `fp_connect_peer` | `connect_peer` | Connect to a Fiber network peer |
| `fp_list_peers` | `list_peers` | Show connected peers |
| `fp_get_node_info` | `node_info` | Get node status and configuration |
| `fp_get_network_graph` | `graph_nodes` + `graph_channels` | Get full network topology |

#### Smart Analysis (Custom — not direct RPC wraps)
| Tool | Description |
|------|-------------|
| `fp_analyze_channels` | Aggregates channel data, computes balance ratios, identifies imbalanced/inactive channels, suggests actions |
| `fp_suggest_rebalance` | Analyzes channel imbalances and proposes circular payment routes to rebalance |
| `fp_suggest_fees` | Analyzes network graph and suggests optimal routing fees for each channel |

#### Safety
| Tool | Description |
|------|-------------|
| `fp_get_config` | View current safety limits and configuration |
| `fp_get_audit_log` | View history of all agent actions with timestamps and reasoning |

### 3.3 Safety Layer Design

```typescript
interface SafetyConfig {
  maxChannelOpenAmount: number;    // Max CKB for opening a channel (default: 10000)
  maxPaymentAmount: number;        // Max per-payment (default: 5000)
  dailySpendingLimit: number;      // Total daily outflow limit (default: 50000)
  requireApprovalAbove: number;    // Human approval threshold (default: 5000)
  allowedPeers: string[];          // Whitelist of peer IDs (empty = allow all)
  autoRebalanceEnabled: boolean;   // Whether agent can auto-rebalance
  maxAutoRebalanceAmount: number;  // Cap on auto-rebalance amounts
}
```

When an action exceeds a threshold, the tool returns a message like:
```json
{
  "status": "approval_required",
  "action": "open_channel",
  "amount": 15000,
  "threshold": 10000,
  "message": "Opening a channel with 15000 CKB exceeds the limit of 10000 CKB. Please confirm."
}
```

The AI agent then communicates this to the human operator for approval.

### 3.4 Audit Trail

Every action is logged:
```json
{
  "timestamp": "2026-03-15T10:30:00Z",
  "tool": "fp_open_channel",
  "params": { "peer_id": "...", "funding_amount": 5000 },
  "result": "success",
  "channel_id": "0x...",
  "reasoning": "Agent opened channel to well-connected node to improve routing reach"
}
```

### 3.5 Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Server | TypeScript + @modelcontextprotocol/sdk |
| CKB interaction | CCC framework (JS/TS) |
| Fiber interaction | HTTP JSON-RPC client to local Fiber node |
| AI Agent | Claude Code + Claude Opus |
| Deployment target | CKB Testnet + Fiber Testnet |
| Build tool | Node.js / npm |

---

## 4. Demo Scenario

### Scene 1 — Node Status Check
**User:** "How's my Fiber node doing?"
**Agent:** Calls `fp_get_node_info` + `fp_list_channels` + `fp_list_peers`
**Response:** "Your node has 3 channels open with total capacity 15,000 CKB. 2 peers connected. Channel health: 1 healthy, 1 imbalanced (85/15 split), 1 inactive for 12 hours."

### Scene 2 — Channel Analysis
**User:** "Analyze my channels and suggest improvements."
**Agent:** Calls `fp_analyze_channels`
**Response:** "Channel with Node-A is heavily imbalanced — 85% of funds on your side. Recommend rebalancing 2000 CKB via circular route through Node-B. Channel with Node-C has had zero activity in 12 hours — consider closing to free up 3000 CKB for a better-connected peer."

### Scene 3 — Automated Rebalance
**User:** "Go ahead and rebalance Channel A."
**Agent:** Calls `fp_suggest_rebalance` → `fp_build_route` → `fp_send_payment`
**Response:** "Rebalance complete. Sent 2000 CKB circular payment: You → Node-B → Node-A → You. Channel A is now balanced at 55/45. Cost: 2 CKB in routing fees."

### Scene 4 — Fee Optimization
**User:** "Optimize my routing fees."
**Agent:** Calls `fp_suggest_fees` → `fp_update_channel` (for each channel)
**Response:** "Updated fees: Channel A raised from 100 to 250 shannons (high-demand route). Channel B lowered to 50 shannons (underutilized, attracting traffic). Expected daily revenue increase: ~15%."

### Scene 5 — Safety Checkpoint
**User:** "Open a new 20,000 CKB channel with this peer."
**Agent:** Detects amount exceeds `maxChannelOpenAmount` of 10,000 CKB.
**Response:** "This exceeds your configured limit of 10,000 CKB. Requesting your approval before proceeding."

---

## 5. Submission Deliverables

1. **fiber-pilot MCP Server** — TypeScript package, installable via npm
2. **Demo video** (2-3 min) — walkthrough of all 5 demo scenarios
3. **GitHub repository** — with README, setup instructions, architecture docs
4. **Testnet deployment** — working with real Fiber testnet channels
5. **Technical writeup** — explaining the agent's decision-making logic

---

## 6. Judging Criteria Alignment

| Criterion | How fiber-pilot scores |
|-----------|----------------------|
| Submission completeness | Full package: code, docs, video, testnet |
| Functional soundness | Each MCP tool wraps battle-tested Fiber RPC methods |
| Design autonomy | Agent makes economic decisions; safety thresholds for checkpoints |
| UX/abstraction | Natural language → complex multi-step Fiber operations |
| Product viability | Every Fiber node operator needs liquidity management |
| Idea novelty | First AI liquidity manager for Fiber Network |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Fiber testnet instability | Test early; have fallback demo using recorded responses |
| Channel operations take time on-chain | Use pre-funded channels for demo; document setup process |
| Complex routing may fail | Start with simple 2-hop routes; graceful error handling |
| 2-week timeline is tight | Core tools first (list, open, close, send), smart analysis tools second |

---

## 8. Implementation Priority

**Week 1 (Must-have):**
1. MCP server scaffold with Fiber RPC client
2. Core channel tools (open, list, close, update)
3. Core payment tools (send, invoice, get_payment)
4. Network tools (peers, node_info, graph)
5. Safety layer with configurable thresholds

**Week 2 (Differentiators):**
1. Smart analysis tools (analyze_channels, suggest_rebalance, suggest_fees)
2. Audit trail logging
3. Demo scenario testing on testnet
4. Video recording and documentation
5. Polish and submission
