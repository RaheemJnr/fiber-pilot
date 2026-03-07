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
