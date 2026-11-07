#!/usr/bin/env node
// AgentPay MCP server for the Claude plugin. Zero dependencies: Node 18+ and the MCP stdio protocol
// (newline-delimited JSON-RPC 2.0 on stdin and stdout). It talks to exactly one service, the AgentPay
// API at https://api.joomjoo.com, with the key the person entered when enabling the plugin. Claude Code
// hands that plugin option to this process as CLAUDE_PLUGIN_OPTION_AGENTPAY_API_KEY; nothing else is read.
//
// Tools: issue_card, complete_purchase, get_checkout_status, get_spend_status, get_wallet, create_topup_link.
// Nothing here stores the key, a card number or a response anywhere. Every answer is passed straight back.

import { createInterface } from "node:readline";

const VERSION = "0.3.1";
const BASE_URL = "https://api.joomjoo.com";
const API_KEY = process.env.CLAUDE_PLUGIN_OPTION_AGENTPAY_API_KEY;

function log(message) {
  process.stderr.write(`[agentpay-mcp] ${message}\n`);
}

if (!API_KEY) {
  log("The AgentPay API key option is empty. Enable the AgentPay plugin again and enter your mk_live_ key from app.agentpay.global, Developer, API keys.");
  process.exit(1);
}

// One HTTP call to the AgentPay API. Returns the parsed body or throws with the API's own message.
async function api(method, path, body) {
  const headers = { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const d = data && typeof data === "object" ? data : {};
    const requestId = d.request_id || res.headers.get("X-Mooj-Request-Id") || "n/a";
    const message = d.message || d.error || `AgentPay API error ${res.status}`;
    throw new Error(`AgentPay error ${res.status}${d.error ? " " + d.error : ""}: ${message} (request ${requestId})`);
  }
  return data;
}

function number(description) {
  return { type: "number", description };
}
function string(description) {
  return { type: "string", description };
}
function boolean(description) {
  return { type: "boolean", description };
}
function schema(properties, required) {
  return { type: "object", properties, required, additionalProperties: false };
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const SPEND = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// Every tool: its listing for tools/list and the one API call it makes.
const TOOLS = [
  {
    name: "issue_card",
    title: "Issue a capped card",
    description:
      "Issue a real virtual card capped at `amount` USD for a merchant. Use single_use=true for a one-time purchase (auto-freezes after the first charge). Returns the card and a spend_request_id.",
    inputSchema: schema(
      {
        amount: number("Spend cap in US dollars"),
        merchant: string("The merchant the card is for, for example namecheap"),
        single_use: boolean("Default true. The card locks itself after its first charge"),
      },
      ["amount", "merchant"]
    ),
    annotations: SPEND,
    run: ({ amount, merchant, single_use }) => api("POST", "/v1/cards", { amount, merchant, single_use }),
  },
  {
    name: "complete_purchase",
    title: "Complete a purchase",
    description:
      "Hand AgentPay a plain-English task and a spend cap. AgentPay pays with the agent's own card (or mints one), drives the merchant checkout in its own browser, handles 3DS, and (if confirm_pay=true) pays. Async: returns a checkout_id. A checkout takes one to three minutes: poll get_checkout_status every 30 seconds until status is submitted, blocked, canceled or error, and only then report the result. A status of queued or running means it is working, not that nothing happened. confirm_pay=false (default) stops at the final review for the person's yes.",
    inputSchema: schema(
      {
        task: string("What to buy, in plain English"),
        merchant: string("The merchant to buy from, for example namecheap"),
        amount: number("The most to spend, in US dollars. Becomes the card cap"),
        confirm_pay: boolean("false (default): stop at the final review and wait for the person's yes. true: pay without a human yes, up to the cap"),
      },
      ["task", "merchant", "amount"]
    ),
    annotations: SPEND,
    run: ({ task, merchant, amount, confirm_pay }) => api("POST", "/v1/checkout", { task, merchant, amount, confirm_pay }),
  },
  {
    name: "get_checkout_status",
    title: "Get checkout status",
    description:
      "Poll a complete_purchase run by checkout_id. Status is one of queued, running, needs_login, needs_answer, awaiting_approval, paying, submitted, canceled, blocked, error. queued and running are normal for one to three minutes: wait 30 seconds and poll again until a terminal status (submitted, blocked, canceled, error). review_total and order_total are display strings such as '60.90 AED'; a bare number is USD. order_id is whatever the merchant showed after payment and may be empty.",
    inputSchema: schema({ checkout_id: string("The checkout_id returned by complete_purchase") }, ["checkout_id"]),
    annotations: READ,
    run: ({ checkout_id }) => api("GET", `/v1/checkout/${encodeURIComponent(checkout_id)}`),
  },
  {
    name: "get_spend_status",
    title: "Get spend status",
    description:
      "Check whether a card from issue_card was charged. Pass the spend_request_id. Status is one of not_started, authorized, cleared, declined.",
    inputSchema: schema({ spend_id: string("The spend_request_id returned by issue_card") }, ["spend_id"]),
    annotations: READ,
    run: ({ spend_id }) => api("GET", `/v1/spend/${encodeURIComponent(spend_id)}`),
  },
  {
    name: "get_wallet",
    title: "Get wallet",
    description:
      "The wallet every card and purchase draws on: balance, available (free to assign), reserved (on open cards), pending (bank money in flight), in dollars, plus cards_ready: open single-use cards that already hold money and pay a checkout whose total they cover (the agent's first card, issued at sign-up, is one). Judge affordability by ready_to_spend, never by available alone: available 0.00 with a card in cards_ready means complete_purchase will pay with that card. Prefer calling complete_purchase directly; it answers 402 insufficient_funds only when nothing can pay.",
    inputSchema: schema({}, []),
    annotations: READ,
    run: () => api("GET", "/v1/wallet"),
  },
  {
    name: "create_topup_link",
    title: "Create a top-up link",
    description:
      "When the wallet is short: make a top-up link for `amount` dollars and give it to the person. It opens a Stripe page (card or stablecoin); the wallet is credited the moment Stripe confirms. Never type a card yourself.",
    inputSchema: schema(
      {
        amount: number("Dollars to add"),
        success_url: string("Where the person lands after paying (https). Defaults to the AgentPay console"),
        cancel_url: string("Where the person lands if they cancel (https). Defaults to the AgentPay console"),
      },
      ["amount"]
    ),
    annotations: WRITE,
    run: ({ amount, success_url, cancel_url }) => api("POST", "/v1/wallet/funding-sessions", { amount, success_url, cancel_url }),
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

function listing() {
  return TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations: { title, ...annotations },
  }));
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function callTool(params) {
  const tool = byName.get(params && params.name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${params && params.name}` }], isError: true };
  try {
    const data = await tool.run(params.arguments || {});
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: String((e && e.message) || e) }], isError: true };
  }
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: (params && params.protocolVersion) || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "agentpay", version: VERSION },
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: listing() });
    case "tools/call":
      return reply(id, await callTool(params));
    default:
      if (isRequest) replyError(id, -32601, `Method not found: ${method}`);
      // Notifications such as notifications/initialized need no answer.
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return replyError(null, -32700, "Parse error");
  }
  handle(message).catch((e) => {
    if (message && message.id !== undefined) replyError(message.id, -32603, String((e && e.message) || e));
  });
});
lines.on("close", () => process.exit(0));

log(`ready (stdio, ${VERSION}). Tools: ${TOOLS.map((t) => t.name).join(", ")}`);
