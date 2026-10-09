# Threat model

Assets: original user authorization; merchant recipient binding; authorized
Sandbox funds; review decisions; provider and operator credentials; durable
payment/audit evidence. Attacker-controlled inputs: merchant text, model outputs,
HTTP payloads/headers, intent IDs and arbitrary browser state. Model/provider
availability and network delivery are fallible. The local host, application code,
trusted catalog, provider TLS endpoints and configured Sandbox credentials are
trusted. Database/OS compromise and stolen access tokens are outside that trust
boundary and require operational remediation.

| Threat | Enforced control | Regression evidence |
| --- | --- | --- |
| Product text redirects payee or grants approval | Untrusted text labelled; no execution tools; deterministic recipient/consent checks | Agent obeys attacker yet payment BLOCK |
| Detector misses an injection | Price/item/recipient/budget immutable independently of detection | Raw attacker proposal blocked without injection text |
| Altered amount, currency, item or merchant | Exact trusted catalog and original consent matching | Policy mutation and provider tampering suites |
| Client forges review/order/capture state | Strict request keys; roles; no submitted payment fields | Forged client fields rejected; BLOCK review denied |
| IDOR or review abuse | Shopper owner checks, operator-only review/audit | HTTP history/read/checkout isolation tests |
| Duplicate clicks, replay or concurrent captures | One intent per consent; durable operation UUIDs and leases | Parallel calls, repeated consent/run/capture, SQLite reopen |
| Response lost after provider side effect | Persistent uncertainty; same ID; GET reconciliation | Lost-create and lost-capture tests |
| Late retry outlives provider idempotency | Five-hour POST cutoff; consent expiry; no reset API | Retry-window and expiry tests |
| Cross-site request or DNS/browser abuse | Bearer auth; exact Origin, JSON and custom header; no CORS/cookies | Cross-site/origin/header/content-type tests |
| Brute force, body exhaustion, model billing abuse | Random tokens; per-IP/actor and agent limits; 16KB body; bounded calls/timeouts | Authentication, quota, body-bound and tool-bound tests |
| SSRF / arbitrary tool execution | Two scoped tools; no URL-fetch tool; fixed provider hosts; redirects denied | Unknown/cross-item tools denied; host checks |
| XSS from model/merchant explanations | `textContent` rendering, CSP, external scripts/styles, no HTML insertion | Browser hostile text regression and CSP response check |
| Provider says complete but wrong evidence | GET full order; matching payee/item/amount/reference and completed final capture | Capture mismatch and malformed provider responses |
| Credential leaks | Server-only environment; ignored .env/DB/artifacts; sanitized errors; no raw provider responses | Error secrecy tests and pre-commit scan |

## Residual limits and honest claims

- Pattern detection is incomplete and may flag benign content. Authority checks
  remain the security control. This is a closed catalog commerce workflow; it
  does not browse arbitrary live shops or claim universal injection prevention.
- The operator is trusted to approve within the user's already-granted budget.
  Operator and shopper keys represent two demo principals, not individual logins,
  MFA, session revocation or an enterprise authorization system.
- Consent budgets apply to one single-use grant, not an account-wide running
  balance. A user can explicitly authorize another independent purchase.
- SQLite audit prevents normal application mutation but not privileged disk
  tampering. Files/backup access must be restricted. No encryption-at-rest or
  external immutable log service is claimed.
- Original instruction and bounded proposal context/explanation are retained
  locally for the demo. Do not enter private customer data. There is no retention
  scheduler or self-service deletion interface; define these before real users.
- Providers may return pending captures or partial/error responses. The service
  fails closed and can reconcile existing completed evidence; no refund,
  asynchronous settlement or webhook processing is claimed.
- Loss of the database destroys idempotency evidence. Preserve it and inspect
  outstanding Sandbox orders before using a replacement database. Never reset
  an uncertain order just to make the demo succeed.
- Tests establish behavior with mocks. Real OAuth, model responses, buyer login
  and Sandbox capture remain a separate credentialed acceptance gate.
- Denial events are capped at ten writes/minute/socket IP to limit audit-flood
  disk writes. Rate-limited attacks therefore do not produce an event per request.

Report vulnerabilities privately to the repository owner through an available
private GitHub channel. Do not post access keys or customer/payment data in issues.
