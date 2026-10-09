# Release validation — October 9, 2026

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
