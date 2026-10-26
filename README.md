# Kraxx PayGuard

**Your agent chooses. Your mandate decides.** A buyer-side Payment Intent Firewall by **KRAXXSEC**, built for the PayPal AI Hackathon 2026.

A buyer explicitly authorizes a product set, approved merchants, categories, beneficiary label and spending limits. An agent compares bounded catalog offers and proposes one purchase. The server independently enforces **ALLOW / REVIEW / BLOCK** before PayPal Sandbox execution. Merchant text and model output cannot grant permission, redirect funds, change prices or approve themselves.

## Try the guided demo without keys or credits

Requires **Node 24.18+**. There are no runtime npm dependencies.

```sh
git clone https://github.com/Basilmellow/KraxxPayGuard.git
cd KraxxPayGuard
node scripts/judge.mjs
```

Open **http://127.0.0.1:3005/judge**. This read-only walkthrough evaluates synthetic proposals through the real server firewall, exposes no privileged principal, makes no model/payment calls and loads no `.env`. Its in-memory data is deliberately temporary; it cannot touch payment history or execute purchases. It remains reproducible if sponsor credits or hosted access are unavailable.

Hosted workspace: [PayGuard](https://payguard-dc9871843ad4fa4b.agents.astropods.ai/). Astropods sign-in protects its front door. The guided `/judge` view needs no application token, but hosted visitors still need platform access. Real agent, review and payment actions require separately issued workspace tokens. No public shopper or operator key is supplied. See [judge access](docs/JUDGING.md).

## Run the authenticated application

```sh
npm ci
npm run setup
npm start
```

Open http://127.0.0.1:3000. Read the ignored `.env` locally and paste the value after `SHOPPER_TOKEN=` into Workspace access. Use the distinct `OPERATOR_TOKEN` for pending human reviews. Setup never overwrites an existing `.env`. Tokens remain only in page memory and clear from the input and on reload.

Choose up to three eligible offers, explicitly approve their merchant/category scope, set the beneficiary label, budget and automatic limit, then tick consent. Natural-language instructions provide context; the displayed typed fields grant authority. One immutable, 15-minute mandate can reserve one intent and buy one item. The agent may read up to three approved offers within four provider steps.

The synthetic six-product catalog has two demonstration stores. An unconfigured second merchant can be evaluated but cannot check out or borrow the first merchant's credentials. [Mandate model and limits](docs/BUYER-MANDATES.md). Legacy single-item ALLOW/REVIEW/BLOCK scenarios remain under Quick demos.

## AI, merchant text and the Attack Lab

Astropods' managed gateway is the default. Configure its runtime gateway URL, key and model through [free sponsor setup](docs/FREE-SETUP.md). The hosted blueprint declares `claude-haiku-4-5`; there is no automatic paid provider fallback. Signup credits are finite. Do not add a payment card for this demo.

The Attack Lab supports fixed attack descriptions and custom lower-trust text of at most 2000 characters. It cannot fetch URLs, add tools or change consent. The explorer keeps the genuine model proposal separate from policy findings. Real-mode failure stays BLOCK. Deterministic mode is visibly labelled and never silently replaces a failed model. It uses explicit synthetic proposal mutations; it does not interpret custom text.

```sh
npm run evaluate:attacks
```

The [recorded evaluation](docs/ATTACK-EVALUATION.md) concerns **synthetic policy tests, not model robustness**: 9 unauthorized proposals and 3 benign controls. Typed mandates use text signals as advisory; immutable authority checks enforce the boundary. Legacy scenarios retain their conservative detector veto.

## Real PayPal acceptance — still a release gate

Set the matching **Sandbox** business app Client ID, separate Secret and merchant ID in the server environment. Never use live credentials. Secondary-merchant credentials are optional and separate. Then restart.

ALLOW permits order creation. REVIEW needs an independently authenticated operator; BLOCK has no override. A separate Personal Sandbox buyer must approve the provider order before capture. The server verifies item, recipient, exact amount/currency, intent/consent references and one completed final capture. Return-page parameters are not approval evidence.

On **26 October 2026**, real Sandbox OAuth, ALLOW/approved-REVIEW order creation, and GET field verification succeeded. PayPal rejected buyer approval with a seller-currency error. Both orders remain `PAYER_ACTION_REQUIRED`; **no real completed capture is claimed**. They and their operation UUIDs are preserved. See the [provider acceptance report](docs/PAYPAL-ACCEPTANCE.md) and [Sandbox runbook](docs/SANDBOX-RUNBOOK.md). Automated payment tests use mocks.

## Evidence and security boundaries

- SQLite immutable consent, append-only application audit and one intent per grant.
- Stable create/capture UUIDs, transactional leases and GET reconciliation after uncertain responses. No state reset or late duplicate payment shortcut.
- Server-side owner/role checks, exact Origin, JSON/custom-header mutation guard, CSP, bounded bodies, request/model quotas and fixed Sandbox API host.
- Redacted evidence export omits instructions, payloads, beneficiary labels, recipient/provider/operation IDs and principal identities.
- Non-root container with mandatory persistent `/data`, port 80, exact HTTPS origin and a minimal digest-pinned runtime. One replica only.

These are demo principals, not individual enterprise identities. Audit is not tamper-proof against a database administrator. This is a closed catalog with no fulfillment, account-wide spending ledger, refunds, webhooks or live payments. Read the [threat model](docs/THREAT-MODEL.md) before exposing a workspace.

## Validate

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run evaluate:attacks
```

Browser tests use isolated databases and mocked providers; they cover the real dashboard, mandate scope, unsafe proposals, review, redaction, mobile layout and the restricted judge route. Artifacts are ignored. `check` checks JavaScript syntax, not TypeScript types or vulnerabilities. CI runs without real secrets.

## Architecture and API

| Module | Responsibility |
| --- | --- |
| `src/policy.mjs` | Trusted catalog, immutable mandates, independent firewall |
| `src/agent.mjs`, `lab.mjs` | Scoped tools, genuine proposals and controlled merchant data |
| `src/paypal.mjs`, `payments.mjs` | Sandbox evidence verification, provider routing, safe retries |
| `src/store.mjs` | Durable authorization, intent, operation IDs, leases and audit |
| `src/evidence.mjs`, `evaluation.mjs` | Redacted reports and labelled synthetic evaluations |
| `src/server.mjs`, `security.mjs`, `config.mjs` | HTTP authorization and runtime boundary |
| `public/` | Accessible decision explorer and guided walkthrough |

Only `GET /api/judge/demo` is public at the application layer; it contains synthetic fixtures and cannot mutate state. Other `/api/*` routes require a bearer token. POSTs additionally require exact `Origin: APP_ORIGIN`, JSON and `X-PayGuard-Request: 1`. Authorizations require `Idempotency-Key`.

Authenticated routes include status/catalog, authorization issuance, one scoped agent run per grant, owner intent/history, operator review/audit, checkout, capture, lab presets/evaluation and per-intent redacted evidence. Rate limits are process-local: 120 requests/minute per socket IP/principal, plus 10 agent requests/minute per principal. See [architecture](docs/ARCHITECTURE.md).

## Submission

Target release: **9 November 2026**. Deadline: **12 November, 12:00 PM PST** (13 November, 1:30 AM IST). The owner must confirm eligibility and final rules. The [submission checklist](docs/SUBMISSION-CHECKLIST.md), [demo script](docs/DEMO.md), [judging access plan](docs/JUDGING.md), [deployment guide](docs/ASTROPODS-DEPLOYMENT.md) and [container scan limitations](docs/CONTAINER-SECURITY.md) record the remaining gates. This is an MIT-licensed evolution of the preserved Sprint 1 foundation.
