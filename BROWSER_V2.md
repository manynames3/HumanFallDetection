# Carewatch browser v2

This fork retains the original MIT HumanFallDetection Python source and weights.
The separate `browser/` application is designed for static Cloudflare Pages,
without authentication, camera uploads, recordings, or an inference backend.
The existing person-down-core pilot is not changed by this fork.

## Current release

Live web app: https://carewatch-v2.pages.dev/

The browser UI, feature port, trained LSTM port, worker integration, and ten
detector tests are implemented. MediaPipe Tasks Vision 0.10.32 is pinned and
approved; the runtime and model are packaged as same-origin static assets.
The real browser worker passed 40 recurrent pose/classifier frames, and the full
UI ran on a clearly labeled public-image MediaStream under production CSP.
This is runtime validation, not physical-camera qualification or fall accuracy.

## Design

- Experimental person-down check is separate from the original LSTM. Users draw
  floor polygons and bed/sofa exclusions on the camera view. Session-only zones
  clear on Stop, camera change, page hide, or changed camera aspect ratio.
  Moving a camera without changing aspect ratio cannot be detected: recalibrate.
- The check requires visible torso and one knee/ankle chain, a pixel-corrected
  torso angle of at least 60 degrees from vertical, and torso/hip/support in the
  floor zone with no torso overlap in excluded regions. Eight continuous seconds
  triggers a local "Person may be down" warning, even if the LSTM says non-fall.
  Missing tracks, invalid posture, >0.5-second observation gaps, and edits reset
  evidence. No floor calibration means this check is disabled.
- This is 2D posture, not depth/floor-contact measurement. Intentional floor
  lying, bent sitting, incorrect zones, and hallucinated poses can false-trigger;
  occlusion, foreshortening, and camera angles can miss a down person. Eight
  seconds and thresholds are unvalidated experimental defaults.
- Per-person diagnostics expose movement-history progress, LSTM raw class/logit,
  fall-filter reason, and person-down reason/timer. Scores are not probabilities.
- Enable camera asks for video permission only; phones can select front/back
  cameras and computers can select connected webcams after permission.
- Stop, page hide, tab switching, or detector failure releases camera tracks.
- Skeletons, tracking boxes, mirror view, and local alert sound are independent
  switches. Overlay changes do not disable inference.
- Pose inference runs in a worker with a single frame in flight, targeting 18 Hz.
- Original LSTM checkpoint and feature order are preserved. The classifier is a
  JavaScript implementation of the two-layer, 48-unit PyTorch LSTM, not new rules.
- MediaPipe Lite is the browser replacement for OpenPifPaf. This is a
  changed perception pipeline, not a claim to reproduce published accuracy.
- The adapter uses a stricter confidence threshold, short track expiry, gap
  resets, and per-track predictions; it does not reproduce cross-camera matching.
- Green means tracked, not clinically safe. Red is a possible-fall prediction.
  The app cannot confirm physical impact or contact emergency services.
- Model assets are self-hosted, hashed, and contain no camera imagery. Hosting
  receives normal asset-request metadata but no camera frames/predictions.

## Verification

`npm test` uses Node's built-in test runner; it needs no installed dependencies.
The parity fixture is generated from the original feature function bodies and
an independent NumPy float32 LSTM reference. It covers 80 recurrent steps with
unchanged checkpoint weights. This is numerical parity, not a real fall test.

Regenerate derived assets with:

```sh
python3 tools/export_browser_model.py
python3 tools/reference_fixture.py  # development-only NumPy required
npm test
```

The checkpoint SHA256 is
`87bc1abd5828d8d2e0e91ef203a7f1b76df7c77c0d5fbd41bef765058221661b`.
The feature exporter uses a restricted descriptor-only unpickler and refuses
any other checkpoint. The manifest records upstream commit, tensor layout, and
derived binary hash. Browser inference has no PyTorch or ONNX dependency.

## Build and deploy

```sh
npm ci
npm test
npm run build
wrangler pages deploy browser --project-name carewatch-v2 --branch browser-v2
```

The build retrieves the official MediaPipe license and the SHA256-pinned pose
model when missing. Runtime files and licenses are copied from reviewed sources;
no private runtime assets or secrets are required. Publish only `browser/`;
Python upstream sources and local QA routes are not deployed. The Pages project
uses the separate `carewatch-v2` name, not `person-down-pilot`.

Local browser QA: download Google's public `pose.jpg` fixture into
`tests/fixtures/generated/pose.jpg`, run `python3 tests/fixture_server.py`, open
`http://127.0.0.1:8769/browser/index.html?fixture`, and use Enable/Stop and toggles.
The server injects a prominently marked public-image test stream; the production
app never substitutes fake camera footage. The `&denied` query tests denial UI.
The `&down` query additionally substitutes explicitly labeled synthetic pose
output using the actual PersonDownMonitor to test warning rendering, timing,
exclusion editing, and dismissal. It is not evidence of model accuracy.

Upstream license: `LICENSE`. Keep the upstream MIT notice in the web deployment
and include MediaPipe's Apache 2.0 notice.
