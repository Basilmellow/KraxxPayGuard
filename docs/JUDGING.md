# Judging access and reproducibility

The [official schedule](https://paypalaihackathon.devpost.com/details/dates)
lists judging from **1 December 2026, 2 PM PST to 15 December, 8 AM PST**
(2 December, 3:30 AM IST to 15 December, 9:30 PM IST). Release target is
9 November; submission deadline is 12 November at noon PST.

## Safe evaluator access

Hosted `/judge` runs synthetic proposals through actual server policy. It has
no privileged application token, model execution or payment actions. Astropods
still requires OIDC sign-in at the front door. Verify the intended judges can
sign in; do not publish workspace tokens or disable platform authentication.

If hosted access or sponsor credits are unavailable, run the same source:

```sh
git clone https://github.com/Basilmellow/KraxxPayGuard.git
cd KraxxPayGuard
node scripts/judge.mjs
```

Open http://127.0.0.1:3005/judge with Node 24.18+. No runtime npm dependencies
or `.env` are needed. The isolated server disables authenticated execution
routes even with a bearer header. It opens no durable payment database.

For full authenticated evaluation use `npm ci`, `npm run setup`, then
`npm start`. Each evaluator uses their own local tokens and Sandbox accounts.
Live AI and provider evidence must not be substituted with fixtures.

## Availability gate

Astropods signup credits are finite. The checked account has no payment method
and enforced credit limits; this is not a hosting guarantee until December.
Never add a card or enable paid overage. Check credits, readiness, `/judge`
access and the repository before release and throughout judging. Notify the
owner if credits, authentication or platform availability prevent access.
Preserve the agent and `/data`; deletion can destroy idempotency evidence.

Local setup is the fallback, not a claim that hosted availability is guaranteed.
Compare the active build and verify HTTPS separately after deployment.

## Narrative and submission

The [official criteria](https://paypalaihackathon.devpost.com/#judging-criteria)
are technological implementation, design, potential impact, innovation/idea
and presentation. Demonstrate a buyer limiting what a model may propose,
independent authority enforcement and verified payment evidence. The audience
is buyers and small teams experimenting with delegated purchasing. No measured
fraud reduction, customer adoption or savings is claimed.

Keep the video below three minutes. A fixture walkthrough is not a live-payment
acceptance video. Resolve the [Sandbox blocker](PAYPAL-ACCEPTANCE.md), record
verified capture if claiming it, confirm access, upload the final video publicly
and submit the correct links. Do not invent or silently substitute a capture.
