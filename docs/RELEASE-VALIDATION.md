# Release validation

## Final non-payment prototype — 27 October 2026

The owner deferred account-side payment troubleshooting and authorized
finalization of the remaining prototype. This does not close completed-capture
acceptance. No pending payment was retried, reset, replaced or cancelled.

| Check | Recorded result |
| --- | --- |
| JavaScript syntax | Passed |
| Server/security suite | 105 passed |
| Chromium browser suite | 16 passed |
| New local setup / repeat setup | Sponsor-only defaults valid; existing file preserved |
| Existing local configuration | Recognized invalid gateway placeholder cleared; configuration parses; local real AI remains unconfigured |
| Hosted runtime | Build e420da3d / application commit 0b30355 active; 2/2 workloads ready; no restarts reported |
| Hosted judge UI | Signed-in ALLOW / REVIEW / BLOCK fixtures observed; no payment execution |
| Actual hosted AI | Six completed Claude Haiku runs; four ALLOW, one REVIEW, one budget BLOCK; 12 validated tool responses |
| Model-test payments | Every report NOT_CREATED; no PayPal operation invoked |
| Astropods specification | Valid with installed CLI 0.28.1 |
| Offline evidence summary | All six redacted exports checked; duplicates, mocks and inconsistent authority outcomes refused |
| Privacy scan | 76 public/tracked candidate files checked against local private credential/token/merchant values; no matches |
| New walkthrough | 130.64 seconds, 1280x800; captions and verified Opus narration; local fixtures plus labelled saved live evidence |
| Narration | Offline Windows Speech; optional FFmpeg tool only in ignored artifacts, not a runtime dependency |
| Local judge | Listening at 127.0.0.1:3005; no .env, durable DB or provider calls |
| Hosting cost control | Sponsor credit plan; no payment method; credit enforcement active at check |
| Availability follow-up | Daily read-only check through judging end configured; requires device/Codex availability |

The live reports are in [LIVE-EVALUATION.md](LIVE-EVALUATION.md); the synthetic
suite remains separate. The model ignored the two sampled redirection payloads;
ALLOW for a matching authorized proposal is not a bypass. A proposed $49 item
against a $20 authorization was denied. These selected cases do not establish a
production safety rate. An export transport timeout was recovered and only
saved, completed evidence was counted.

The local judge requires no provider/account access. Hosted access still needs
Astropods OIDC and privileged operations need separate workspace principals.
No platform authentication was weakened. No new runtime image was built or
deployed during finalization: changes affect documentation, evidence, local
setup and development/recording tools; deployed app source is unchanged.
Historical Docker/persistence/Trivy checks below are dated evidence, not fresh
container-scan claims.

The narrated video was visually inspected and its duration/audio streams
verified. FFmpeg's standard build was obtained from the PyPI imageio-ffmpeg
0.6.0 Windows wheel and its SHA-256 matched published metadata. The Playwright
recording-only binary cannot mix narration; that failed attempt was replaced
with the verified optional media tool. Narration tooling was exercised on
Windows; other operating-system speech implementations were not tested.

[PayPal acceptance](PAYPAL-ACCEPTANCE.md) remains PENDING / UNILATERAL, not
completed funds receipt. No real duplicate-capture completion or fresh REVIEW
payment acceptance is claimed. Video publication, final Devpost entry,
eligibility/ownership confirmation and judge-access arrangement remain owner
actions in the [submission package](SUBMISSION.md). No submission, support
message or YouTube upload was performed.


## Historical buyer-mandate candidate — 26 October 2026

The current local candidate passed syntax checks, **89 server tests**, **16
Chromium browser tests**, Astropods spec validation, Docker build, and legacy
and typed-mandate container restart/persistence smoke tests. Container tests used
UID 1000, port 80, read-only rootfs, dropped capabilities and a named `/data`
volume. Missing storage refused startup. No acceptance database was reset.

The fixed policy evaluation matched 12 of 12 expected outcomes: 9 unauthorized
proposals blocked, 3 benign controls allowed. It made no model or PayPal calls.
These are synthetic proposer fixtures, not an AI robustness benchmark.

Trivy 0.75.0 detected zero vulnerabilities in recognized OS packages in the
fresh container scan. Coverage does not prove application or copied Node binary
security. Astropods' independent scan must be checked separately.

The fixture walkthrough was recorded and its WebM metadata verified at
116.6 seconds, 1280x800. It is captioned, with no narration audio, model call or
payment call. It is a draft walkthrough, not verified capture evidence.

Real Sandbox OAuth, ALLOW/approved-REVIEW create and GET field verification
succeeded. The user reported the seller-currency rejection during buyer
approval. Both orders remained PAYER_ACTION_REQUIRED; no capture POST was made.
The [acceptance report](PAYPAL-ACCEPTANCE.md) is the release gate.

CI and hosted build verification are recorded only after the candidate is
pushed and deployed; local success must not be treated as hosted acceptance.

## Historical baseline — October 9, 2026

Observed locally on Windows with Node 24.18.0:

| Check | Observed result |
| --- | --- |
| Supplied starter tests | 7 passed |
| Starter check script | Missing; added; exposed/fixed browser syntax error |
| Final unit/integration/security suite | 58 passed, 0 failed, 0 skipped |
| Chromium desktop/mobile E2E suite | 8 passed, 0 failed |
| `npm run check` | All application, test and configuration JavaScript parses |
| `git diff --check` | Passed |
| Dependency installation audit | 0 vulnerabilities reported across 4 packages |
| `npm audit --omit=dev` | 0 vulnerabilities reported; no runtime dependencies |
| Desktop/mobile screenshots | Visually inspected; mock provider/capture clearly labelled |
| Local environment | Ignored .env generated with distinct random access tokens |
| Local startup | App listening at http://127.0.0.1:3000, Sandbox only |

HTTP integration and browser tests required execution outside the filesystem
sandbox because its loopback network connections were denied (`EACCES`). Tests
use actual local HTTP requests and Chromium with mock provider adapters; they
do not make a real model API or PayPal call.

Failures encountered and resolved: original browser syntax, Windows SQLite
teardown ordering, invalid test consent expectation, and a test fixture config
override. Failed runs were not reported as successful acceptance evidence.

## Acceptance still required

No provider credentials were available. Real model invocation, Sandbox OAuth,
buyer approval and completed capture remain unverified. Use the Sandbox runbook
and submission checklist. No public deployment or demo-video recording has been
performed.

The first remote CI run also passed all checks on a GitHub-hosted Linux runner:
[run 37922401973](https://github.com/Basilmellow/KraxxPayGuard/actions/runs/37922401973),
commit `a5f70ba`. Deprecation annotations for the initial v4 Actions prompted an
update to verified v6 commit pins and an explicit Ubuntu 24.04 runner, with
checkout credentials disabled. Check the latest run after that workflow update.
