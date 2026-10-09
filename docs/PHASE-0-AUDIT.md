# Starter audit — October 9, 2026

Inspected every supplied file before modification: server, policy, browser app,
HTML/CSS, seven tests, package metadata, README, license, environment example
and ignore rules. No Git checkout or dependencies were present. The expected
remote returned no refs, so the starter was preserved in a new local repository.

## Recorded baseline

- `npm test`: 7 passed, 0 failed.
- `npm run check`: failed because the script did not exist.
- Once syntax checking was added, it exposed an extra closing brace in
  `public/app.js`, which prevented the starter dashboard script from parsing.
  The brace was fixed; the 7 tests and new check both passed.
- Node runtime: 24.18.0. No packages required by the starter.

## Findings

| Area | Existing behavior | Required correction |
| --- | --- | --- |
| Policy | Catalog, fixed limits, recipient/currency checks, regex | User-issued immutable authorization, expiry, item/budget binding |
| AI | Hand-authored browser samples | Real bounded model tools and explicitly labelled deterministic fallback |
| PayPal | OAuth/create/show/capture | Explicit Sandbox merchant, recipient and completed capture verification, safe approval links |
| Concurrency | Async check-then-act, in-memory Map | Durable claims, stable operation IDs, bounded retries, reconciliation |
| Audit | Mutable memory; old records silently evicted | Persistent append-only application events and transaction history |
| Review | Optional shared bearer token; no owner isolation | Mandatory authentication, scoped shopper/operator roles, ownership checks |
| HTTP | Loopback default, CSP, bounded body | Origin/CSRF protection, content type, rate limits, redacted errors/timeouts |
| UI | Three policy samples, basic verdict | Original authorization, agent provenance, honest provider status and history |
| Delivery | Seven policy tests and brief README | Integration/security/E2E tests, CI, threat model, demo/deployment guide |

Regex patterns are only supplemental evidence. Security must hold even if a
model obeys malicious content or a detector misses it. There was no evidence
of a real Sandbox payment or model call in this audit.

## Foundation decisions retained

Keep the dependency-free Node HTTP app, ES modules, trusted catalog, deterministic
ALLOW/REVIEW/BLOCK vocabulary, Sandbox-only API and KRAXXSEC visual direction.
Use Node's bundled SQLite for durable single-instance hackathon storage; require
Node 24.18+ rather than adding an external database/service dependency.
