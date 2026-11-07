# AgentPay plugin for Claude

Payments for AI agents. Your agent gets its own card with a limit you set, clears the bank's 3DS check itself, and checks out in its own browser. Zero taps from you.

This plugin gives Claude one skill and one MCP server with six tools: `complete_purchase`, `get_checkout_status`, `issue_card`, `get_spend_status`, `get_wallet` and `create_topup_link`.

## What it runs and where data goes

- The MCP server is `mcp/server.mjs`, a single readable file with no dependencies. Claude Code starts it with Node.
- It talks to exactly one service, the AgentPay API at `https://api.joomjoo.com`, over HTTPS.
- When you enable the plugin, Claude Code asks you once for your AgentPay API key and keeps it in your secure credential store. It hands the key only to this server, which sends it as the Authorization header to the AgentPay API. Nothing is written to disk.
- The server stores nothing. Your AgentPay account keeps its own purchase history, which you see in the console at https://app.agentpay.global.
- The agent never sees a full card number. AgentPay mints the card at the final review and pays inside its own browser.

## Install

From Anthropic's directory on claude.ai, or in Claude Code:

```
claude plugin marketplace add Kato-Official/agentpay-plugin
claude plugin install agentpay@agentpay
```

Get a key at https://app.agentpay.global, Developer, API keys. Sign-up is open and free to start.

## Two modes

- Asks you first (default): every purchase waits for your yes in the console, however small.
- Buys on its own: pays without asking, never past the card's limit.

## Elsewhere

Links: [website](https://agentpay.global), [docs](https://agentpay.global/docs), [privacy](https://agentpay.global/legal/privacy.html), [terms](https://agentpay.global/legal/terms.html), [support](https://agentpay.global/contact.html). The SDKs, the standalone MCP server and the raw tool schemas live in [Kato-Official/agentpay-skills](https://github.com/Kato-Official/agentpay-skills).

MIT License, Joomjoo LLC.
