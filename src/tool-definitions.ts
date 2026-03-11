import type Anthropic from "@anthropic-ai/sdk";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // === Channel Management ===
  {
    name: "fp_list_channels",
    description:
      "List all payment channels with their balances, status, and peer info. Use this to understand current channel state before making decisions.",
    input_schema: {
      type: "object" as const,
      properties: {
        peer_id: { type: "string", description: "Filter by peer ID" },
        include_closed: {
          type: "boolean",
          description: "Include closed channels (default: false)",
        },
      },
      required: [],
    },
  },
  {
    name: "fp_open_channel",
    description:
      "Open a new payment channel with a connected peer. The peer must be connected first (use fp_connect_peer). Funds will be locked in the channel on-chain.",
    input_schema: {
      type: "object" as const,
      properties: {
        peer_id: {
          type: "string",
          description: "The peer public key to open a channel with",
        },
        funding_amount: {
          type: "number",
          description: "Amount of CKB (in shannons) to fund the channel with",
        },
        public: {
          type: "boolean",
          description:
            "Whether the channel should be announced to the network (default: true)",
        },
      },
      required: ["peer_id", "funding_amount"],
    },
  },
  {
    name: "fp_close_channel",
    description:
      "Cooperatively close a payment channel. Funds will be settled on-chain according to the latest balance.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel_id: { type: "string", description: "The channel ID to close" },
        force: {
          type: "boolean",
          description: "Force close the channel unilaterally (default: false)",
        },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "fp_update_channel",
    description:
      "Update channel parameters like routing fees, enabled status, and minimum HTLC amount. Use this to optimize routing fees.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel_id: {
          type: "string",
          description: "The channel ID to update",
        },
        enabled: {
          type: "boolean",
          description: "Enable or disable the channel for routing",
        },
        tlc_fee_proportional_millionths: {
          type: "number",
          description: "Proportional routing fee in millionths",
        },
        tlc_min_value: {
          type: "number",
          description: "Minimum HTLC value in shannons",
        },
        tlc_expiry_delta: {
          type: "number",
          description: "HTLC expiry delta in blocks",
        },
      },
      required: ["channel_id"],
    },
  },

  // === Payment & Routing ===
  {
    name: "fp_send_payment",
    description:
      "Send a payment through the Fiber network to a destination. Automatically finds the best route. Can pay an invoice or send to a node directly.",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice: {
          type: "string",
          description: "Fiber invoice string to pay",
        },
        target_pubkey: {
          type: "string",
          description: "Target node public key (if not using invoice)",
        },
        amount: {
          type: "number",
          description: "Amount in shannons (if not using invoice)",
        },
        timeout: {
          type: "number",
          description: "Payment timeout in seconds (default: 60)",
        },
      },
      required: [],
    },
  },
  {
    name: "fp_create_invoice",
    description:
      "Create a new invoice for receiving payment through the Fiber network.",
    input_schema: {
      type: "object" as const,
      properties: {
        amount: {
          type: "number",
          description: "Amount in shannons to request",
        },
        description: {
          type: "string",
          description: "Human-readable description of the payment",
        },
        expiry: {
          type: "number",
          description: "Invoice expiry in seconds (default: 3600)",
        },
        currency: {
          type: "string",
          description: 'Currency code (default: Fibt for testnet)',
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "fp_get_payment",
    description: "Check the status of a payment by its payment hash.",
    input_schema: {
      type: "object" as const,
      properties: {
        payment_hash: {
          type: "string",
          description: "The payment hash to look up",
        },
      },
      required: ["payment_hash"],
    },
  },
  {
    name: "fp_build_route",
    description:
      "Manually construct a payment route through specific channels and nodes. Useful for circular rebalancing payments.",
    input_schema: {
      type: "object" as const,
      properties: {
        target_pubkey: {
          type: "string",
          description: "Destination node public key",
        },
        amount: { type: "number", description: "Amount in shannons" },
        source_pubkey: {
          type: "string",
          description: "Source node public key (defaults to self)",
        },
      },
      required: ["target_pubkey", "amount"],
    },
  },

  // === Network Intelligence ===
  {
    name: "fp_connect_peer",
    description:
      "Establish a connection to a Fiber network peer. Required before opening a channel with that peer.",
    input_schema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description:
            "Multi-address of the peer, e.g. /ip4/1.2.3.4/tcp/8228/p2p/<peer_id>",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "fp_list_peers",
    description: "Show all currently connected Fiber network peers.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "fp_get_node_info",
    description:
      "Get comprehensive node status including public key, addresses, chain info, and open channel count.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "fp_get_network_graph",
    description:
      "Get the network graph showing all known nodes and channels. Useful for understanding the network structure, finding well-connected nodes, and planning routes.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max number of nodes/channels to return (default: 50)",
        },
      },
      required: [],
    },
  },

  // === Smart Analysis ===
  {
    name: "fp_analyze_channels",
    description:
      "Comprehensive analysis of all channels: balance ratios, capacity utilization, health scores, and actionable recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "fp_suggest_rebalance",
    description:
      "Identifies imbalanced channels and suggests circular payment routes to rebalance them. Returns specific amounts and routes to execute.",
    input_schema: {
      type: "object" as const,
      properties: {
        target_ratio: {
          type: "number",
          description: "Target local balance ratio in percent (default: 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "fp_suggest_fees",
    description:
      "Analyzes your channels and the network graph to suggest optimal routing fees. Considers channel capacity, balance, and network position.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // === Safety & Audit ===
  {
    name: "fp_get_config",
    description:
      "View current safety limits: spending caps, approval thresholds, peer whitelist, and rebalance settings.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "fp_get_audit_log",
    description:
      "View the history of all actions taken by the agent, with timestamps, parameters, and results.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description:
            "Max number of entries to return (default: 20, most recent first)",
        },
      },
      required: [],
    },
  },
];
