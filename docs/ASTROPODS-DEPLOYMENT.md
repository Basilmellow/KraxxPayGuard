# Astropods container build and deployment

The root Dockerfile fixes the missing-file build failure at 157eb63. It uses
Node 24.18.0 Debian slim pinned by digest, installs production dependencies only
(currently none), copies only server/UI/startup files, and runs as UID 1000.
There are no build secrets or `.env` files in the image. Local `npm start`
continues to use loopback port 3000 and the existing local environment.

The current [Astropods spec](https://docs.astropods.com/astropods-package-spec)
requires `blueprint/v1`. The blueprint declares frontend true, messaging false,
single-replica operation and a gateway model menu containing claude-haiku-4-5.
The platform injects ASTRO_GATEWAY_URL, ASTRO_GATEWAY_API_KEY and MODEL_DEFAULT
at runtime. Container startup rejects selecting a paid provider.

## Runtime setup

In the deployment configuration, enter:

- APP_ORIGIN: the **exact assigned HTTPS frontend origin**, no slash/path/query.
  Obtain/reserve the actual hostname in the platform UI before final startup.
  Do not invent a hostname, use localhost, or derive authority from request headers.
  If the hostname is only available after provisioning, update this input and
  redeploy the same agent once the hostname is assigned. Startup rejects omission.
- SHOPPER_TOKEN and OPERATOR_TOKEN: distinct random 32+ character values using
  letters, numbers, underscore or hyphen. Use the vault/secret input fields.
- PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET: separate values from the same
  **Sandbox** REST app, entered as secrets.
- PAYPAL_MERCHANT_ID: the corresponding Sandbox business account merchant ID.

The image sets HOST=0.0.0.0, PORT=80, MODEL_PROVIDER=astropods and
DATABASE_PATH=/data/payguard.sqlite. Do not override these for hosted operation.
Do not upload the local `.env` or place secrets in CLI command arguments.

## Persistent storage

[Astropods SQLite documentation](https://docs.astropods.com/agent-sqlite)
documents an automatic persistent `/data` mount (5 GB default), writable by its
fixed non-root runtime user. Keep the mount path `/data`, and keep one replica.
No deprecated `persistent` spec property or extra knowledge container is needed.
The entrypoint checks Linux mountinfo and writable storage before opening the DB;
missing mount or invalid database path stops startup instead of losing history.
WAL, immutable consent, payment operation UUIDs and append-only audits remain
in the existing SQLite store. No runtime chown or privilege-dropping helper runs.
Back up with SQLite's backup mechanism or stop the server before copying the
database together with any remaining WAL. Do not delete the agent to upgrade:
the platform documents that agent deletion removes its storage.

## Rebuild and deploy

From the updated repository, with a current authenticated `ast` CLI:

```sh
git pull --ff-only
ast --version
ast spec validate -f astropods.yml
ast login
ast blueprint push payguard
ast blueprint get payguard --template
```

For a first deployment, use the dashboard deployment form to supply the exact
origin and secret inputs, select claude-haiku-4-5, and retain one replica and the
default `/data` storage. CLI alternative: `ast blueprint deploy payguard`
prompts for declared inputs. Keep signup-credit access without a payment card.

For an existing agent, update its runtime inputs in the dashboard and redeploy
in place. CLI commands accept the **actual** deployment ID:

```sh
ast agent redeploy --id <deployment-id>
ast agent logs --id <deployment-id> --workload agent
```

Confirm the selected build corresponds to the new Git commit, the server listens
on port 80, and the assigned HTTPS page loads. Connect with a shopper token and
verify all deterministic scenarios; reconnect as operator for REVIEW. Compare
history and audit IDs before and after `ast agent restart --id <deployment-id>
--component agent`. Only then run a real gateway proposal. Sandbox create,
buyer approval and matching capture require separate provider verification.

## Recorded validation

- Docker build: passed on Docker Desktop Linux amd64, Node v24.18.0.
- Container smoke: UID 1000, port 80 reachable through loopback port 3080,
  read-only root filesystem, all capabilities dropped, no-new-privileges.
  Linux unprivileged-port sysctl set to 0 (required to bind 80 without capabilities).
- Missing `/data` mount: startup refused as intended.
- Named-volume restart: deterministic intent, operation IDs and audit history
  returned identically after restart. No model or PayPal calls were made.
- Image inspection: no `.env`, Git metadata or Playwright runtime package.
- `npm run check`, 65 server tests, 10 browser tests: passed.
- `ast spec validate -f astropods.yml`: passed with checksum-verified Astropods
  CLI `ast/0.28.1 (0311811) BETA`. CLI was downloaded to ignored local artifacts.
  Publishing and deployment require authenticating the user's Astropods account.
- Hosted UID/storage permissions, unprivileged-port configuration, HTTPS routing,
  OIDC front door, live model tool compatibility and real Sandbox checkout:
  not tested on Astropods. No deployment or real gateway success is claimed.

Browser verification initially exposed a fixture shutdown timeout caused by
open browser sockets. Test teardown now closes those sockets; application
payment/authentication behavior is unchanged.
