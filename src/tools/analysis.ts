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
          return Math.abs(ratio - target) > 0.15;
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
          suggestedFee = Math.round(avgNetworkFee * 0.7);
          reasoning =
            "Channel is heavy on local side. Lower fees to encourage outbound routing and rebalance naturally.";
        } else if (ratio < 0.3) {
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
