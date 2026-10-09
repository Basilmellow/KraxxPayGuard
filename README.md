# Kraxx PayGuard

Security gateway for agentic commerce. A deterministic server-controlled Payment Intent Firewall issues **ALLOW / REVIEW / BLOCK** decisions before any PayPal Sandbox order can be created.

## Start

Requires Node.js 22+. Run `npm start` and open http://127.0.0.1:3000. Run `npm test` for policy tests. No dependencies to install.

Create `.env` from `.env.example` and supply PayPal Sandbox `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` for actual API calls. Without credentials, payment creation fails transparently. Never commit secrets.

## Sprint 1 status

- Working policy engine and trusted product catalog.
- Three demo scenarios, review/approval and in-memory audit log.
- PayPal Orders v2 Sandbox create, payer approval URL, server-side pre-capture checks and capture API.
- API restricted to loopback by default, optional bearer-token protection on remote binds.
- Test suite for policy invariants.

**Important limitations:** prototype only; no production login, database, CSRF defenses for cookie-based sessions (none are used), webhooks, verified real Sandbox payment execution, or real AI agent yet. No AI model is claimed to be integrated. Authorization is a demonstration fixed policy rather than real consent issuance. PayPal merchant identity in the prototype is conceptual, and sandbox account setup is required. Do not expose publicly without replacing the authentication/authorization approach. NEVER use for live payments. No live PayPal endpoint is configured.

## Security model

The AI agent controls proposed intent fields and may provide untrusted text. It cannot modify server policy, trusted catalog price, merchant, payee or limits. The decision engine checks structural invariants and indicative injection patterns. Regex detection is defense-in-depth, not a complete prompt-injection solution. Operator review must not be used to bypass BLOCK.

## Next milestones

Real PayPal sandbox end-to-end tests, persistent audit database, human authentication and approval permissions, a genuine agent workflow, adversarial test suite, optional AI explanation integration, CI and deployment, demo video, submission documentation.
