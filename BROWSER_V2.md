# Carewatch browser v2

This fork retains the original MIT HumanFallDetection Python source and weights.
The separate `browser/` application is designed for static Cloudflare Pages,
without authentication, camera uploads, recordings, or an inference backend.

[Branch guide](README.md) · [C4 architecture](docs/architecture.md) ·
[On-device inference ADR](docs/adr/0001-browser-v2-on-device-inference.md)

## Current release

Live web app: https://carewatch-v2.pages.dev/

The browser UI, feature port, trained LSTM port, worker integration, detector tests
and UI-helper/contract tests are implemented. MediaPipe Tasks Vision 0.10.32 is pinned and
approved; the runtime and model are packaged as same-origin static assets.
Previous runtime QA exercised 40 recurrent pose/classifier frames in the real worker, and the full
UI ran on a clearly labeled public-image MediaStream under production CSP.
This is runtime validation, not physical-camera qualification or fall accuracy.
Offline candidate trackers and trained fusion models are separate development work;
they are not imported by the current worker or automatically included in a release.

## Design

- Rule-based posture/transition checks are separate from the original LSTM
  and run by default without room marking. Users may optionally draw floor
  polygons and bed/sofa exclusions on the camera view. Session-only zones
  clear on Stop, camera change, page hide, or changed camera aspect ratio.
  Moving a camera without changing aspect ratio cannot be detected: recalibrate.
- Posture labels use visible shoulders/hips and at least one complete leg chain,
  pixel-corrected angles, knee bend and body proportions. A horizontal torso
  alone is insufficient. Extended or curled down-body geometry supplies evidence.
  Eight seconds of observed down evidence triggers "Person may be down", even
  when already down at startup or when the LSTM says non-fall.
- A stable standing/sitting baseline followed within 1.5 seconds by hip drop,
  collapsed vertical body span and torso rotation selects the transition path.
  Two seconds of observed down evidence then triggers "Possible fall". A single
  frame or a brief low movement does not trigger this path. Thresholds are
  current defaults, not clinically validated response times.
- Brief unclear/missing observations up to 0.75 seconds preserve evidence but
  add no time. Long gaps, exclusions, region edits, new IDs, and sustained
  recovery reset it. Exclusions suppress displayed warnings from either path;
  raw classifier outputs remain available in diagnostics. Drawing pauses new
  posture/transition checks, not the original classifier.
- Single-person tracking permits a larger displacement only with overlapping
  full-body boxes; multi-person matching is not relaxed. Hidden head landmarks
  pause/reset the LSTM but do not suppress independently valid torso/leg checks.
  Tiny torso/body geometry is rejected; this is not a guarantee against a pose
  hallucination. Original classifier weights and feature formulas are unchanged.
- This is 2D posture, not depth/floor-contact measurement. Intentional lying,
  including on beds/sofas without exclusions, may trigger warnings. Occlusion,
  foreshortening, kneeling/crouching, incorrect zones, movement toward the camera,
  and camera motion can cause misses or false warnings. An ideal camera position
  does not eliminate these limitations. No measured sensitivity or false-alarm
  rate is claimed; real-world representative recordings are still required.
- Per-person diagnostics expose movement-history progress, LSTM raw class/logit,
  fall-filter reason, and person-down reason/timer. Scores are not probabilities.
- Start camera asks for video permission only; phones can select front/back
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
- Green means a tracked/inferred posture, not clinically safe. Red is a possible
  fall or sustained-down warning. Local sound is enabled initially and optional.
  The app cannot confirm physical impact or contact emergency services.
- Model assets are self-hosted, hashed, and contain no camera imagery. Hosting
  receives normal asset-request metadata but no camera frames/predictions.

## Interface and branding

This release includes the Supreme AI Ventures brand refresh and the streamlined
camera-first interface described below.

Plain HTML/CSS/JS with no new dependencies. Styling follows the Supreme AI Ventures
palette (dark teal, off-white, mint) and the self-hosted Instrument Sans variable font
(SIL OFL; license in `browser/assets/`). No remote fonts, scripts, or images are loaded,
so the production CSP is unchanged. The company logo is the unmodified first-party
asset, linked from a small "by Supreme AI Ventures" attribution; Carewatch keeps its own mark.

- The camera is the main workspace. Idle shows only a camera picker and Start; Stop
  replaces Start while a session is pending or active, so cancelling a permission or
  model-load wait stays possible. Skeleton and box toggles stay visible; sound, mirror,
  placement tips, optional room tuning and diagnostics sit in collapsed `<details>`.
- State is shown by text plus a dot tone (`#status[data-tone]`): off, waiting for
  permission, loading detector, looking, tracking, evaluating, warning, error. Tracking
  is never labelled safe. Privacy and detection-limit/no-emergency-service copy is always
  visible beside the controls.
- The warning (`#alert`, `role="alert"`) is fixed above the iOS safe area, red, and sits
  inside `#viewer` so it also shows in full-screen view. Dismiss only hides it.
  Fullscreen also retains a local-alerts/no-emergency-dispatch notice.
- Full screen of the camera view (`browser/ui.js`) is feature-detected and hidden where
  unsupported (e.g. iPhone Safari). It is only offered while the camera is active and is
  exited on Stop. `tests/ui.test.js` covers the helper.
- The stage takes the camera's aspect ratio (`--video-ratio`), so video is not cropped;
  overlay and region-drawing math are unchanged (contain-fit, mirror-aware).

## Verification

The UI refresh has detector and UI-helper/contract tests; run `npm test` for the
current checkout's results rather than treating a historical test count as a reliability metric.
Previous browser QA under production CSP used labeled public-image and synthetic
fixtures: permission denial, active Start/Stop, independent overlay/mirror toggles,
fullscreen warning visibility, dismissal and a drawn furniture exclusion. Layout
has no horizontal overflow at 320px or 390px. Desktop and phone previews were
visually inspected. No physical-camera or real-fall accuracy claim follows.

`npm test` uses Node's built-in test runner; it needs no installed dependencies.
The parity fixture is generated from the original feature function bodies and
an independent NumPy float32 LSTM reference. It covers 80 recurrent steps with
unchanged checkpoint weights. This is numerical parity, not a real fall test.
Synthetic movement tests drive the actual adapter, tracker, retained classifier,
posture monitor and UI warning policy at 5 and 18 Hz. They cover no-region startup,
standing/sitting-to-down, visibility gaps, hidden heads, curled posture, recovery,
exclusions and invalid timing. They do not exercise a real MediaPipe fall video
or prove that any particular user-reported miss is fixed.

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

Building is not release approval. Do not deploy an offline detection candidate until
its reliability gates and release review have passed. The documentation/branding changes
do not authorize changing the live detector.

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
`http://127.0.0.1:8769/browser/index.html?fixture`, and use Start/Stop and toggles.
The server injects a prominently marked public-image test stream; the production
app never substitutes fake camera footage. The `&denied` query tests denial UI.
The `&down` query additionally substitutes explicitly labeled synthetic pose
output using the actual PersonDownMonitor to test warning rendering, timing,
exclusion editing, and dismissal. It is not evidence of model accuracy.

Upstream license: `LICENSE`. Keep the upstream MIT notice in the web deployment
and include MediaPipe's Apache 2.0 notice.
