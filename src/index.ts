#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FiberRpcClient } from "./fiber-rpc.js";
import { SafetyLayer } from "./safety.js";
import { AuditLog } from "./audit.js";
import { registerChannelTools } from "./tools/channels.js";
import { registerPaymentTools } from "./tools/payments.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerSafetyTools } from "./tools/safety-tools.js";

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
registerPaymentTools(server, rpc, safety, audit);
registerNetworkTools(server, rpc, audit);
registerAnalysisTools(server, rpc, audit);
registerSafetyTools(server, safety, audit);

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
