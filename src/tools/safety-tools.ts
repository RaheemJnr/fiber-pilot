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
