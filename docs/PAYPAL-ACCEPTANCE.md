# PayPal Sandbox acceptance — 26 October 2026

**Release gate: incomplete.** Real OAuth and order creation previously worked;
buyer approval was rejected by PayPal. No completed real capture is claimed.
Hosted release `e420da3d` / application commit `0b30355` stays unchanged while
acceptance is pending. The acceptance harness changes do not change the app,
payment firewall, database schema or deployment.

## Provider observations

| Boundary | Observed evidence | Status |
| --- | --- | --- |
| Business OAuth | Earlier token request and latest reinspection returned HTTP 200 | Verified |
| ALLOW order creation | Earlier real order for $49 USD with configured recipient | Previously verified |
| REVIEW before approval | Service denied without provider calls | Previously verified; fresh harness also checks checkout and capture denial |
| REVIEW after operator approval | Earlier real $650 USD order | Verified service harness; HTTP role checks separately tested with mocks |
| BLOCK execution | Denied without create/capture | Previously verified; repeated by regression tests |
| Original order identity | Earlier GET 200 for both orders; item, amount, currency, merchant and consent/intent references matched | Previously verified |
| Personal buyer approval | User reported seller-currency rejection; original account pair reportedly India/India | Blocked; actual buyer account type still needs confirmation |
| Latest original order reinspection | OAuth 200; both GET requests returned 404 with `INVALID_RESOURCE_ID` | Current provider status unavailable; cause not established |
| Completed capture / reconciliation | No real capture POST attempted; last successful order status was PAYER_ACTION_REQUIRED | Not verified |
| Fresh compatible account pair | Separate Business/Personal credentials and account confirmation requested | Pending |

Latest inspection scanned both local application and original acceptance SQLite
databases. It found two saved provider order IDs in the acceptance DB and two
older local CREATING attempts without provider order IDs. All intents, consent
records, request IDs and audit rows were unchanged across the read-only
inspection. No order was created, captured, reset, deleted or inferred missing
from a 404. The full provider/order/operation identifiers remain only in ignored
local evidence files and their original SQLite records.

This inspection covers databases under local `data/` and `artifacts/`, not the
hosted persistent volume or every order in the merchant's PayPal account. The
installed Astropods CLI has no shell/database-read command. Hosted history has
not been exported, and Orders v2 GET is an order lookup, not an account-wide
order inventory. Do not claim all hosted/provider orders were inspected.

## Currency and account diagnosis

The buyer-page error was: “This seller doesn't accept payments in your currency.”
The original seller screenshot showed USD as primary. This does not establish
receiving preferences, buyer eligibility or the country rule applied to checkout.

PayPal's [currency reference](https://developer.paypal.com/api/codes/currency)
lists USD and explains that receiving preferences can block currencies or
non-US buyers. PayPal's [India information](https://www.paypal.com/in/digital-wallet/paypal-consumer-fees)
says India accounts support international payments only. The reported
India-to-India pair is therefore a plausible country-eligibility issue, **not a
confirmed diagnosis of this Sandbox error**. GET 404 does not diagnose it.

Read-only account checks still required in the PayPal Sandbox UI:

1. Developer Dashboard → Sandbox → Accounts: confirm exact seller Business and
   buyer Personal account types/countries, without changing/deleting old accounts.
2. Sign into the **Sandbox** seller account: check USD holding currency and
   Payment Receiving Preferences / Block Payments for currency and country
   restrictions. Report settings, not credentials; do not silently change them.
3. Confirm the app used for OAuth belongs to that seller Business account and its
   merchant ID matches the configured recipient. The earlier successful GET
   verified the configured order recipient, not the seller's receiving settings.
4. If unresolved, provide PayPal support the private order/debug evidence through
   a secure support channel; do not publish IDs or secrets in an issue.

