# Deployment guidance

Deployment has not been performed. Intended environment: one Node 24.18+ process
with a persistent local disk and TLS reverse proxy, for a controlled hackathon
demonstration. This is not an ephemeral serverless or horizontally scaled app.

## Before starting

1. Run `npm ci`, `npm test`, `npm run check`, install Chromium and run browser tests.
2. Supply secrets through a protected host environment or ignored `.env`. Generate
   distinct high-entropy shopper/operator keys (`npm run setup` for local use).
   Give the operator key only to the designated reviewer. Never bake secrets or
   `.env` into an image, repository, screenshot, browser bundle or URL.
3. Mount persistent storage at `DATABASE_PATH`. Restrict directory permissions to
   the service account. SQLite creates the schema on initial startup. Preserve
   authorizations, audit, intents and all operation UUIDs on every deployment.
4. Configure `APP_ORIGIN=https://your-demo-domain.example` without a trailing
   slash or path. Set HOST=0.0.0.0 only behind a TLS reverse proxy/private network.
   Bind the app privately; expose the proxy. Remote HTTP APP_ORIGIN is refused.
5. Set only Sandbox business app credentials and its exact merchant ID. There
   is no live endpoint option. Set the real model name explicitly if needed.
6. Start `npm start` under a service manager with restart-on-failure. Proxy should
   preserve the Origin header. Requests cannot rely on forged forwarded headers.
   No CORS is enabled. Proxy timeout must allow bounded model workflows (~80s).

## Operations

- One process only. SQLite leases can coordinate connections, but rate limits,
  model quotas and OAuth cache are process-local. Public distributed deployment
  needs shared quotas and a proper identity/session system before expansion.
- Back up SQLite consistently using SQLite backup tooling or after gracefully
  stopping the service; do not copy only the main file while ignoring active WAL.
  Protect backups like live data. Test restore and inspect outstanding Sandbox
  orders before resuming payment creation.
- Rotate bearer keys if exposed and restart. Rotating a key immediately invalidates
  it on the server. Do not log Authorization headers at a proxy. There are no
  user-level revocation/MFA capabilities in this demo.
- SIGTERM/SIGINT stops new requests and drains active requests for up to ten
  seconds. An interrupted operation retains its lease/request IDs; restart and
  reconcile after the lease timeout. Never assume interruption rolled back PayPal.
- Monitor sanitized HTTP error codes and authenticated `/api/audit`. No secrets,
  full provider bodies or payer profiles are written to application logs.
- Re-run the credentialed Sandbox runbook on the intended origin. A configured
  status indicator alone is not an acceptance test.

Do not reset storage to solve an uncertain payment. There is no live-money mode,
fulfillment service, webhook consumer or production-readiness claim.
