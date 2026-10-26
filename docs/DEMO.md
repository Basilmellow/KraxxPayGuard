# Demo script — 2 minutes 50 seconds

## Recorded fixture walkthrough

`npm run record:demo` records a credential-free local walkthrough after installing
the development dependencies and Chromium. It writes WebM, captions/recording
metadata and a redacted report under ignored `artifacts/walkthrough/`. It uses
an isolated memory database, ephemeral test principals, deterministic proposals
and no provider credentials. No model or PayPal API is invoked.

The 26 October recording is **1 minute 56.6 seconds**, verified from the encoded
WebM metadata (the wall-time measurement is separate). It is captioned and has
no narration audio. It demonstrates the buyer mandate, decision explorer,
synthetic attack evaluation and export while disclosing pending real capture.
This is a reviewable draft, not a verified live-payment submission video.

## Final submission narration and gates

Use real model and Sandbox credentials only after completing the acceptance
runbook. Otherwise state the limitation plainly and demonstrate deterministic
policy without claiming a real transaction. Never show `.env` or access tokens
in the video. Prepare separate shopper/operator browser contexts, not recorded
token typing. Preflight new consent (15-minute expiry) and buyer login.

| Time | Screen/action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Dashboard, original authorization | “Kraxx PayGuard is a Payment Intent Firewall by KRAXXSEC. Agents propose purchases; the server checks the exact authority the user granted.” |
| 0:20–0:45 | ALLOW notebook, $50 budget, authorize and run | “The user authorizes one notebook, this recipient and a budget. The agent reads the catalog and proposes $49. Item, merchant, price, currency and budget match, so policy returns ALLOW.” |
| 0:45–1:10 | Create order, Sandbox buyer approval, verified capture | “ALLOW permits order creation. It still requires PayPal Sandbox buyer approval. Before capture, PayGuard verifies the provider order. This capture ID and saved audit are provider evidence.” |
| 1:10–1:40 | REVIEW console, shopper denied; operator approves | “This $650 item is inside the $700 user budget but above the $100 automatic limit. REVIEW requires the operator. The agent and shopper cannot grant that approval.” |
| 1:40–2:15 | BLOCK injection, inspect reasons | “This merchant description asks the agent to redirect payment and override policy. The server retains the original grant. The redirection and injected instructions produce BLOCK. Even the operator cannot override it.” |
| 2:15–2:35 | History/audit, tests | “Consent and operation IDs are durable. Duplicate calls reuse the same intent; lost capture responses reconcile the existing order. Security regressions test tampered recipients, prices, tool abuse and concurrency.” |
| 2:35–2:50 | Dashboard/security boundary | “Model explanations are labelled as unverified. Decisions and payment evidence come from deterministic checks. Payment authorization stays with the user and server.” |

If providers are unavailable, replace the capture segment with: “This is the
deterministic test agent. PayPal credentials are unavailable, so no real payment
is shown. The Sandbox lifecycle is implemented and covered with provider mocks;
credentialed verification remains pending.” Do not edit that limitation out.

Expected normal scenarios: notebook → ALLOW; console with $700 budget/$100
automatic limit → REVIEW; injected notebook merchant content → BLOCK.
Lowering the total budget below a product's price is BLOCK, not REVIEW.

For the buyer-mandate release, replace the fixed-item setup with an explicit
two-offer allowance and show the genuine chosen proposal next to its immutable
scope. Show the Attack Lab payload as lower-trust text and the fixed evaluation
as synthetic policy evidence, not an AI robustness score. Replace the capture
segment with the documented seller-currency blocker until acceptance succeeds.
Do not record or publish a claim of completed capture without verified evidence.
