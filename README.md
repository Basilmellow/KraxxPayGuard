# Kraxx PayGuard

**Money moves only when intent is verified.** A KRAXXSEC Payment Intent Firewall
for autonomous shopping agents and PayPal Sandbox, built from the Sprint 1
foundation for the PayPal AI Hackathon 2026.

An authenticated user authorizes one catalog item, recipient and spending budget.
A bounded agent reads merchant content and proposes a payment. Independent
server policy returns **ALLOW / REVIEW / BLOCK**. Only eligible proposals can
create an order; PayPal buyer approval and verified capture are separate steps.

## Run locally

Requires **Node 24.18+**, npm and a persistent writable disk. No runtime packages;
SQLite is bundled with Node. Playwright is a development dependency only.

```sh
npm ci
npm run setup
npm start
```

Open http://127.0.0.1:3000. Read the ignored `.env` locally and paste its
`SHOPPER_TOKEN` into Workspace access. Tokens are held in browser memory and
cleared from the input; reconnect after a reload. Use the distinct
`OPERATOR_TOKEN` for human review. Setup refuses to overwrite an existing `.env`.

Choose a scenario, review the original instruction, budget and recipient, tick
the consent box, then **Authorize & run agent**. Deterministic test mode works
without model credentials. It never simulates PayPal transactions in the app.
Real model mode fails closed if credentials or validated tools are unavailable.

## Real providers

For the container build, runtime secrets, persistent `/data` storage and hosted
port 80 routing, see [Astropods deployment](docs/ASTROPODS-DEPLOYMENT.md).

- Use the sponsor **Astropods AI Gateway** with signup credits and no payment
  card. Follow [free setup](docs/FREE-SETUP.md) to configure its gateway credentials.
  Astropods is the default; existing OpenAI keys are ignored. No paid fallback.
- Add the **Sandbox** business app's `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
  and that business account's `PAYPAL_MERCHANT_ID`; restart.
- Create an eligible order, open its verified Sandbox buyer link, log in with a
  separate Sandbox personal account and approve. Return to PayGuard and choose
  **Verify buyer approval & capture**. The server verifies the order and then
  records a matching completed capture. Never enter real payment credentials.

The endpoint is fixed to `https://api-m.sandbox.paypal.com`. OAuth and API
requests reject redirects. The browser cannot supply amount, recipient, order
ID or approval to checkout/capture. Provider status means credentials are
configured; it does **not** prove account connectivity or a successful payment.

See [Sandbox runbook](docs/SANDBOX-RUNBOOK.md) for credential setup and evidence.
No real model call or Sandbox transaction has been verified in this workspace;
the automated suites use provider mocks. Their UI is explicitly labelled
**Mock test provider / Mock test capture**.

## Validate

```sh
npm test
npm run check
npx playwright install chromium
npm run test:e2e
```

Unit/security/integration tests cover immutable consent, budgets, role/owner
isolation, HTTP hardening, agent tool abuse, PayPal mismatches, replay,
concurrency, response loss and SQLite restart behavior. Browser E2E tests exercise
the real dashboard and server with isolated databases and mocked providers.
Screenshots/traces go to ignored `artifacts/`. CI runs all suites without secrets.
`check` checks syntax; it is not a TypeScript typecheck or a security scanner.

## Structure

| Module | Responsibility |
| --- | --- |
| `src/policy.mjs` | Trusted catalog, consent issuance, deterministic decisions |
| `src/agent.mjs` | Responses API, two scoped tools, explicit deterministic fixtures |
| `src/paypal.mjs` | Sandbox OAuth and Orders v2, evidence/link verification |
| `src/payments.mjs` | Independent payment gate, durable claims and reconciliation |
| `src/store.mjs` | SQLite authorizations, intents and append-only audit events |
| `src/server.mjs`, `security.mjs`, `config.mjs` | HTTP routes, auth/ownership, CSRF, limits, configuration |
| `public/` | Responsive KRAXXSEC dashboard; DOM text rendering, no secret persistence |
| `test/`, `e2e/` | Unit/integration/security and Chromium browser regression tests |

## API boundaries

All `/api/*` routes require `Authorization: Bearer <token>`.
All POSTs also require the exact `Origin: APP_ORIGIN`, JSON content type and
`X-PayGuard-Request: 1`. No cookies, query-string tokens, CORS or client approval
callbacks are accepted. Limits are 120 requests/minute per socket IP and actor,
plus 10 agent requests/minute per actor, within one process.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/status`, `/api/catalog` | Authenticated configuration and trusted catalog |
| `POST /api/authorizations` | Explicit structured consent; `Idempotency-Key` required |
| `POST /api/agent/runs` | `{authorizationId, mode}`; one intent per consent |
| `GET /api/intents`, `/api/intents/:id` | Owner records; operator can inspect all |
| `POST /api/intents/:id/review` | Operator only; `{approve: boolean}` for pending REVIEW |
| `POST /api/intents/:id/checkout` | Empty object; server-owned order fields |
| `POST /api/intents/:id/capture` | Empty object; provider approval and capture verification |
| `GET /api/audit` | Operator-only latest 200 security/authorization/payment events |

Consent expires after 15 minutes and cannot be edited. Each consent grants one
item, not a reusable account-wide balance. Approved REVIEW must remain inside
the original budget. BLOCK and rejected reviews cannot be overridden.

## Deployment and scope

Use a single Node process with persistent local SQLite storage, HTTPS on any
remote bind, a protected operator token, and `APP_ORIGIN` set to the exact public
origin. Follow [deployment guidance](docs/DEPLOYMENT.md). Do not deploy on
ephemeral serverless filesystems or scale horizontally. The two scoped bearer
principals are a controlled hackathon authentication model, not a multi-user
identity system. The demo catalog is synthetic; there is no fulfillment service.
No public deployment has been performed.

There is no webhook receiver: capture completion is established through the
authenticated Orders API, with GET reconciliation on retries. Refunds,
chargebacks, asynchronous settlement notifications and live payments are outside
this candidate's scope. Uncertain/pending responses are never marked completed.

Read the [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT-MODEL.md),
[starter audit](docs/PHASE-0-AUDIT.md), [demo script](docs/DEMO.md), and
[submission checklist](docs/SUBMISSION-CHECKLIST.md). MIT licensed.

Recorded local results: [release validation](docs/RELEASE-VALIDATION.md).
