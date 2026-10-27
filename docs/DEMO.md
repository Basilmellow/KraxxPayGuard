# Demo recording and reproduction

## Current walkthrough — 27 October 2026

The narrated WebM is **130.64 seconds (2:10.64)**, 1280×800, with a verified
Opus audio track and on-screen captions. Narration uses offline Windows speech;
no paid/cloud voice service, copyrighted music or impersonated voice is used.

It shows the running local application with labelled synthetic ALLOW / REVIEW /
BLOCK interactions, a two-offer buyer mandate, the Attack Lab, redacted export,
and a clearly labelled replay of [six genuine hosted model reports](LIVE-EVALUATION.md).
The replay does not call the model again. The recording itself makes zero model
or PayPal requests and discloses that completed capture acceptance is deferred.
It does not depict a completed real payment.

Generated local artifacts are under ignored `artifacts/walkthrough-2026-10-27/`:
`payguard-walkthrough-narrated.webm`, its silent source, captions/recording metadata,
`narration.json`, a redacted fixture export and preview screenshots. These are
local review artifacts, not a published YouTube submission.

## Recreate

Install Node 24.18+, development dependencies and Chromium. Record to a fresh
artifact directory so earlier review versions remain available:

```sh
npm ci
npx playwright install chromium
npm run record:demo -- artifacts/my-walkthrough
```

Optional Windows offline narration requires a full FFmpeg build with audio
filters and Opus encoding, not Playwright's minimal recording binary. Put your
trusted FFmpeg executable on PATH or set `FFMPEG_PATH`, then run PowerShell:

```powershell
.\scripts\narrate-walkthrough.ps1 -OutputDirectory artifacts/my-walkthrough
```

The script reads only recording captions, synthesizes WAV segments to the
artifact directory and mixes them locally. The mixer checks encoded duration,
refuses a video of three minutes or longer and verifies an Opus audio track.
The supplied project has no runtime speech/FFmpeg dependency. On other systems,
the silent captioned recording remains usable, or supply equivalent narration
WAV segments before `node scripts/mix-walkthrough.mjs artifacts/my-walkthrough`.

Review the final video visually and audibly before uploading. Keep the fixture,
saved live evidence and pending-payment disclosures. The [official requirements](https://paypalaihackathon.devpost.com/rules)
call for a publicly visible YouTube video under three minutes and a functioning
build; upload and final entry submission remain owner actions.

## Historical draft

The 26 October fixture-only draft was 116.6 seconds with captions and no audio.
It predates the real-model evaluation and the pending-capture finding; use the
current recording rather than its outdated seller-currency narration.