For a controlled USD baseline, prepare a fresh **US Sandbox Business seller and
separate US Sandbox Personal buyer**. PayPal documents both roles in
[Sandbox accounts](https://developer.paypal.com/sandbox-testing/accounts) and
US integration testing in [REST setup](https://developer.paypal.com/api/get-started/).
This is test-account configuration, not a real-account country change or a
promise that checkout will succeed.

## Fresh isolated run

Create the new Business account's own **Sandbox REST app** in Developer
Dashboard → Apps & Credentials. Select that Business account when creating the
app; see [PayPal credential setup](https://www.paypal.com/pm/cshelp/article/how-do-i-create-paypal-rest-api-credentials-ts1949?locale.x=en_PM).
Put only the following three matching values in the ignored local file
`artifacts/paypal-new-pair.env`. Keep the old `.env` and all databases unchanged.

```dotenv
PAYPAL_CLIENT_ID=<new-business-sandbox-app-client-id>
PAYPAL_CLIENT_SECRET=<matching-sandbox-app-secret>
PAYPAL_MERCHANT_ID=<that-business-account-merchant-id>
```

Never commit this file or send values in chat. Buyer login details are entered
only on PayPal Sandbox by the human buyer; the harness never stores them. The
new credentials override all three old values together, never partially.

```sh
# Original credentials; inspect every discoverable local database using GET only.
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs inspect

# Start exactly once, only after the fresh account pair and REST app are confirmed.
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs prepare --run us-pair-01 --new-run --case allow --credentials-file artifacts/paypal-new-pair.env

# Read-only verification of that run with its own original credentials.
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs inspect --run us-pair-01 --credentials-file artifacts/paypal-new-pair.env
```

Each named run gets a separate durable directory under
`artifacts/paypal-acceptance-runs/`, a random run identity, isolated SQLite DB,
new consent/intent IDs and stable create/capture request UUIDs. Its immutable
manifest binds the REST client and merchant using a hash; it stores no secret.
Existing directories cannot be reused with `--new-run`. Reusing a prepared case
preserves its original consent, IDs and uncertain state; a previous create
attempt is not automatically retried. A genuinely new attempt requires a
separately named run and explicit authorization; it must never replace or clone
an uncertain capture.

The ignored timestamped evidence JSON contains `buyerApprovalUrl`. Open that
URL with the **new Personal Sandbox buyer**, approve the correct amount/payee,
and report the actual result. Do not prepare REVIEW until ready to approve it;
each case has its own original 15-minute consent.

## Capture gate and evidence

After **actual buyer approval** and **explicit human authorization for this
case's capture**, use:

```sh
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs reconcile --run us-pair-01 --case allow --credentials-file artifacts/paypal-new-pair.env --buyer-approved --authorize-capture
```

These flags attest to approval/authorization; documentation is not permission
to run capture. The harness requires exactly one case, performs GET first and
rejects pending/voided/unapproved orders before claiming a payment lease. The
unchanged payment service independently checks immutable consent, policy,
operator review, expiry, merchant binding and retry limits before any POST.
Already-completed provider evidence may reconcile without a fresh payment after
expiry. Pending expired consent cannot capture. Never adjust expiry or operation
IDs to simplify testing.

After capture the harness GET-verifies amount, currency, merchant, SKU, purchase
reference, consent reference, exactly one completed final capture and capture
ID. It compares the stored capture ID, then repeats the application operation
to verify that duplicate handling returns the same completion without another
capture POST. Inspect the preserved audit and request observations. A capture
response alone, mock success, return URL or buyer attestation is not completion
evidence. If a capture response is lost, preserve the run and inspect/reconcile
that order with the same identifiers; do not create a replacement.

## REVIEW and BLOCK against the same configuration

```sh
# Same run/profile; fresh REVIEW consent. Harness tests pre-review denial for
# checkout and capture, then grants operator review through the service layer.
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs prepare --run us-pair-01 --case review --credentials-file artifacts/paypal-new-pair.env

# Only after that order's actual buyer approval and explicit capture authorization.
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs reconcile --run us-pair-01 --case review --credentials-file artifacts/paypal-new-pair.env --buyer-approved --authorize-capture

# Separate BLOCK consent; both operations denied, no provider create/capture.
node --env-file-if-exists=.env scripts/paypal-acceptance.mjs prepare --run us-pair-01 --case block --credentials-file artifacts/paypal-new-pair.env
```

Operator approval here is a credentialed **service harness** action, not proof
of an HTTP operator login. HTTP role restrictions are covered separately by
mocked integration/browser tests. Agent proposals are explicitly deterministic
fixtures; PayPal requests are real only when the credentialed harness is run.

Console output is sanitized: provider operations/status codes and safe outcomes,
no credential values, order/capture/intent/request IDs or approval URLs. Full
private evidence is saved with exclusive timestamped filenames in ignored
`artifacts/`; earlier reports are never overwritten. Inspection opens SQLite
read-only and performs only OAuth plus GET requests; it cannot capture or create.

## Validation and remaining gates

Regression tests cover isolated IDs and credential binding, exclusive run
creation, partial-credential rejection, read-only/no-secret inspection,
unapproved preflight, expiry, provider mismatch, REVIEW/BLOCK denial, approved
capture, duplicate handling, uncertain-create preservation and lost-capture GET
reconciliation. These tests use **mock providers**, not real capture evidence.

Required commands: `npm run check`, `npm test`, `npm run test:e2e`.
No new build/deployment is authorized until validation completes. Pending gates:
original seller preference/account confirmation; fresh account credentials;
fresh ALLOW buyer approval plus explicit capture authorization and real completed
evidence; REVIEW acceptance; BLOCK checks with the same fresh configuration;
review of private audit/duplicate reconciliation observations.

Latest local validation: `npm run check` passed; **99 server/security tests**
passed (including 10 acceptance-harness regression tests); **16 Chromium browser
tests** passed. Real reinspection made one successful OAuth request and two
unsuccessful GET lookups, with zero create/capture requests. Fresh-profile tests
remain pending private credentials and human buyer/capture steps.
