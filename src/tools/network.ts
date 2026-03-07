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
