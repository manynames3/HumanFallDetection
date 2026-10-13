# Recorded-video reliability benchmark

This is local developer tooling, not a production camera mode or a reliability certification.
No footage, pose traces, trained candidates, or QA routes are deployed to Cloudflare Pages.
No production dependencies or live detection settings change.

## Sources and permissions

- GMDCSA24, author repository `ekramalam/GMDCSA24-A-Dataset-for-Human-Fall-Detection-in-Videos`,
  pinned commit `5abac7693229900cf80f722e878fbb119211fc1c`.
  The author's repository has an MIT license (Ekram Alam, 2024).
  Cite Alam, Sufian, Dutta, Leo, Hameed, *GMDCSA24: A Dataset for Human Fall Detection in Videos*.
  This revision contains 79 Fall and 81 ADL files; use actual files, not counts from other versions.
- CAUCAFall v5, https://data.mendeley.com/datasets/7w7fccy7ky/5,
  DOI `10.17632/7w7fccy7ky.5`, CC BY 4.0.
  Credit Jose Camilo Eraso, Elena Muñoz, Mariela Muñoz, Jesus Pinto.
  All ten activities from subjects 1 and 10 are preselected as an independent challenge.
- These copyright licenses do not grant unrelated likeness/privacy rights. Keep footage local;
  do not reuse identifiable faces in marketing or redistribute the footage through the app.
- OmniFall was considered but not used: its annotations have noncommercial restrictions,
  and the original video sources have their own terms.

## Protocol

1. Download author-hosted footage; verify Git blob hashes or publisher SHA256 hashes.
2. Preserve original annotations. Two malformed GMDCSA subject-4 onset ranges remain unknown,
   rather than inferred from model predictions. CAUCA onset uses author label `1=fall`
   and original video FPS; `classes.txt` is verified.
3. Decode lossless PNG frames with installed FFmpeg at 18 Hz. Never freeze the last frame,
   stretch a clip, or synthesize extra down-time to satisfy an alert timer.
4. Each fresh bitmap runs real MediaPipe (pinned project runtime), actual `Detector`,
   `PersonDownMonitor`, and `warningKind`. All original rules run without marked furniture.
   Lite uses the unchanged production model/options; Full uses Google's official v1 bundle.
5. GMDCSA subjects 1–2 are training; subject 3 selects thresholds/epochs; subject 4 is test.
   CAUCA is never used for fitting or selection. No random adjacent-frame train/test split.
6. The offline candidate is a small tanh MLP over 0, 0.25, 0.5 and 1 second of past
   torso-relative pose features and visibility masks, plus hip displacement.
   It abstains for unclear torsos or multiple bodies. It is not a production replacement.
   Normalization fits training samples only. Scores are not calibrated probabilities.
7. Count fall clips with warnings after labeled onset, missed fall clips, and ordinary clips
   with any warning. Keep short/occluded cases in the denominator. Unknown onsets cannot
   support latency or strict event matching; report them separately.

The initial paused-video replay was invalid: the browser supplied a cached first frame.
Those counts must not be used. Only traces marked `ffmpeg-lossless-png-bitmap-v1` are accepted.
The corrected capture was checked on an actual moving fall: all 105 frames had distinct
landmark outputs and the posture changed from standing to lying.

## Reproduce

Requirements: Node, installed FFmpeg/FFprobe, and a browser. Optional automation uses Ego Browser.
All downloads and outputs are ignored under `tests/fixtures/generated/video-benchmark/`.

```sh
node tools/fetch_video_benchmark.mjs
node tools/fetch_cauca_challenge.mjs
node tools/prepare_video_frames.mjs
node tools/prepare_video_frames.mjs --cauca
python3 tests/fixture_server.py
```

Open `http://127.0.0.1:8769/tests/video-benchmark.html`. In the page console,
`await benchmark.run({split: 'train', model: 'lite'})` runs recorded footage, not a camera.
Repeat validation and model variants. The automation runner saves complete traces:
in Ego Browser, set `globalThis.benchmarkOptions={space: YOUR_EXISTING_SPACE_ID,
split:'train',model:'lite'}` then import the absolute file URL of `tools/run_video_benchmark.mjs`.
Reuse one TaskSpace for the whole evaluation.

After extracting training and validation traces:

```sh
node tools/train_video_candidate.mjs lite
node tools/train_video_candidate.mjs full
```

Freeze the generated candidate hashes before running `{split:'test'}` and
`{split:'external',source:'cauca'}`. Do not tune after seeing those results.
Then `node tools/report_video_benchmark.mjs` creates the complete comparison.

## Limits

These are small, staged datasets. GMDCSA includes falls onto beds and broad fallen-state labels,
not solely floor falls. CAUCA labels use a different annotation convention. They are useful
engineering tests, not evidence of representative real-world sensitivity or false alerts per
camera-day. Fixed-rate offline replay does not test low-rate phones, dropped frames, physical
camera qualification, live UI sound, background operation, or remote notification delivery.

## Observed run, 2026-10-12

All 180 source videos were evaluated with both pose variants (360 recorded-video replays).
Two compact classifiers were actually fitted locally, not substituted with hand-written scores.
Full was selected by validation event F1; it was not chosen using test performance.

| Pose | Split | Original policy: warned fall clips | Original: false-warning ADL clips | Trained candidate: warned fall clips | Candidate: false-warning ADL clips |
| --- | --- | --- | --- | --- | --- |
| Lite | Train | 31/41 | 14/39 | 39/41 | 0/39 |
| Lite | Validation | 10/21 | 7/22 | 18/21 | 3/22 |
| Lite | Held-out subject | 3/17 | 4/20 | 12/17 | 5/20 |
| Lite | Independent CAUCA | 7/10 | 3/10 | 6/10 | 1/10 |
| Full | Train | 25/41 | 14/39 | 41/41 | 1/39 |
| Full | Validation | 13/21 | 5/22 | 20/21 | 3/22 |
| Full | Held-out subject | 5/17 | 5/20 | 12/17 | 7/20 |
| Full | Independent CAUCA | 6/10 | 0/10 | 8/10 | 3/10 |

Two held-out GMDCSA clips have unknown onset; those two contribute only clip-level warning
coverage, not onset-matched sensitivity or latency. The remaining clips use author onsets.
Short recordings limit warning opportunities, especially the 8-second sustained-down path;
they were not removed from the denominator or artificially extended.

The results do **not** establish that the new candidate is consistently more reliable.
Its good training/validation fit does not eliminate missed events or false warnings on unseen
people/camera setups. Neither candidate is promoted to the live app. These findings justify
broader, more diverse training and evaluation, not deployment based on a 95% validation score.

Frozen candidate SHA256:

- Lite: `f2e5ff549151be5ba1f7a6ef922f7314cfade60f78ac05360c5a922212501597`
- Full: `462a481bdc19e2f3ab2874964e014b85bcd8d5d04eb43a5f531f77c0037c6b8a`

Detailed per-clip results, raw pose traces, model weights and training curves remain local
under `tests/fixtures/generated/video-benchmark/`. Temporary decoded PNG caches can be
regenerated from retained original videos with the preparation commands above.
