# Carewatch browser v2

This fork retains the original MIT HumanFallDetection Python source and weights.
The separate `browser/` application is designed for static Cloudflare Pages,
without authentication, camera uploads, recordings, or an inference backend.
The existing person-down-core pilot is not changed by this fork.

## Current checkpoint

The browser UI, feature port, trained LSTM port, worker integration, and six
detector tests are implemented. Browser MediaPipe dependency approval is pending.
**Do not deploy this checkpoint as a functioning detector:** the browser runtime
and pose asset are not packaged yet. Camera inference/browser runtime verification
must pass before release.

## Design

- Enable camera asks for video permission only; phones can select front/back
  cameras and computers can select connected webcams after permission.
- Stop, page hide, tab switching, or detector failure releases camera tracks.
- Skeletons, tracking boxes, mirror view, and local alert sound are independent
  switches. Overlay changes do not disable inference.
- Pose inference runs in a worker with a single frame in flight, targeting 18 Hz.
- Original LSTM checkpoint and feature order are preserved. The classifier is a
  JavaScript implementation of the two-layer, 48-unit PyTorch LSTM, not new rules.
- MediaPipe Lite is the proposed browser replacement for OpenPifPaf. This is a
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

## Release gate

After approval: pin/install MediaPipe Tasks Vision, package the approved existing
pose model, run the build, verify actual browser-worker inference and camera
lifecycle, inspect mobile/desktop rendering, then publish the `browser/` folder
to a separate Cloudflare Pages project. Do not overwrite person-down-pilot.

Upstream license: `LICENSE`. Keep the upstream MIT notice in the web deployment
and include MediaPipe's Apache 2.0 notice if that dependency is approved.
