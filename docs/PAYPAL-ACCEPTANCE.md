# PayPal Sandbox acceptance — 26 October 2026

**Release gate: incomplete.** Real OAuth and order creation worked; buyer
approval was rejected by PayPal. No completed capture is claimed.

| Boundary | Observed evidence | Status |
| --- | --- | --- |
| Business OAuth | HTTP 200 from Sandbox token endpoint | Verified |
| ALLOW order creation | HTTP 200; $49 USD order with configured recipient | Verified |
| REVIEW before approval | Server payment service denied without a provider call | Verified |
| REVIEW after operator approval | HTTP 200; $650 USD order | Verified service harness; HTTP role enforcement separately tested with mocks |
| BLOCK execution | Denied; no create or capture request | Verified |
| Order identity | GET HTTP 200 for both orders; item, amount, currency, merchant and consent/intent references matched | Verified |
| Personal buyer approval | User reported seller-currency rejection | Blocked externally |
| Completed capture / reconciliation | Both orders remain PAYER_ACTION_REQUIRED | Not verified; no capture POST attempted |

The exact buyer-page error was: “This seller doesn’t accept payments in your
currency.” Both accounts were previously reported as India-registered. That is
context, not a proven diagnosis. USD balance alone does not prove account/payment
eligibility. Verify Sandbox seller receiving preferences, buyer account type and
country eligibility with PayPal; use a compatible Sandbox account pair.

## Reproduce safely

The credentialed service harness uses **real Sandbox APIs**, explicit
**deterministic agent fixtures**, and an isolated durable acceptance database.
It does not label fixture proposals as model output or touch the hosted DB.

```sh
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs prepare
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs inspect
```

`prepare` reserves one consent and one intent per case with stable operation
UUIDs; it will not create another order for an existing or uncertain attempt.
`inspect` uses GET only. Database, provider identifiers, approval URLs and
sanitized observations are kept in ignored `artifacts/` files. Preserve them.

Only after the Personal Sandbox buyer has approved an existing order, run the
capture-capable harness **with explicit operator authorization**:

```sh
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs reconcile --buyer-approved
```

The application still requires valid, unexpired consent for a fresh capture.
After consent expires, GET inspection may inspect pending orders; only already
completed capture evidence can reconcile without a new payment. Never change
expiry, delete the acceptance DB or reset operation UUIDs to simplify testing.
If a new seller account is needed, reconcile old orders first, then explicitly
authorize a new acceptance run using a separately preserved database.

No Sandbox personal account credentials are stored by this harness. Automated
capture/HTTP regression tests use mocks and remain distinct from this report.
