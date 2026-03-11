import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FiberRpcClient } from "../fiber-rpc.js";
import { SafetyLayer } from "../safety.js";
import { AuditLog } from "../audit.js";

const SHANNONS_PER_CKB = 100_000_000;

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
        detail: "Listed channels",
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
      const peerCheck = safety.checkPeer(peer_id);
      if (!peerCheck.allowed) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status: "blocked", reason: peerCheck.reason }) }],
        };
      }

      const amountCkb = funding_amount / SHANNONS_PER_CKB;
      const amountCheck = safety.checkChannelOpen(amountCkb);
      if (!amountCheck.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "approval_required",
                action: "open_channel",
                amount_shannons: funding_amount,
                amount_ckb: amountCkb,
                reason: amountCheck.reason,
              }),
            },
          ],
        };
      }

      const params: Record<string, unknown> = {
        pubkey: peer_id,
        funding_amount: `0x${funding_amount.toString(16)}`,
      };
      if (isPublic !== undefined) params.public = isPublic;

      const result = await rpc.call("open_channel", [params]);

      safety.recordSpend(amountCkb);
      audit.record({
        tool: "fp_open_channel",
        params: { peer_id, funding_amount, amount_ckb: amountCkb },
        result: "success",
        detail: `Opened channel with ${amountCkb} CKB (${funding_amount} shannons) to peer ${peer_id}`,
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
      const params: Record<string, unknown> = { channel_id };
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
