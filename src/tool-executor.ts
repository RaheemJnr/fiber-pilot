import { randomBytes } from "node:crypto";
import { FiberRpcClient } from "./fiber-rpc.js";
import { SafetyLayer } from "./safety.js";
import { AuditLog } from "./audit.js";

const SHANNONS_PER_CKB = 100_000_000;

interface ChannelInfo {
  channel_id: string;
  peer_id: string;
  local_balance: string;
  remote_balance: string;
  state: { state_name: string };
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

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  rpc: FiberRpcClient,
  safety: SafetyLayer,
  audit: AuditLog
): Promise<unknown> {
  try {
    switch (name) {
      // === Channel Tools ===
      case "fp_list_channels": {
        const params: Record<string, unknown> = {};
        if (input.peer_id) params.peer_id = input.peer_id;
        if (input.include_closed) params.include_closed = input.include_closed;
        const result = await rpc.call("list_channels", [params]);
        audit.record({ tool: name, params: input as Record<string, unknown>, result: "success", detail: "Listed channels" });
        return result;
      }

      case "fp_open_channel": {
        const peerId = input.peer_id as string;
        const fundingAmount = input.funding_amount as number;

        const peerCheck = safety.checkPeer(peerId);
        if (!peerCheck.allowed) return { status: "blocked", reason: peerCheck.reason };

        const amountCkb = fundingAmount / SHANNONS_PER_CKB;
        const amountCheck = safety.checkChannelOpen(amountCkb);
        if (!amountCheck.allowed) {
          return {
            status: "approval_required",
            action: "open_channel",
            amount_shannons: fundingAmount,
            amount_ckb: amountCkb,
            reason: amountCheck.reason,
          };
        }

        const params: Record<string, unknown> = {
          pubkey: peerId,
          funding_amount: `0x${fundingAmount.toString(16)}`,
        };
        if (input.public !== undefined) params.public = input.public;

        const result = await rpc.call("open_channel", [params]);
        safety.recordSpend(amountCkb);
        audit.record({
          tool: name,
          params: { peer_id: peerId, funding_amount: fundingAmount, amount_ckb: amountCkb },
          result: "success",
          detail: `Opened channel with ${amountCkb} CKB`,
        });
        return result;
      }

      case "fp_close_channel": {
        const params: Record<string, unknown> = { channel_id: input.channel_id };
        if (input.force) params.force = input.force;
        const result = await rpc.call("shutdown_channel", [params]);
        audit.record({
          tool: name,
          params: input as Record<string, unknown>,
          result: "success",
          detail: `${input.force ? "Force closed" : "Closed"} channel ${input.channel_id}`,
        });
        return result;
      }

      case "fp_update_channel": {
        const params: Record<string, unknown> = { channel_id: input.channel_id };
        if (input.enabled !== undefined) params.enabled = input.enabled;
        if (input.tlc_fee_proportional_millionths !== undefined)
          params.tlc_fee_proportional_millionths = `0x${(input.tlc_fee_proportional_millionths as number).toString(16)}`;
        if (input.tlc_min_value !== undefined)
          params.tlc_min_value = `0x${(input.tlc_min_value as number).toString(16)}`;
        if (input.tlc_expiry_delta !== undefined)
          params.tlc_expiry_delta = `0x${(input.tlc_expiry_delta as number).toString(16)}`;

        const result = await rpc.call("update_channel", [params]);
        audit.record({
          tool: name,
          params: input as Record<string, unknown>,
          result: "success",
          detail: `Updated channel ${input.channel_id}`,
        });
        return result;
      }

      // === Payment Tools ===
      case "fp_send_payment": {
        const amount = input.amount as number | undefined;
        if (amount) {
          const amountCkb = amount / SHANNONS_PER_CKB;
          const check = safety.checkPayment(amountCkb);
          if (!check.allowed) {
            return {
              status: "approval_required",
              action: "send_payment",
              amount_shannons: amount,
              amount_ckb: amountCkb,
              reason: check.reason,
            };
          }
        }

        const params: Record<string, unknown> = {};
        if (input.invoice) params.invoice = input.invoice;
        if (input.target_pubkey) params.target_pubkey = input.target_pubkey;
        if (amount) params.amount = `0x${amount.toString(16)}`;
        if (input.timeout) params.timeout = `0x${(input.timeout as number).toString(16)}`;

        const result = await rpc.call("send_payment", [params]);
        if (amount) safety.recordSpend(amount / SHANNONS_PER_CKB);
        audit.record({
          tool: name,
          params: { target_pubkey: input.target_pubkey, amount },
          result: "success",
          detail: `Sent payment${amount ? ` of ${amount / SHANNONS_PER_CKB} CKB` : ""}`,
        });
        return result;
      }

      case "fp_create_invoice": {
        const amount = input.amount as number;
        const preimage = `0x${randomBytes(32).toString("hex")}`;
        const params: Record<string, unknown> = {
          amount: `0x${amount.toString(16)}`,
          payment_preimage: preimage,
          currency: (input.currency as string) || "Fibt",
        };
        if (input.description) params.description = input.description;
        if (input.expiry) params.expiry = `0x${(input.expiry as number).toString(16)}`;

        const result = await rpc.call("new_invoice", [params]);
        audit.record({
          tool: name,
          params: { amount, description: input.description },
          result: "success",
          detail: `Created invoice for ${amount / SHANNONS_PER_CKB} CKB`,
        });
        return result;
      }

      case "fp_get_payment": {
        return await rpc.call("get_payment", [{ payment_hash: input.payment_hash }]);
      }

      case "fp_build_route": {
        const params: Record<string, unknown> = {
          target_pubkey: input.target_pubkey,
          amount: `0x${(input.amount as number).toString(16)}`,
        };
        if (input.source_pubkey) params.source_pubkey = input.source_pubkey;
        return await rpc.call("build_router", [params]);
      }

      // === Network Tools ===
      case "fp_connect_peer": {
        const result = await rpc.call("connect_peer", [{ address: input.address }]);
        audit.record({
          tool: name,
          params: input as Record<string, unknown>,
          result: "success",
          detail: `Connected to peer at ${input.address}`,
        });
        return result;
      }

      case "fp_list_peers": {
        return await rpc.call("list_peers", []);
      }

      case "fp_get_node_info": {
        return await rpc.call("node_info", []);
      }

      case "fp_get_network_graph": {
        const limit = (input.limit as number) || 50;
        const [nodes, channels] = await Promise.all([
          rpc.call("graph_nodes", [{ limit: `0x${limit.toString(16)}` }]),
          rpc.call("graph_channels", [{ limit: `0x${limit.toString(16)}` }]),
        ]);
        return { nodes, channels };
      }

      // === Analysis Tools ===
      case "fp_analyze_channels": {
        const raw = await rpc.call<{ channels: ChannelInfo[] }>("list_channels", [{}]);
        const channels = (raw.channels || []).map(enrichChannel);

        const analysis = {
          summary: {
            total_channels: channels.length,
            total_capacity: channels.reduce((s, c) => s + (c.total_capacity || 0), 0),
            total_local_balance: channels.reduce((s, c) => s + (c.local_balance_num || 0), 0),
            total_remote_balance: channels.reduce((s, c) => s + (c.remote_balance_num || 0), 0),
          },
          channels: channels.map((ch) => {
            const ratio = ch.local_ratio || 0;
            let health: string, recommendation: string;
            if (ratio >= 80) {
              health = "IMBALANCED_LOCAL";
              recommendation = `Channel is ${ratio}% on your side. Consider rebalancing.`;
            } else if (ratio <= 20) {
              health = "IMBALANCED_REMOTE";
              recommendation = `Only ${ratio}% on your side. Limited outbound capacity.`;
            } else if (ratio >= 40 && ratio <= 60) {
              health = "HEALTHY";
              recommendation = "Well-balanced. No action needed.";
            } else {
              health = "ACCEPTABLE";
              recommendation = "Acceptable but could be improved.";
            }
            return {
              channel_id: ch.channel_id,
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
        audit.record({ tool: name, params: {}, result: "success", detail: `Analyzed ${channels.length} channels` });
        return analysis;
      }

      case "fp_suggest_rebalance": {
        const target = ((input.target_ratio as number) || 50) / 100;
        const raw = await rpc.call<{ channels: ChannelInfo[] }>("list_channels", [{}]);
        const channels = (raw.channels || []).map(enrichChannel);
        const suggestions = channels
          .filter((ch) => Math.abs((ch.local_ratio || 0) / 100 - target) > 0.15)
          .map((ch) => {
            const currentLocal = ch.local_balance_num || 0;
            const total = ch.total_capacity || 0;
            const targetLocal = Math.round(total * target);
            const rebalanceAmount = currentLocal - targetLocal;
            return {
              channel_id: ch.channel_id,
              current_local_ratio: ch.local_ratio,
              target_local_ratio: Math.round(target * 100),
              rebalance_amount: rebalanceAmount,
              direction: rebalanceAmount > 0 ? "send_out" : "receive_in",
            };
          });
        audit.record({ tool: name, params: { target_ratio: input.target_ratio }, result: "success", detail: `Found ${suggestions.length} to rebalance` });
        return { target_ratio_pct: Math.round(target * 100), suggestions };
      }

      case "fp_suggest_fees": {
        const [rawCh, graphCh] = await Promise.all([
          rpc.call<{ channels: ChannelInfo[] }>("list_channels", [{}]),
          rpc.call<{ channels: Array<{ fee_rate?: string }> }>("graph_channels", [{ limit: "0x64" }]),
        ]);
        const channels = (rawCh.channels || []).map(enrichChannel);
        const fees = (graphCh.channels || []).map((c) => (c.fee_rate ? parseHex(c.fee_rate) : 0)).filter((f) => f > 0);
        const avgFee = fees.length > 0 ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : 1000;

        const suggestions = channels.map((ch) => {
          const ratio = (ch.local_ratio || 0) / 100;
          let fee: number, reasoning: string;
          if (ratio > 0.7) {
            fee = Math.round(avgFee * 0.7);
            reasoning = "Heavy local side. Lower fees to encourage outbound routing.";
          } else if (ratio < 0.3) {
            fee = Math.round(avgFee * 1.5);
            reasoning = "Limited outbound. Raise fees for scarce liquidity.";
          } else {
            fee = avgFee;
            reasoning = "Balanced. Use network average.";
          }
          return { channel_id: ch.channel_id, local_ratio_pct: ch.local_ratio, suggested_fee_proportional_millionths: fee, reasoning };
        });
        audit.record({ tool: name, params: {}, result: "success", detail: `Fee suggestions for ${suggestions.length} channels` });
        return { network_average_fee: avgFee, suggestions };
      }

      // === Safety Tools ===
      case "fp_get_config": {
        return safety.getConfig();
      }

      case "fp_get_audit_log": {
        const limit = (input.limit as number) || 20;
        const entries = audit.getEntries(limit);
        return { total_actions: entries.length, entries };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    audit.record({
      tool: name,
      params: input as Record<string, unknown>,
      result: "error",
      detail: message,
    });
    return { error: message };
  }
}
