# Run without paying

PayGuard runs locally with bundled SQLite and no paid runtime dependencies.
Deterministic mode makes no model calls and stays usable after sponsor credits
run out. It is a test fixture, not AI. PayPal uses Sandbox test accounts only.

## Sponsor AI: Astropods

The [hackathon sponsor page](https://paypalaihackathon.devpost.com/details/astropods)
links to free signup. [Astropods usage limits](https://docs.astropods.com/usage-limits)
document one-time signup credits; the amount is shown on signup. Without a card,
agents stop when credits run out. Do not add a card or enable pay-as-you-go.
This is finite sponsored access, not unlimited free inference.

Follow the [AI Gateway guide](https://docs.astropods.com/ai-gateway): sign in
with `ast login` and use `ast project` for a local gateway-enabled project.
Declare a model with `provider: gateway`; their runtime injects
`ASTRO_GATEWAY_URL`, `ASTRO_GATEWAY_API_KEY` and `MODEL_DEFAULT`.
Use those values in the PayGuard server environment (or its ignored `.env`):

```dotenv
MODEL_PROVIDER=astropods
ASTRO_GATEWAY_URL=
ASTRO_GATEWAY_API_KEY=
MODEL_DEFAULT=claude-haiku-4-5
```

The URL is the HTTPS host supplied by Astropods, without `/v1` or a trailing
slash. PayGuard appends `/v1/responses`, documented in their
[compatible API reference](https://docs.astropods.com/ai-gateway/chat).
Keep the gateway key on the server, never in Workspace access or source control.
Restart PayGuard and choose Real model API. Existing OPENAI_API_KEY values are
ignored by default. There is no automatic fallback to another model provider.

The same strict tools, four-step budget, timeout, independent policy and
verified PayPal execution apply. Provider failure denies payment. Live gateway
compatibility must be verified once an account is connected; mock tests do not
prove sponsor account access.

## Other sponsor resources

- [APIMatic](https://paypalaihackathon.devpost.com/details/apimatic) offers PayPal
  context tooling and a conditional free subscription. It does not replace inference.
- [Render](https://paypalaihackathon.devpost.com/details/render) offers $50 in
  hosting credits. Local hosting avoids billing entirely. No deployment is needed
  for the local demo; credits alone do not guarantee a permanent free deployment.
- [KERNEL](https://paypalaihackathon.devpost.com/details/kernel) offers $50 in
  browser infrastructure credits. Our checkout uses the PayPal API, so this is
  unnecessary for the current demo.

PayPal OAuth still requires the Client ID and separate Secret from the same
Sandbox REST app. Sponsor model access does not fix invalid PayPal credentials.
