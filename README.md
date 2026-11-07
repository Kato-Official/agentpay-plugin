# AgentPay plugin for Claude

Payments for AI agents. Your agent gets its own card with a limit you set, clears the bank's 3DS check itself, and checks out in its own browser. Zero taps from you.

This plugin is one skill. It teaches Claude the six AgentPay tools (`complete_purchase`, `get_checkout_status`, `issue_card`, `get_spend_status`, `get_wallet`, `create_topup_link`), the statuses a checkout goes through, and the rules: never above the cap, one card per purchase, 3DS handled by AgentPay, never ask the person for an OTP.

## What it runs and where data goes

- The plugin runs nothing on your computer. It is Markdown, JSON and two PNG images.
- The skill talks about exactly one service, the AgentPay API at `https://api.joomjoo.com`, which Claude calls only when you ask it to buy or check something, with the API key you give it or through the AgentPay MCP server you add yourself.
- The plugin stores nothing. Your AgentPay account keeps its own purchase history, which you see in the console at https://app.agentpay.global.
- The agent never sees a full card number. AgentPay mints the card at the final review and pays inside its own browser.

## Install

From Anthropic's directory on claude.ai, or in Claude Code:

```
claude plugin marketplace add Kato-Official/agentpay-plugin
claude plugin install agentpay@agentpay
```

Get a key at https://app.agentpay.global, Developer, API keys. Sign-up is open and free to start.

## The tools as MCP tools, optional

To have the six tools appear as tools in Claude Code rather than as API calls, add the AgentPay MCP server once, with your own key:

```
claude mcp add agentpay --env AGENTPAY_API_KEY=YOUR_AGENTPAY_API_KEY -- npx -y @agentpay-global/mcp
```

## Two modes

- Asks you first (default): every purchase waits for your yes in the console, however small.
- Buys on its own: pays without asking, never past the card's limit.

## Elsewhere

Links: [website](https://agentpay.global), [docs](https://agentpay.global/docs), [privacy](https://agentpay.global/legal/privacy.html), [terms](https://agentpay.global/legal/terms.html), [support](https://agentpay.global/contact.html). The SDKs, the MCP server and the raw tool schemas live in [Kato-Official/agentpay-skills](https://github.com/Kato-Official/agentpay-skills).

MIT License, Joomjoo LLC.
