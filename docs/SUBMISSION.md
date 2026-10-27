# Submission package — Kraxx PayGuard

Owner review required before publication/submission. This document prepares the
entry; it does not attest to personal eligibility or submit anything to Devpost.

## Entry fields

**Project name:** Kraxx PayGuard

**Tagline:** Your agent chooses. Your mandate decides.

**Creator / brand:** Mohamed Basil / KRAXXSEC

**Repository:** https://github.com/Basilmellow/KraxxPayGuard (MIT)

**Hosted demonstration:** https://payguard-dc9871843ad4fa4b.agents.astropods.ai/judge
(Astropods sign-in required; use the local build if access is unavailable.)

**Video:** Review the generated narrated walkthrough, upload it publicly to
YouTube, and place the resulting public URL in the submission. No public video
URL has been created or submitted by this work.

## Inspiration

Delegating a purchase to an AI assistant should not mean delegating authority to
a merchant's text. A shopping agent may encounter instructions to change the
recipient, substitute an item or claim that an operator already approved a
payment. PayGuard explores a buyer-controlled boundary between choosing an
offer and being allowed to spend.

## What it does

A buyer selects approved offers, merchants, categories, beneficiary and spending
limits. The server saves one immutable, expiring mandate. Claude Haiku reads
bounded catalog tools and proposes a purchase. An independent deterministic
firewall checks the proposal against the original authority and returns ALLOW,
REVIEW or BLOCK. REVIEW requires a separate operator; BLOCK cannot be overridden.

The decision explorer compares trusted scope and untrusted proposal, shows tool
provenance, retains durable history and offers redacted evidence exports. The
Attack Lab supplies bounded merchant text without granting tools or payment
authority. A no-key guided judge view evaluates synthetic proposals with the
real firewall and cannot execute payments.

## How it was built

Node.js 24, native HTTP and SQLite, JavaScript/HTML/CSS, PayPal Sandbox Orders v2,
and the Astropods gateway with `claude-haiku-4-5`. There are no runtime npm
dependencies, framework migration or automatic paid-model fallback. Containers
run as non-root, bind port 80 and require durable storage. Idempotency UUIDs,
transactional leases and GET reconciliation preserve uncertain payment attempts.

Code, tests, documentation and evaluation were developed with AI coding
assistance and reviewed through regression and provider checks. No claim of
unassisted authorship, customer adoption or measured fraud savings is made.

## What was verified

Six real hosted model proposals produced four ALLOW, one REVIEW and one budget
BLOCK, with 12 validated tool responses and no payment execution. In two hostile
merchant-text cases the model retained authorized fields; an ALLOW in those
cases is not an authority bypass. Twelve separate synthetic proposer tests
exercise nine unauthorized mutations and three benign controls.

The candidate passed 105 server/security tests and 16 browser tests, including
scope/replay, owner/operator restrictions, mismatched provider evidence,
idempotency, uncertain capture reconciliation and mobile layout. Sources:
[live evaluation](LIVE-EVALUATION.md), [synthetic evaluation](ATTACK-EVALUATION.md)
and [release validation](RELEASE-VALIDATION.md).

## Payment limitation — disclose in the entry

Real Sandbox OAuth, order creation, buyer approval and an explicitly authorized
capture submission were verified. The single capture remains PENDING /
UNILATERAL and unclaimed; the application correctly refuses to label it paid.
The owner deferred that account-side acceptance blocker. Original records,
request IDs and audit remain preserved, and no duplicate capture/replacement
payment was submitted. Completed capture is **not** demonstrated. See the
[exact provider report](PAYPAL-ACCEPTANCE.md). This limitation may affect judging;
we do not guarantee eligibility, a prize or completed payment acceptance.

## Judge instructions

1. Install Node 24.18 or newer and clone the repository.
2. Run `node scripts/judge.mjs` from the checkout.
3. Open http://127.0.0.1:3005/judge and inspect ALLOW / REVIEW / BLOCK, the fixed
   evaluation and redacted exports. No account, token, model credit or `.env` is
   required for this restricted, read-only mode.
4. Read the saved live reports to distinguish genuine model observations from
   fixtures. For full authenticated evaluation follow README setup using your
   own local tokens and sponsor gateway configuration. Arrange hosted privileged
   access privately with the owner; no public execution credential is provided.

## Criteria and remaining actions

The [official criteria](https://paypalaihackathon.devpost.com/#judging-criteria)
are supported by bounded PayPal/AI integration, a coherent mandate/decision UI,
a specific buyer/team audience, independent authority enforcement, and an
English narrated walkthrough. This is a prototype with a closed catalog, no
fulfillment, no account-wide spending ledger and no production-security claim.

The owner must review [official rules](https://paypalaihackathon.devpost.com/rules),
confirm eligibility/ownership and the chosen judge-access arrangement, review and
publish the sub-three-minute video on YouTube, then submit the correct links by
**12 November 2026, noon PST (13 November, 1:30 AM IST)**. Preserve availability
through **15 December, 16:00 UTC / 9:30 PM IST** according to the
[official schedule](https://paypalaihackathon.devpost.com/details/dates).
The local build is a reproducibility route if finite sponsor credits expire;
free hosted uptime is not guaranteed.
