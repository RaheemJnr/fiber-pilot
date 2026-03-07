# Fiber Pilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server that gives Claude autonomous control over a Fiber Network node for liquidity management, channel optimization, and routing fee tuning.

**Architecture:** TypeScript MCP server (stdio transport) wrapping Fiber Node's JSON-RPC API. The server exposes 16 tools across channel management, payments, network intelligence, smart analysis, and safety. A thin JSON-RPC client talks to a local Fiber node over HTTP.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, zod, node-fetch, vitest (testing), CKB Testnet + Fiber Testnet

---

## Pre-requisites

Before starting, ensure you have:
- Node.js 20+ installed
- A Fiber testnet node running (or accessible) — see https://github.com/nervosnetwork/fiber
- CKB testnet coins from the Nervos Pudge Faucet

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `.gitignore`

**Step 1: Initialize npm project**

Run: `cd "/Users/raheemjnr/web/ckn hackathon" && npm init -y`

**Step 2: Install dependencies**

Run: `npm install @modelcontextprotocol/sdk zod@3`

**Step 3: Install dev dependencies**

Run: `npm install -D typescript @types/node vitest`

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 5: Update package.json**

Add to package.json:
```json
{
  "type": "module",
  "bin": {
    "fiber-pilot": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "npx tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "inspect": "npx @modelcontextprotocol/inspector node dist/index.js"
  }
}
```

**Step 6: Create .gitignore**

```
node_modules/
dist/
*.js.map
.env
```

