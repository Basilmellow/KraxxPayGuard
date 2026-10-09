# Credentialed acceptance runbook

These steps require your accounts. No real provider success is recorded yet.

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/),
   select **Sandbox** and create/select a REST app under a Sandbox business
   account. Copy that app's client ID and secret into local `.env`.
2. Obtain the merchant ID of the same Sandbox business account (account details
   or its Sandbox account settings). Set `PAYPAL_MERCHANT_ID`. A conceptual
   demo payee string is insufficient for real checkout.
3. Create/select a separate Sandbox personal buyer account. Keep its login private.
   Never use a live account or real card. Set APP_ORIGIN to your exact app origin.
4. Add an OpenAI API key and a Responses/function-calling model available to your
   account. This app does not infer a model from a ChatGPT subscription. Restart.
5. Connect as shopper. Confirm configuration indicators, then select real model
   mode, ALLOW notebook, explicit $50 budget and $50 automatic limit. Tick consent.
   Verify two validated tool calls in the saved agent record and ALLOW policy.
6. Create a Sandbox order. Confirm the link host is `www.sandbox.paypal.com`.
   Approve with the Sandbox buyer. Return to PayGuard; verify and capture.
7. Confirm `COMPLETED`, a capture ID, expected $49 USD, merchant ID, and the
   `PAYPAL_CAPTURE_VERIFIED` audit event. Cross-check that order/capture in the
   business account's Sandbox transaction history. Record IDs privately.
8. Restart PayGuard without changing its database. Select the same intent and
   confirm completion/history survives. Repeat capture via the API: it must return
   the same evidence without creating a second provider capture.
9. Run REVIEW console ($650 with $700 budget, $100 auto limit). Confirm shopper
   cannot create an order until a separately authenticated operator approves.
   Approve within the 15-minute grant and complete Sandbox buyer/capture steps.
10. Run BLOCK injection with real model mode. Whether the model ignores or obeys
    attacker text, independent policy must deny. Confirm there is no order/capture
    for that intent and no review action that can override it.

Configuration does not establish successful connectivity. If OAuth/model fails,
record the sanitized error code and fix account configuration; do not weaken the
firewall or substitute a mock capture in a real-provider demonstration. Review
and checkout are separate from buyer approval. Query parameters on the return
page never authorize capture.

## Uncertain operations

- Retry the existing intent. Its create/capture UUIDs remain unchanged.
- If capture succeeded but the response was lost, GET reconciliation checks the
  existing order and matching completed capture; no new capture is issued.
- After restart, an in-flight lease may remain for up to 180 seconds. Wait before
  retrying. Do not delete the database or manually reset state.
- Expired consent denies new payments. Reconciliation of a previously completed
  capture remains available. An order with unknown status must be inspected in
  Sandbox before authorizing a separate replacement purchase.
- After five hours, creation/capture POST retries are blocked. Resolve the existing
  order manually with the Sandbox account; there is no unsafe reset endpoint.

No webhook setup is needed for this synchronous capture demo. The service does
not ingest webhooks or claim to track refunds/chargebacks/late settlement.
