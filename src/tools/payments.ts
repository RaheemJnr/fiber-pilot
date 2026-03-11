import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { FiberRpcClient } from "../fiber-rpc.js";
import { SafetyLayer } from "../safety.js";
import { AuditLog } from "../audit.js";

const SHANNONS_PER_CKB = 100_000_000;

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
      if (amount) {
        const amountCkb = amount / SHANNONS_PER_CKB;
        const check = safety.checkPayment(amountCkb);
        if (!check.allowed) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: "approval_required",
                  action: "send_payment",
                  amount_shannons: amount,
                  amount_ckb: amountCkb,
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

      if (amount) safety.recordSpend(amount / SHANNONS_PER_CKB);
      audit.record({
        tool: "fp_send_payment",
        params: { invoice: invoice ? "[redacted]" : undefined, target_pubkey, amount, amount_ckb: amount ? amount / SHANNONS_PER_CKB : undefined },
        result: "success",
        detail: `Sent payment${amount ? ` of ${amount / SHANNONS_PER_CKB} CKB (${amount} shannons)` : ""}`,
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
      const preimage = `0x${randomBytes(32).toString("hex")}`;
      const params: Record<string, unknown> = {
        amount: `0x${amount.toString(16)}`,
        payment_preimage: preimage,
        currency: currency || "Fibt",
      };
      if (description) params.description = description;
      if (expiry) params.expiry = `0x${expiry.toString(16)}`;

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