**Step 7: Create minimal src/index.ts**

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "fiber-pilot",
  version: "0.1.0",
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("fiber-pilot MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 8: Build and verify**

Run: `npm run build`
Expected: Compiles without errors, creates `dist/index.js`

**Step 9: Commit**

```bash
git add package.json tsconfig.json src/index.ts .gitignore
git commit -m "feat: scaffold fiber-pilot MCP server project"
```

---

### Task 2: Fiber RPC Client

**Files:**
- Create: `src/fiber-rpc.ts`
- Create: `src/fiber-rpc.test.ts`

This is the core HTTP client that talks to the Fiber node's JSON-RPC API.

**Step 1: Write the failing test**

Create `src/fiber-rpc.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FiberRpcClient } from "./fiber-rpc.js";

describe("FiberRpcClient", () => {
  let client: FiberRpcClient;

  beforeEach(() => {
    client = new FiberRpcClient("http://127.0.0.1:8227");
  });

  it("should construct with a URL", () => {
    expect(client).toBeDefined();
  });

  it("should format JSON-RPC requests correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: { node_name: "test" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.call("node_info", []);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8227",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"method":"node_info"'),
      })
    );
    expect(result).toEqual({ node_name: "test" });

    vi.unstubAllGlobals();
  });

  it("should throw on RPC error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "Method not found" },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(client.call("bad_method", [])).rejects.toThrow("Method not found");

    vi.unstubAllGlobals();
  });

  it("should throw on HTTP error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(client.call("node_info", [])).rejects.toThrow();

    vi.unstubAllGlobals();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/fiber-rpc.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/fiber-rpc.ts`:
```typescript
export class FiberRpcClient {
  private url: string;
  private requestId = 0;

  constructor(url: string) {
    this.url = url;
  }

  async call<T = unknown>(method: string, params: unknown[]): Promise<T> {
    this.requestId++;

    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.requestId,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      result?: T;
      error?: { code: number; message: string };
    };

    if (data.error) {
      throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
    }

    return data.result as T;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/fiber-rpc.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/fiber-rpc.ts src/fiber-rpc.test.ts
git commit -m "feat: add Fiber JSON-RPC client with tests"
```

---

### Task 3: Safety Layer

**Files:**
- Create: `src/safety.ts`
- Create: `src/safety.test.ts`

**Step 1: Write the failing test**

Create `src/safety.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SafetyLayer, SafetyConfig } from "./safety.js";

describe("SafetyLayer", () => {
  let safety: SafetyLayer;

  beforeEach(() => {
    safety = new SafetyLayer({
      maxChannelOpenAmount: 10000,
      maxPaymentAmount: 5000,
      dailySpendingLimit: 50000,
      requireApprovalAbove: 5000,
      allowedPeers: [],
      autoRebalanceEnabled: true,
      maxAutoRebalanceAmount: 3000,
    });
  });

  it("should allow amounts within limits", () => {
    const result = safety.checkChannelOpen(5000);
    expect(result.allowed).toBe(true);
  });

  it("should block amounts exceeding channel open limit", () => {
    const result = safety.checkChannelOpen(15000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("10000");
  });

  it("should require approval for amounts above threshold", () => {
    const result = safety.checkPayment(7000);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it("should allow payments within limit", () => {
    const result = safety.checkPayment(3000);
    expect(result.allowed).toBe(true);
  });

  it("should track daily spending", () => {
    safety.recordSpend(40000);
    const result = safety.checkPayment(15000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily");
  });

  it("should enforce peer whitelist when set", () => {
    safety = new SafetyLayer({
      maxChannelOpenAmount: 10000,
      maxPaymentAmount: 5000,
      dailySpendingLimit: 50000,
      requireApprovalAbove: 5000,
      allowedPeers: ["peer_abc"],
      autoRebalanceEnabled: true,
      maxAutoRebalanceAmount: 3000,
    });
    const result = safety.checkPeer("peer_xyz");
    expect(result.allowed).toBe(false);
  });

  it("should allow any peer when whitelist is empty", () => {
    const result = safety.checkPeer("peer_xyz");
    expect(result.allowed).toBe(true);
  });

  it("should return config", () => {
    const config = safety.getConfig();
    expect(config.maxChannelOpenAmount).toBe(10000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/safety.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/safety.ts`:
```typescript
export interface SafetyConfig {
  maxChannelOpenAmount: number;
  maxPaymentAmount: number;
  dailySpendingLimit: number;
  requireApprovalAbove: number;
  allowedPeers: string[];
  autoRebalanceEnabled: boolean;
  maxAutoRebalanceAmount: number;
}

export interface SafetyCheck {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
}

export class SafetyLayer {
  private config: SafetyConfig;
  private dailySpent = 0;
  private dailyResetDate: string;

  constructor(config: SafetyConfig) {
    this.config = config;
    this.dailyResetDate = new Date().toISOString().split("T")[0];
  }

  private resetDailyIfNeeded() {
    const today = new Date().toISOString().split("T")[0];
    if (today !== this.dailyResetDate) {
      this.dailySpent = 0;
      this.dailyResetDate = today;
    }
  }

  checkChannelOpen(amount: number): SafetyCheck {
    if (amount > this.config.maxChannelOpenAmount) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} exceeds max channel open limit of ${this.config.maxChannelOpenAmount} CKB.`,
      };
    }
    return this.checkDailyLimit(amount);
  }

  checkPayment(amount: number): SafetyCheck {
    if (amount > this.config.maxPaymentAmount) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} exceeds max payment limit of ${this.config.maxPaymentAmount} CKB.`,
      };
    }
    if (amount > this.config.requireApprovalAbove) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} exceeds approval threshold of ${this.config.requireApprovalAbove} CKB. Human approval required.`,
      };
    }
    return this.checkDailyLimit(amount);
  }

  checkPeer(peerId: string): SafetyCheck {
    if (this.config.allowedPeers.length > 0 && !this.config.allowedPeers.includes(peerId)) {
      return {
        allowed: false,
        reason: `Peer ${peerId} is not in the allowed peers list.`,
      };
    }
    return { allowed: true };
  }

  checkRebalance(amount: number): SafetyCheck {
    if (!this.config.autoRebalanceEnabled) {
      return { allowed: false, reason: "Auto-rebalance is disabled." };
    }
    if (amount > this.config.maxAutoRebalanceAmount) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Rebalance amount ${amount} exceeds max of ${this.config.maxAutoRebalanceAmount} CKB.`,
      };
    }
    return { allowed: true };
  }

  recordSpend(amount: number) {
    this.resetDailyIfNeeded();
    this.dailySpent += amount;
  }

  getConfig(): SafetyConfig {
    return { ...this.config };
  }

  private checkDailyLimit(amount: number): SafetyCheck {
    this.resetDailyIfNeeded();
    if (this.dailySpent + amount > this.config.dailySpendingLimit) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} would exceed daily spending limit of ${this.config.dailySpendingLimit} CKB (spent today: ${this.dailySpent}).`,
      };
    }
    return { allowed: true };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/safety.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add src/safety.ts src/safety.test.ts
git commit -m "feat: add safety layer with spending limits and peer whitelist"
```

---

### Task 4: Audit Trail Logger

**Files:**
- Create: `src/audit.ts`
- Create: `src/audit.test.ts`

**Step 1: Write the failing test**

Create `src/audit.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { AuditLog, AuditEntry } from "./audit.js";

