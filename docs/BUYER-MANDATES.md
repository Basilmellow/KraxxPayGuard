# Buyer mandates and lower-trust merchant data

`purchase-mandate/v1` extends immutable single-item authorizations without
rewriting their database records or payment operation IDs. A buyer explicitly
selects one to three product IDs, approved merchant IDs, category IDs, a self/team
beneficiary label, USD budget, automatic limit and original instruction. Labels
are demo metadata, not shipping addresses, real beneficiary identity checks or
an instruction to pay another person. No natural-language parsing grants scope.

The server snapshots authoritative offers (product, merchant, recipient, exact
price, category, currency). An agent may read up to three allowed offers within
four provider steps and propose **one** product it read. One authorization can
reserve exactly one intent. Selection does not create a reusable spending wallet.

The six-product synthetic catalog has two merchant identities. Kraxx Demo Store
uses the existing Sandbox app. Kraxx Lab Supply requires its own optional
PAYPAL_SECONDARY_CLIENT_ID, PAYPAL_SECONDARY_CLIENT_SECRET and
PAYPAL_SECONDARY_MERCHANT_ID. Without them, it can be evaluated but cannot
check out. There is no fallback to the first merchant's credentials. Both
merchants remain explicitly synthetic demonstration stores, not real vendors.

At execution, the server reloads immutable consent, reevaluates the saved
proposal, compares current catalog and recipient configuration, checks review
and expiry, and verifies every PayPal field before accepting capture evidence.
Changing a price or merchant configuration requires new consent; no payment
record is reset. A completed capture can still reconcile safely after expiry.

## Attack Lab

Authenticated agent runs may include a server-recognized preset or bounded
custom merchant text (1–2000 characters). That text is saved with the one intent
and sent only as labelled lower-trust catalog data. It cannot add tools, expand
scope, modify consent or execute payments. Replaying the same consent with a
different payload or agent mode returns a conflict.

Real mode retains the genuine bounded model proposal separately from policy
results. Invalid output fails closed and retains a bounded representation of
attempted proposal fields. Raw chain-of-thought is neither exposed nor stored.
Deterministic mode uses a labelled synthetic proposer and predefined mutations;
custom text is not interpreted by that fixture. Use real mode to test actual
model susceptibility. A safe ALLOW with malicious text can mean the model
ignored the attack; it must not be scored as an unauthorized payment bypass.

Typed mandates treat text detector signals as **advisory**. Exact authority
checks decide ALLOW/REVIEW/BLOCK even when encoded attacks evade the detector.
Benign quotations can therefore remain ALLOW. Legacy scenarios preserve their
existing conservative detector veto. These two modes must be reported separately
when discussing false positives. This is a closed catalog, not a general proof
of prompt-injection prevention.
