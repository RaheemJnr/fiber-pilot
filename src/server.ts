#!/usr/bin/env node

import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { FiberRpcClient } from "./fiber-rpc.js";
import { SafetyLayer } from "./safety.js";
import { AuditLog } from "./audit.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import { executeTool } from "./tool-executor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const FIBER_RPC_URL = process.env.FIBER_RPC_URL || "http://127.0.0.1:8227";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

const anthropic = new Anthropic();

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

const SYSTEM_PROMPT = `You are fiber-pilot, an AI assistant that manages a Fiber Network (CKB payment channels) node. You have access to 17 tools that let you inspect, analyze, and control the node.

When users ask about their node, channels, or payments, use the appropriate tools to get real data. Always explain what you're doing and what the results mean in plain language.

Key behaviors:
- When checking node status, call fp_get_node_info and fp_list_peers
- When analyzing channels, call fp_analyze_channels for health assessment
- When asked to rebalance, call fp_suggest_rebalance first, then execute if approved
- When optimizing fees, call fp_suggest_fees first, then apply with fp_update_channel
- When a tool returns "approval_required", explain the safety limit to the user and ask for confirmation
- Format CKB amounts clearly (convert shannons to CKB: 1 CKB = 100,000,000 shannons)
- Be concise but informative. Use bullet points for summaries.
- You are running on CKB testnet with the Fiber Network.`;

interface Session {
  id: string;
  messages: Anthropic.MessageParam[];
  createdAt: number;
}

const sessions = new Map<string, Session>();

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

// Create a new session
app.post("/api/session", (_req, res) => {
  const session: Session = {
    id: randomUUID(),
    messages: [],
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  res.json({ sessionId: session.id });
});

// Node status (lightweight)
app.get("/api/node-status", async (_req, res) => {
  try {
    const info = await rpc.call<Record<string, unknown>>("node_info", []);
    res.json({
      connected: true,
      publicKey: info.pubkey,
      channelCount: parseInt(info.channel_count as string, 16),
      peerCount: parseInt(info.peers_count as string, 16),
      version: info.version,
    });
  } catch {
    res.json({ connected: false });
  }
});

// Main chat endpoint with SSE streaming
app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  session.messages.push({ role: "user", content: message });

  try {
    let continueLoop = true;
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (continueLoop && iterations < MAX_ITERATIONS) {
      iterations++;

      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages: session.messages,
      });

      // Collect content blocks as they stream
      let currentToolId = "";
      let currentToolName = "";

      stream.on("text", (text) => {
        sendEvent("text_delta", { text });
      });

      stream.on("contentBlock", (block) => {
        if (block.type === "tool_use") {
          currentToolId = block.id;
          currentToolName = block.name;
          sendEvent("tool_call_start", { id: block.id, name: block.name, input: block.input });
        }
      });

      const finalMessage = await stream.finalMessage();

      // Add assistant response to history
      session.messages.push({ role: "assistant", content: finalMessage.content });

      if (finalMessage.stop_reason === "tool_use") {
        // Execute tool calls and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of finalMessage.content) {
          if (block.type === "tool_use") {
            const startTime = Date.now();
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              rpc,
              safety,
              audit
            );
            const duration = Date.now() - startTime;

            sendEvent("tool_call_result", {
              id: block.id,
              name: block.name,
              result,
              duration_ms: duration,
            });

            // Check for approval_required
            if (
              result &&
              typeof result === "object" &&
              "status" in (result as Record<string, unknown>) &&
              (result as Record<string, unknown>).status === "approval_required"
            ) {
              sendEvent("approval_required", {
                id: block.id,
                tool: block.name,
                ...(result as Record<string, unknown>),
              });
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        // Add tool results to history
        session.messages.push({ role: "user", content: toolResults });
      } else {
        continueLoop = false;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    sendEvent("error", { message });
  }

  sendEvent("done", {});
  res.end();
});

app.listen(PORT, () => {
  console.log(`fiber-pilot web UI: http://localhost:${PORT}`);
  console.log(`Fiber RPC: ${FIBER_RPC_URL}`);
  console.log(`Claude model: ${MODEL}`);
});
