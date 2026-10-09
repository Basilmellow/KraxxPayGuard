# Functionality check — October 9, 2026

Tested the running local app with its configured credentials after a report of
non-working functionality. No secrets or raw provider responses were displayed.

## Observed local flows

- Shopper and operator authentication: HTTP 200.
- Catalog, saved history and operator audit access: HTTP 200.
- Deterministic notebook/console/injection: ALLOW / REVIEW / BLOCK as intended.
- Shopper review attempt: denied with HTTP 403.
- Operator approval for pending REVIEW: HTTP 200.
- BLOCK checkout: HTTP 403; operator override attempt: HTTP 409.
- Real model scenarios: failed closed. Direct provider diagnostics identified
  **OpenAI HTTP 429, insufficient_quota / credit_balance_exhausted**.
- Real Sandbox checkout: failed before order creation. Direct OAuth diagnostics
  identified **PayPal HTTP 401, invalid_client**, with no access token issued.
- No buyer approval or capture was initiated during this check.

## Corrections

The workspace access form now names SHOPPER_TOKEN and OPERATOR_TOKEN explicitly.
Provider configuration labels no longer imply a tested connection. Changing the
selected scenario clears the old verdict while preserving every saved record.
Agent loading text shows whether authorization or a model call is in progress.

Provider errors now distinguish exhausted model quota, rejected model keys,
temporary model rate limiting and rejected Sandbox credentials, using static,
actionable messages. Raw provider descriptions are neither stored nor exposed.
All payment authorization, immutable consent and idempotency checks remain in force.

After corrections: 62 server tests and 10 Chromium browser tests passed;
syntax and diff checks passed. The local server was restarted with saved data
and credentials preserved.

## Required account corrections

- Enter the value after SHOPPER_TOKEN= from the local ignored .env to shop;
  use OPERATOR_TOKEN for human review. Provider keys do not unlock the workspace.
- Resolve OpenAI API credits/quota for the configured API account. A credential
  presence indicator does not establish available model quota.
- Use a matching client ID and secret from the same PayPal **Sandbox** REST app.
  Confirm its business merchant ID also matches. Restart after environment edits.
- Then issue fresh consent for a new real-model run and follow the Sandbox
  runbook. Preserve existing payment records and request IDs.

Provider readiness remains blocked by these external account/credential errors.
No successful model response or real Sandbox transaction is claimed.
