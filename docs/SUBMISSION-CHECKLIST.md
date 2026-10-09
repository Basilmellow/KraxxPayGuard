# Submission checklist — October 15, 2026 target

## Implemented candidate

- [x] Original starter inspected and baseline failures recorded/fixed
- [x] Server-owned immutable structured consent and deterministic policy
- [x] Bounded real model adapter and explicitly labelled deterministic agent
- [x] Injection/redirection denial, role/owner/CSRF/rate protections
- [x] Sandbox OAuth/create/buyer-link/capture integration and evidence verification
- [x] Durable transactions, audit, operation IDs, claims and reconciliation
- [x] Responsive KRAXXSEC dashboard and all three scenario flows
- [x] Regression suites, CI configuration, MIT license and environment example
- [x] Architecture, threat model, deployment/runbook and sub-three-minute script

## Required before submission

- [ ] Real model API call observed with available account/model credentials
- [ ] Real Sandbox business OAuth and order creation verified
- [ ] Real Sandbox personal buyer approval and matching completed capture verified
- [ ] Sandbox capture IDs cross-checked in business account transaction history
- [ ] Credentialed REVIEW/BLOCK scenarios checked with no policy bypass
- [ ] Hosted demo deployed and tested on its exact HTTPS origin, if submitting one
- [ ] GitHub CI run observed green for the pushed release candidate
- [ ] Demo video recorded in under three minutes without secrets/private data
- [ ] Hackathon eligibility/submission requirements verified by the owner
- [ ] Submit correct repository, demo/video links and disclose remaining limitations

Provider mocks are not real Sandbox transactions. CI configuration is not proof
of a completed remote CI run. Local release validation is recorded separately.
