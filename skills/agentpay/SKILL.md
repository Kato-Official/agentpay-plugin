---
name: agentpay
description: Give an AI agent its own payment card and let it buy things safely. Use when the agent must pay for something online (a domain, a subscription, an order, a purchase on any website), needs a virtual card with a spend limit, has to complete a checkout on a merchant site, or has to check whether a purchase went through. AgentPay issues the card, drives the checkout in a real browser, clears the bank's 3DS check, and never spends above the cap.
---

# AgentPay, payments for AI agents

AgentPay gives an agent three things it did not have: its own cards with a limit the person sets, the ability to clear the bank's security check (3DS) on its own, and its own browser with its own merchant logins so it can check out alone.

This plugin brings six MCP tools, served by the `agentpay` server it installs. The person entered their AgentPay API key once when they enabled the plugin; the server holds it and you never see it, type it or ask for it. Use the tools. Do not call the API with curl or write code that reads a key.

## The six tools

### complete_purchase: hand AgentPay the whole checkout (preferred)

Give `task` (plain English), `merchant` and `amount` (the most you may spend, in US dollars). AgentPay opens the merchant in its own browser, uses the person's stored login when there is one, reaches the final review, pays with the agent's own card or mints a single-use card for the real total plus a small margin (never above the cap), pays, and clears 3DS itself. The card number never touches you.

- `confirm_pay: false` (default): the run stops at the final review and waits for the person's yes in the AgentPay console. `confirm_pay: true`: pay without a human yes, up to the cap. The person's own approval mode for their agent can only make this stricter; the response's `confirm_pay` says what was granted.
- The answer is `checkout_id` and `status: "queued"`. A checkout takes one to three minutes. Poll it with `get_checkout_status`.

### get_checkout_status: poll until a terminal status

Call it every 30 seconds with the `checkout_id`. Statuses and what to do:

| status | meaning | what you do |
|---|---|---|
| queued, running, paying | AgentPay is working | keep polling |
| needs_login | the merchant wants a signed-in session | the person signs in once at the `connect_url` on the status (you never type a password), then start again |
| needs_answer | AgentPay asked the person a choice (size, delivery slot) in the console | wait, keep polling |
| awaiting_approval | the final review is ready, `review_total` shows the shop's total (a display string such as "60.90 AED") | tell the person to approve in the console, keep polling |
| submitted | paid; `order_id` and `order_total` are set | done, report the order |
| canceled | the person stopped it | stop, nothing was charged |
| blocked | AgentPay stopped (login wall, timeout, cap exceeded); `error_reason` says why | report the reason, do not retry blindly |
| error | the engine failed; nothing was charged and any card was closed | report, retry later |

### issue_card: a real card with a cap, when you must pay yourself

`amount`, `merchant`, `single_use` (default true). Returns `id`, `brand`, `last4`, `exp_month`, `exp_year`, `spend_limit`, `status`, `spend_request_id`. Only for the rare case the agent itself must type a card. Never log or store a card number. A 402 `insufficient_funds` means the wallet needs funding by the person.

### get_spend_status: did the card get charged

Pass the `spend_request_id` from `issue_card`. `status` is `not_started`, `authorized`, `cleared` or `declined`; `settled` is true once the bank cleared it, usually the next day.

### get_wallet: what the account can spend

Returns `balance`, `available` (free to assign to a new card), `reserved` (on open cards), `pending` (bank money not landed yet), in dollars, plus `cards_ready`: open single-use cards that already hold money. Judge affordability by `ready_to_spend`, never by `available` alone.

### create_topup_link: when the wallet is short

`amount` in dollars. Returns a Stripe Checkout `url`. Give it to the person; Stripe takes a card or stablecoin; the wallet is credited the moment Stripe confirms. Never type a card yourself, never ask the person for their card number.

## Rules, always

- Never spend above the cap you were given. One card per purchase; a single-use card locks itself after its first charge.
- Prefer `complete_purchase`. Only issue a card yourself when you truly must type it in.
- Pay only with the AgentPay card; never a card saved on the merchant account.
- 3DS is handled by AgentPay. Never ask the person for an OTP.
- Never put a card number or a CVC in a log, a message, a file or a prompt.
- Errors carry a machine code (`invalid_api_key`, `expired_api_key`, `plan_limit`, `agent_paused`, `busy`, `checkout_not_found`) and a message written for the person; pass the message on as it is.

## Outside this plugin

The same six tools exist as `@agentpay-global/sdk` (npm), `agentpay-global` (PyPI), the `@agentpay-global/mcp` server for other MCP clients, and the REST API documented at https://agentpay.global/docs. Everything in this repository is the plugin for Claude Code, Cowork and the Claude apps.