describe("AuditLog", () => {
  it("should log an action", () => {
    const log = new AuditLog();
    log.record({
      tool: "fp_open_channel",
      params: { peer_id: "abc", funding_amount: 5000 },
      result: "success",
      detail: "Opened channel with 5000 CKB",
    });
    const entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].tool).toBe("fp_open_channel");
    expect(entries[0].timestamp).toBeDefined();
  });

  it("should return entries in reverse chronological order", () => {
    const log = new AuditLog();
    log.record({ tool: "first", params: {}, result: "success", detail: "" });
    log.record({ tool: "second", params: {}, result: "success", detail: "" });
    const entries = log.getEntries();
    expect(entries[0].tool).toBe("second");
    expect(entries[1].tool).toBe("first");
  });

  it("should limit returned entries", () => {
    const log = new AuditLog();
    for (let i = 0; i < 20; i++) {
      log.record({ tool: `tool_${i}`, params: {}, result: "success", detail: "" });
    }
    const entries = log.getEntries(5);
    expect(entries).toHaveLength(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/audit.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `src/audit.ts`:
```typescript
export interface AuditEntry {
  timestamp: string;
  tool: string;
  params: Record<string, unknown>;
  result: string;
  detail: string;
}

export class AuditLog {
  private entries: AuditEntry[] = [];

  record(entry: Omit<AuditEntry, "timestamp">) {
    this.entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  getEntries(limit?: number): AuditEntry[] {
    const reversed = [...this.entries].reverse();
    return limit ? reversed.slice(0, limit) : reversed;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/audit.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/audit.ts src/audit.test.ts
git commit -m "feat: add audit trail logger"
```

---

### Task 5: Channel Management MCP Tools

**Files:**
- Modify: `src/index.ts`
- Create: `src/tools/channels.ts`

These are the core channel tools: `fp_list_channels`, `fp_open_channel`, `fp_close_channel`, `fp_update_channel`.

**Step 1: Create the channel tools module**

Create `src/tools/channels.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FiberRpcClient } from "../fiber-rpc.js";
import { SafetyLayer } from "../safety.js";
import { AuditLog } from "../audit.js";

export function registerChannelTools(
  server: McpServer,
  rpc: FiberRpcClient,
  safety: SafetyLayer,
  audit: AuditLog
) {
  server.registerTool(
    "fp_list_channels",
    {
      title: "List Fiber channels",
      description:
        "List all payment channels with their balances, status, and peer info. Use this to understand current channel state before making decisions.",
      inputSchema: {
        peer_id: z.string().optional().describe("Filter by peer ID"),
        include_closed: z.boolean().optional().describe("Include closed channels (default: false)"),
      },
    },
    async ({ peer_id, include_closed }) => {
      const params: Record<string, unknown> = {};
      if (peer_id) params.peer_id = peer_id;
      if (include_closed) params.include_closed = include_closed;

      const result = await rpc.call("list_channels", [params]);

      audit.record({
        tool: "fp_list_channels",
        params: { peer_id, include_closed },
        result: "success",
        detail: `Listed channels`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_open_channel",
    {
      title: "Open a Fiber payment channel",
      description:
        "Open a new payment channel with a connected peer. The peer must be connected first (use fp_connect_peer). Funds will be locked in the channel on-chain.",
      inputSchema: {
        peer_id: z.string().describe("The peer ID to open a channel with"),
        funding_amount: z
          .number()
          .describe("Amount of CKB (in shannons) to fund the channel with"),
        public: z.boolean().optional().describe("Whether the channel should be announced to the network (default: true)"),
      },
    },
    async ({ peer_id, funding_amount, public: isPublic }) => {
      // Safety checks
      const peerCheck = safety.checkPeer(peer_id);
      if (!peerCheck.allowed) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status: "blocked", reason: peerCheck.reason }) }],
        };
      }

      const amountCheck = safety.checkChannelOpen(funding_amount);
      if (!amountCheck.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "approval_required",
                action: "open_channel",
                amount: funding_amount,
                reason: amountCheck.reason,
              }),
            },
          ],
        };
      }

      const params: Record<string, unknown> = {
        peer_id,
        funding_amount: `0x${funding_amount.toString(16)}`,
      };
      if (isPublic !== undefined) params.public = isPublic;

      const result = await rpc.call("open_channel", [params]);

      safety.recordSpend(funding_amount);
      audit.record({
        tool: "fp_open_channel",
        params: { peer_id, funding_amount },
        result: "success",
        detail: `Opened channel with ${funding_amount} CKB to peer ${peer_id}`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_close_channel",
    {
      title: "Close a Fiber payment channel",
      description:
        "Cooperatively close a payment channel. Funds will be settled on-chain according to the latest balance.",
      inputSchema: {
        channel_id: z.string().describe("The channel ID to close"),
        force: z.boolean().optional().describe("Force close the channel unilaterally (default: false)"),
      },
    },
    async ({ channel_id, force }) => {
      const params: Record<string, unknown> = {
        channel_id,
      };
      if (force) params.force = force;

      const result = await rpc.call("shutdown_channel", [params]);

      audit.record({
        tool: "fp_close_channel",
        params: { channel_id, force },
        result: "success",
        detail: `${force ? "Force closed" : "Closed"} channel ${channel_id}`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_update_channel",
    {
      title: "Update Fiber channel settings",
      description:
        "Update channel parameters like routing fees, enabled status, and minimum HTLC amount. Use this to optimize routing fees.",
      inputSchema: {
        channel_id: z.string().describe("The channel ID to update"),
        enabled: z.boolean().optional().describe("Enable or disable the channel for routing"),
        tlc_fee_proportional_millionths: z
          .number()
          .optional()
          .describe("Proportional routing fee in millionths"),
        tlc_min_value: z.number().optional().describe("Minimum HTLC value in shannons"),
        tlc_expiry_delta: z.number().optional().describe("HTLC expiry delta in blocks"),
      },
    },
    async ({ channel_id, enabled, tlc_fee_proportional_millionths, tlc_min_value, tlc_expiry_delta }) => {
      const params: Record<string, unknown> = { channel_id };
      if (enabled !== undefined) params.enabled = enabled;
      if (tlc_fee_proportional_millionths !== undefined)
        params.tlc_fee_proportional_millionths = `0x${tlc_fee_proportional_millionths.toString(16)}`;
      if (tlc_min_value !== undefined) params.tlc_min_value = `0x${tlc_min_value.toString(16)}`;
      if (tlc_expiry_delta !== undefined) params.tlc_expiry_delta = `0x${tlc_expiry_delta.toString(16)}`;

      const result = await rpc.call("update_channel", [params]);

      audit.record({
        tool: "fp_update_channel",
        params: { channel_id, enabled, tlc_fee_proportional_millionths },
        result: "success",
        detail: `Updated channel ${channel_id} settings`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
```

**Step 2: Update src/index.ts to wire everything together**

Replace `src/index.ts`:
```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FiberRpcClient } from "./fiber-rpc.js";
import { SafetyLayer } from "./safety.js";
import { AuditLog } from "./audit.js";
import { registerChannelTools } from "./tools/channels.js";

const FIBER_RPC_URL = process.env.FIBER_RPC_URL || "http://127.0.0.1:8227";

const server = new McpServer({
  name: "fiber-pilot",
  version: "0.1.0",
});

const rpc = new FiberRpcClient(FIBER_RPC_URL);

const safety = new SafetyLayer({
  maxChannelOpenAmount: Number(process.env.FP_MAX_CHANNEL_OPEN || 10000),
  maxPaymentAmount: Number(process.env.FP_MAX_PAYMENT || 5000),
  dailySpendingLimit: Number(process.env.FP_DAILY_LIMIT || 50000),
  requireApprovalAbove: Number(process.env.FP_APPROVAL_THRESHOLD || 5000),
  allowedPeers: process.env.FP_ALLOWED_PEERS ? process.env.FP_ALLOWED_PEERS.split(",") : [],
  autoRebalanceEnabled: process.env.FP_AUTO_REBALANCE !== "false",
  maxAutoRebalanceAmount: Number(process.env.FP_MAX_REBALANCE || 3000),
});

const audit = new AuditLog();

// Register all tool groups
registerChannelTools(server, rpc, safety, audit);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("fiber-pilot MCP server running on stdio");
  console.error(`Fiber RPC URL: ${FIBER_RPC_URL}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/tools/channels.ts src/index.ts
git commit -m "feat: add channel management MCP tools (list, open, close, update)"
```

---

### Task 6: Payment & Routing MCP Tools

**Files:**
- Create: `src/tools/payments.ts`
- Modify: `src/index.ts` (add import + registration)

**Step 1: Create the payment tools module**

Create `src/tools/payments.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FiberRpcClient } from "../fiber-rpc.js";
import { SafetyLayer } from "../safety.js";
import { AuditLog } from "../audit.js";

export function registerPaymentTools(
  server: McpServer,
  rpc: FiberRpcClient,
  safety: SafetyLayer,
  audit: AuditLog
) {
  server.registerTool(
    "fp_send_payment",
    {
      title: "Send a Fiber payment",
      description:
        "Send a payment through the Fiber network to a destination. Automatically finds the best route. Can pay an invoice or send to a node directly.",
      inputSchema: {
        invoice: z.string().optional().describe("Fiber invoice string to pay"),
        target_pubkey: z.string().optional().describe("Target node public key (if not using invoice)"),
        amount: z.number().optional().describe("Amount in shannons (if not using invoice)"),
        timeout: z.number().optional().describe("Payment timeout in seconds (default: 60)"),
      },
    },
    async ({ invoice, target_pubkey, amount, timeout }) => {
      // Safety check on amount
      if (amount) {
        const check = safety.checkPayment(amount);
        if (!check.allowed) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: "approval_required",
                  action: "send_payment",
                  amount,
                  reason: check.reason,
                }),
              },
            ],
          };
        }
      }

      const params: Record<string, unknown> = {};
      if (invoice) params.invoice = invoice;
      if (target_pubkey) params.target_pubkey = target_pubkey;
      if (amount) params.amount = `0x${amount.toString(16)}`;
      if (timeout) params.timeout = `0x${timeout.toString(16)}`;

      const result = await rpc.call("send_payment", [params]);

      if (amount) safety.recordSpend(amount);
      audit.record({
        tool: "fp_send_payment",
        params: { invoice: invoice ? "[redacted]" : undefined, target_pubkey, amount },
        result: "success",
        detail: `Sent payment${amount ? ` of ${amount} shannons` : ""}`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_create_invoice",
    {
      title: "Create a Fiber invoice",
      description:
        "Create a new invoice for receiving payment through the Fiber network.",
      inputSchema: {
        amount: z.number().describe("Amount in shannons to request"),
        description: z.string().optional().describe("Human-readable description of the payment"),
        expiry: z.number().optional().describe("Invoice expiry in seconds (default: 3600)"),
        currency: z.string().optional().describe("Currency code (default: CKB)"),
      },
    },
    async ({ amount, description, expiry, currency }) => {
      const params: Record<string, unknown> = {
        amount: `0x${amount.toString(16)}`,
      };
      if (description) params.description = description;
      if (expiry) params.expiry = `0x${expiry.toString(16)}`;
      if (currency) params.currency = currency;

      const result = await rpc.call("new_invoice", [params]);

      audit.record({
        tool: "fp_create_invoice",
        params: { amount, description },
        result: "success",
        detail: `Created invoice for ${amount} shannons`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_get_payment",
    {
      title: "Get payment status",
      description: "Check the status of a payment by its payment hash.",
      inputSchema: {
        payment_hash: z.string().describe("The payment hash to look up"),
      },
    },
    async ({ payment_hash }) => {
      const result = await rpc.call("get_payment", [{ payment_hash }]);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_build_route",
    {
      title: "Build a payment route",
      description:
        "Manually construct a payment route through specific channels and nodes. Useful for circular rebalancing payments.",
      inputSchema: {
        target_pubkey: z.string().describe("Destination node public key"),
        amount: z.number().describe("Amount in shannons"),
        source_pubkey: z.string().optional().describe("Source node public key (defaults to self)"),
      },
    },
    async ({ target_pubkey, amount, source_pubkey }) => {
      const params: Record<string, unknown> = {
        target_pubkey,
        amount: `0x${amount.toString(16)}`,
      };
      if (source_pubkey) params.source_pubkey = source_pubkey;

      const result = await rpc.call("build_router", [params]);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
```

**Step 2: Add import and registration to src/index.ts**

Add to imports:
```typescript
import { registerPaymentTools } from "./tools/payments.js";
```

Add after `registerChannelTools(...)`:
```typescript
registerPaymentTools(server, rpc, safety, audit);
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/tools/payments.ts src/index.ts
git commit -m "feat: add payment & routing MCP tools (send, invoice, status, route)"
```

---

### Task 7: Network Intelligence MCP Tools

**Files:**
- Create: `src/tools/network.ts`
- Modify: `src/index.ts` (add import + registration)

**Step 1: Create the network tools module**

Create `src/tools/network.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FiberRpcClient } from "../fiber-rpc.js";
import { AuditLog } from "../audit.js";

export function registerNetworkTools(
  server: McpServer,
  rpc: FiberRpcClient,
  audit: AuditLog
) {
  server.registerTool(
    "fp_connect_peer",
    {
      title: "Connect to a Fiber peer",
      description:
        "Establish a connection to a Fiber network peer. Required before opening a channel with that peer.",
      inputSchema: {
        address: z
          .string()
          .describe("Multi-address of the peer, e.g. /ip4/1.2.3.4/tcp/8228/p2p/<peer_id>"),
      },
    },
    async ({ address }) => {
      const result = await rpc.call("connect_peer", [{ address }]);

      audit.record({
        tool: "fp_connect_peer",
        params: { address },
        result: "success",
        detail: `Connected to peer at ${address}`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_list_peers",
    {
      title: "List connected Fiber peers",
      description: "Show all currently connected Fiber network peers.",
      inputSchema: {},
    },
    async () => {
      const result = await rpc.call("list_peers", []);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_get_node_info",
    {
      title: "Get Fiber node info",
      description:
        "Get comprehensive node status including public key, addresses, chain info, and open channel count.",
      inputSchema: {},
    },
    async () => {
      const result = await rpc.call("node_info", []);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_get_network_graph",
    {
      title: "Get Fiber network topology",
      description:
        "Get the network graph showing all known nodes and channels. Useful for understanding the network structure, finding well-connected nodes, and planning routes.",
      inputSchema: {
        limit: z.number().optional().describe("Max number of nodes/channels to return (default: 50)"),
      },
    },
    async ({ limit }) => {
      const nodeLimit = limit || 50;

      const [nodes, channels] = await Promise.all([
        rpc.call("graph_nodes", [{ limit: `0x${nodeLimit.toString(16)}` }]),
        rpc.call("graph_channels", [{ limit: `0x${nodeLimit.toString(16)}` }]),
      ]);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ nodes, channels }, null, 2),
          },
        ],
      };
    }
  );
}
```

**Step 2: Add import and registration to src/index.ts**

Add to imports:
```typescript
import { registerNetworkTools } from "./tools/network.js";
```

Add after payment tools registration:
```typescript
registerNetworkTools(server, rpc, audit);
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/tools/network.ts src/index.ts
git commit -m "feat: add network intelligence MCP tools (peers, node info, graph)"
```

---

### Task 8: Smart Analysis MCP Tools

**Files:**
- Create: `src/tools/analysis.ts`
- Modify: `src/index.ts` (add import + registration)

These are the **differentiator tools** — they don't just wrap RPC methods, they add intelligence.

**Step 1: Create the analysis tools module**

Create `src/tools/analysis.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FiberRpcClient } from "../fiber-rpc.js";
import { AuditLog } from "../audit.js";

interface ChannelInfo {
  channel_id: string;
  peer_id: string;
  local_balance: string;
  remote_balance: string;
  state: { state_name: string };
  created_at?: string;
  updated_at?: string;
  local_balance_num?: number;
  remote_balance_num?: number;
  total_capacity?: number;
  local_ratio?: number;
}

function parseHex(hex: string): number {
  return parseInt(hex, 16);
}

function enrichChannel(ch: ChannelInfo): ChannelInfo {
  const local = parseHex(ch.local_balance);
  const remote = parseHex(ch.remote_balance);
  const total = local + remote;
  return {
    ...ch,
    local_balance_num: local,
    remote_balance_num: remote,
    total_capacity: total,
    local_ratio: total > 0 ? Math.round((local / total) * 100) : 0,
  };
}

export function registerAnalysisTools(
  server: McpServer,
  rpc: FiberRpcClient,
  audit: AuditLog
) {
  server.registerTool(
    "fp_analyze_channels",
    {
      title: "Analyze channel health",
      description:
        "Comprehensive analysis of all channels: balance ratios, capacity utilization, health scores, and actionable recommendations. Use this to understand your node's liquidity position.",
      inputSchema: {},
    },
    async () => {
      const rawChannels = await rpc.call<{ channels: ChannelInfo[] }>("list_channels", [{}]);
      const channels = (rawChannels.channels || []).map(enrichChannel);

      const analysis = {
        summary: {
          total_channels: channels.length,
          total_capacity: channels.reduce((sum, ch) => sum + (ch.total_capacity || 0), 0),
          total_local_balance: channels.reduce((sum, ch) => sum + (ch.local_balance_num || 0), 0),
          total_remote_balance: channels.reduce((sum, ch) => sum + (ch.remote_balance_num || 0), 0),
        },
        channels: channels.map((ch) => {
          const ratio = ch.local_ratio || 0;
          let health: string;
          let recommendation: string;

          if (ratio >= 80) {
            health = "IMBALANCED_LOCAL";
            recommendation = `Channel is ${ratio}% on your side. Consider rebalancing by sending a circular payment to shift funds to the remote side.`;
          } else if (ratio <= 20) {
            health = "IMBALANCED_REMOTE";
            recommendation = `Channel is only ${ratio}% on your side. You have limited outbound capacity. Consider receiving payments through this channel or opening a new channel.`;
          } else if (ratio >= 40 && ratio <= 60) {
            health = "HEALTHY";
            recommendation = "Channel is well-balanced. No action needed.";
          } else {
            health = "ACCEPTABLE";
            recommendation = "Channel balance is acceptable but could be improved.";
          }

          return {
            channel_id: ch.channel_id,
            peer_id: ch.peer_id,
            state: ch.state?.state_name,
            local_balance: ch.local_balance_num,
            remote_balance: ch.remote_balance_num,
            total_capacity: ch.total_capacity,
            local_ratio_pct: ratio,
            health,
            recommendation,
          };
        }),
      };

      audit.record({
        tool: "fp_analyze_channels",
        params: {},
        result: "success",
        detail: `Analyzed ${channels.length} channels`,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(analysis, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_suggest_rebalance",
    {
      title: "Suggest channel rebalancing",
      description:
        "Identifies imbalanced channels and suggests circular payment routes to rebalance them. Returns specific amounts and routes to execute.",
      inputSchema: {
        target_ratio: z
          .number()
          .optional()
          .describe("Target local balance ratio in percent (default: 50)"),
      },
    },
    async ({ target_ratio }) => {
      const target = (target_ratio || 50) / 100;
      const rawChannels = await rpc.call<{ channels: ChannelInfo[] }>("list_channels", [{}]);
      const channels = (rawChannels.channels || []).map(enrichChannel);

      const suggestions = channels
        .filter((ch) => {
          const ratio = (ch.local_ratio || 0) / 100;
          return Math.abs(ratio - target) > 0.15; // More than 15% off target
        })
        .map((ch) => {
          const currentLocal = ch.local_balance_num || 0;
          const total = ch.total_capacity || 0;
          const targetLocal = Math.round(total * target);
          const rebalanceAmount = currentLocal - targetLocal;

          return {
            channel_id: ch.channel_id,
            peer_id: ch.peer_id,
            current_local_ratio: ch.local_ratio,
            target_local_ratio: Math.round(target * 100),
            rebalance_amount: rebalanceAmount,
            direction: rebalanceAmount > 0 ? "send_out" : "receive_in",
            action:
              rebalanceAmount > 0
                ? `Send ${rebalanceAmount} shannons through a circular route to reduce local balance`
                : `Receive ${Math.abs(rebalanceAmount)} shannons to increase local balance`,
          };
        });

      audit.record({
        tool: "fp_suggest_rebalance",
        params: { target_ratio },
        result: "success",
        detail: `Found ${suggestions.length} channels needing rebalance`,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                target_ratio_pct: Math.round(target * 100),
                suggestions,
                note: "To execute a rebalance, use fp_send_payment with a circular route through another channel.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "fp_suggest_fees",
    {
      title: "Suggest routing fee optimization",
      description:
        "Analyzes your channels and the network graph to suggest optimal routing fees. Considers channel capacity, balance, and network position.",
      inputSchema: {},
    },
    async () => {
      const [rawChannels, graphChannels] = await Promise.all([
        rpc.call<{ channels: ChannelInfo[] }>("list_channels", [{}]),
        rpc.call<{ channels: Array<{ fee_rate?: string }> }>("graph_channels", [
          { limit: "0x64" },
        ]),
      ]);

      const channels = (rawChannels.channels || []).map(enrichChannel);

      // Calculate network average fee rate
      const networkFees = (graphChannels.channels || [])
        .map((ch) => (ch.fee_rate ? parseHex(ch.fee_rate) : 0))
        .filter((f) => f > 0);
      const avgNetworkFee =
        networkFees.length > 0
          ? Math.round(networkFees.reduce((a, b) => a + b, 0) / networkFees.length)
          : 1000;

      const suggestions = channels.map((ch) => {
        const ratio = (ch.local_ratio || 0) / 100;
        let suggestedFee: number;
        let reasoning: string;

        if (ratio > 0.7) {
          // Heavy on local side — lower fees to encourage outbound routing
          suggestedFee = Math.round(avgNetworkFee * 0.7);
          reasoning =
            "Channel is heavy on local side. Lower fees to encourage outbound routing and rebalance naturally.";
        } else if (ratio < 0.3) {
          // Heavy on remote side — raise fees to capitalize on scarce outbound capacity
          suggestedFee = Math.round(avgNetworkFee * 1.5);
          reasoning =
            "Limited outbound capacity. Raise fees to capitalize on scarce outbound liquidity.";
        } else {
          suggestedFee = avgNetworkFee;
          reasoning = "Channel is balanced. Use network average fee rate.";
        }

        return {
          channel_id: ch.channel_id,
          peer_id: ch.peer_id,
          local_ratio_pct: ch.local_ratio,
          suggested_fee_proportional_millionths: suggestedFee,
          reasoning,
        };
      });

      audit.record({
        tool: "fp_suggest_fees",
        params: {},
        result: "success",
        detail: `Generated fee suggestions for ${suggestions.length} channels`,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                network_average_fee: avgNetworkFee,
                suggestions,
                note: "To apply these fees, use fp_update_channel for each channel.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
```

**Step 2: Add import and registration to src/index.ts**

Add to imports:
```typescript
import { registerAnalysisTools } from "./tools/analysis.js";
```

Add after network tools registration:
```typescript
registerAnalysisTools(server, rpc, audit);
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/tools/analysis.ts src/index.ts
git commit -m "feat: add smart analysis tools (channel health, rebalance, fee optimization)"
```

---

### Task 9: Safety & Audit MCP Tools

**Files:**
- Create: `src/tools/safety-tools.ts`
- Modify: `src/index.ts` (add import + registration)

**Step 1: Create safety tools module**

Create `src/tools/safety-tools.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SafetyLayer } from "../safety.js";
import { AuditLog } from "../audit.js";

export function registerSafetyTools(
  server: McpServer,
  safety: SafetyLayer,
  audit: AuditLog
) {
  server.registerTool(
    "fp_get_config",
    {
      title: "View safety configuration",
      description:
        "View current safety limits: spending caps, approval thresholds, peer whitelist, and rebalance settings.",
      inputSchema: {},
    },
    async () => {
      const config = safety.getConfig();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(config, null, 2) }],
      };
    }
  );

  server.registerTool(
    "fp_get_audit_log",
    {
      title: "View action audit log",
      description:
        "View the history of all actions taken by the agent, with timestamps, parameters, and results.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .describe("Max number of entries to return (default: 20, most recent first)"),
      },
    },
    async ({ limit }) => {
      const entries = audit.getEntries(limit || 20);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total_actions: entries.length, entries },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
```

**Step 2: Add import and registration to src/index.ts**

Add to imports:
```typescript
import { registerSafetyTools } from "./tools/safety-tools.js";
```

Add after analysis tools registration:
```typescript
registerSafetyTools(server, safety, audit);
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add src/tools/safety-tools.ts src/index.ts
git commit -m "feat: add safety config and audit log MCP tools"
```

---

### Task 10: Integration Test & MCP Inspector Verification

**Files:**
- No new files — testing existing build

**Step 1: Full build**

Run: `npm run build`
Expected: Compiles without errors

**Step 2: Run all unit tests**

Run: `npm test`
Expected: All tests pass (safety, audit, fiber-rpc)

**Step 3: Test with MCP Inspector**

Run: `npm run inspect`

This opens the MCP Inspector in your browser. Verify:
- All 16 tools show up in the tools list
- Tool descriptions are readable
- Schemas look correct

**Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve issues found during integration testing"
```

---

### Task 11: Claude Code MCP Configuration

**Files:**
- Create: `.claude/settings.json` (or update Claude Code's MCP config)

**Step 1: Create Claude Code MCP config**

To use fiber-pilot with Claude Code, add to your Claude Code MCP settings (typically `~/.claude/settings.json` or project-level `.mcp.json`):

Create `.mcp.json` in the project root:
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

**Step 2: Commit**

```bash
git add .mcp.json
git commit -m "feat: add Claude Code MCP server configuration"
```

---

### Task 12: README & Submission Documentation

**Files:**
- Create: `README.md`

**Step 1: Write README**

Create `README.md` with:
- Project name and one-liner
- Architecture diagram (from design doc)
- Quick start: prerequisites, install, configure, run
- Full tool reference table (all 16 tools)
- Safety configuration (env vars)
- Demo walkthrough
- How to test with MCP Inspector
- License (MIT)

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README for hackathon submission"
```

---

### Task 13: Testnet Demo Preparation

**Files:**
- No code changes — operational task

**Step 1: Set up Fiber testnet node**

Follow https://github.com/nervosnetwork/fiber for testnet setup:
1. Build Fiber from source (`cargo build --release`)
2. Configure for testnet
3. Fund with CKB testnet coins from Pudge Faucet
4. Start the node

**Step 2: Connect to testnet peers**

Use the testnet public nodes to connect and open channels.

**Step 3: Run through all 5 demo scenarios**

Execute each demo scenario from the design doc (Section 4) against real testnet:
1. Node status check
2. Channel analysis
3. Automated rebalance
4. Fee optimization
5. Safety checkpoint

**Step 4: Record demo video (2-3 min)**

Record screen showing Claude Code using fiber-pilot tools to manage the Fiber node.

---

### Task 14: Final Polish & Submission

**Step 1: Review all code for TODO/FIXME**

Run: search for TODO or FIXME in codebase, resolve any remaining items.

**Step 2: Final build + test**

Run: `npm run build && npm test`
Expected: Clean build, all tests pass

**Step 3: Create submission**

Prepare hackathon submission with:
- Project summary
- Technical breakdown
- Repository link
- Testable version link (or instructions)
- Screenshots or video demonstration

**Step 4: Final commit and tag**

```bash
git add -A
git commit -m "chore: final polish for hackathon submission"
git tag v0.1.0
```

---

## File Structure (Final)

```
fiber-pilot/
├── .gitignore
├── .mcp.json                          # Claude Code MCP config
├── package.json
├── tsconfig.json
├── README.md
├── docs/
│   └── plans/
│       ├── 2026-03-07-fiber-pilot-design.md
│       └── 2026-03-07-fiber-pilot-implementation.md
└── src/
    ├── index.ts                       # Entry point, wires everything together
    ├── fiber-rpc.ts                   # JSON-RPC client for Fiber node
    ├── fiber-rpc.test.ts              # RPC client tests
    ├── safety.ts                      # Safety layer (limits, approvals)
    ├── safety.test.ts                 # Safety layer tests
    ├── audit.ts                       # Audit trail logger
    ├── audit.test.ts                  # Audit logger tests
    └── tools/
        ├── channels.ts                # Channel management tools (4 tools)
        ├── payments.ts                # Payment & routing tools (4 tools)
        ├── network.ts                 # Network intelligence tools (4 tools)
        ├── analysis.ts                # Smart analysis tools (3 tools)
        └── safety-tools.ts            # Safety & audit tools (2 tools)
```

## Total: 16 MCP tools across 5 modules
