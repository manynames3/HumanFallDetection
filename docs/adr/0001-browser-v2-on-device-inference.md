# ADR 0001: Static browser app with on-device inference

- Status: Accepted (documents the existing `browser-v2` design)
- Recorded: 2026-10-13
- Scope: `browser/` runtime; not the upstream Python application or offline model candidates

## Context

Carewatch needs a straightforward camera-first web app for consented use, without
requiring a proprietary camera, account or per-frame cloud processing. The fork
must preserve attribution to [taufeeque9/HumanFallDetection](https://github.com/taufeeque9/HumanFallDetection),
its MIT notice and the original research citation. The upstream checkpoint and
feature formulas provide a reusable classifier, not validated performance for
the changed browser perception pipeline.

## Decision

Serve only `browser/` as static assets on Cloudflare Pages. Ask for video-only
camera permission through `getUserMedia`, then process frames locally in a
dedicated classic Web Worker. Keep the main page responsible for controls,
camera lifecycle, skeleton/box rendering, diagnostics, warning messages and
optional local sound. Transfer at most one frame at a time, targeting 18 Hz
without guaranteeing that rate on every device.

Use self-hosted, pinned MediaPipe Tasks Vision 0.10.32 / Pose Landmarker Lite for
body landmarks. Retain the upstream two-layer, 48-unit LSTM checkpoint and its
feature order in the JavaScript port. The exported model manifest records the
upstream commit and hashes; runtime verifies the classifier binary and build
verifies the pose asset. Preserve upstream MIT, MediaPipe Apache 2.0 and bundled
asset license notices.

Keep `PersonDownMonitor` separate from the LSTM. It evaluates observed posture
and standing/sitting-to-down transitions, including someone already down at
startup. Do not require furniture/floor marking; offer optional session-only
regions when needed. Show “Possible fall” or “Person may be down”, not confirmed
impact, emergency or safety. Preserve diagnostics that distinguish classifier
evidence from posture evidence; scores are not calibrated probabilities.

Do not add authentication, recordings, uploads, inference servers, remote
notifications or emergency-contact escalation to this design. Stop the session
and release the camera when the page is hidden, stopped or fails. Treat offline
learned models/tracking changes as non-promoted until their reliability is
independently demonstrated; documenting them is not a release decision.

## Alternatives and tradeoffs

- Cloud inference could centralize compute and model updates, but adds ongoing
  compute/bandwidth costs and a sensitive camera-data transfer/storage boundary.
  It is not implemented here.
- A dedicated edge appliance could support persistent monitoring outside a
  visible browser, but adds hardware, installation and support costs. It is not
  required by this browser release.
- Keeping the original Python/OpenPifPaf runtime unchanged preserves that
  research workflow, but does not provide a static phone/computer web app. Keep
  it available and clearly distinguish the two implementations.

## Consequences and constraints

The initial app has no inference-server cost or required camera brand. It works
with browser-exposed phone/computer cameras, not arbitrary direct RTSP/IP streams.
Hosting still receives normal requests for assets; “on device” is not an
anonymity claim. Performance, thermal limits and visibility/background policies
vary by device and browser. It is not an unattended 24/7 monitoring service.

Replacing OpenPifPaf with MediaPipe and changing tracking invalidates any
assumption that upstream research accuracy transfers. Numerical parity and
rendered skeletons do not qualify clinical reliability. Rule-based person-down
checks can warn about intentional lying, and optional exclusions can suppress a
real event. Neither path confirms floor contact or impact. No sensitivity or
false-alarm guarantee is made, and warnings do not replace human supervision or
emergency-response systems.

Future backend, authentication, background monitoring or model promotion must
have a separate decision and appropriate evidence, privacy review and consent
design. The current reliability gate remains closed; this ADR does not authorize
deployment.

## Source of truth

- [C4 views](../architecture.md)
- [Browser guide](../../BROWSER_V2.md)
- Runtime: [`app.js`](../../browser/app.js), [`worker.js`](../../browser/worker.js),
  [`detector.js`](../../browser/detector.js), [`person-down.js`](../../browser/person-down.js),
  [`decision.js`](../../browser/decision.js), [`calibration.js`](../../browser/calibration.js)
- Packaging and provenance: [`build.mjs`](../../tools/build.mjs),
  [`lstm.json`](../../browser/models/lstm.json), [`LICENSE`](../../LICENSE)
