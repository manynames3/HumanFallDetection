# Reliability cycle 2 — predeclared splits

No production detector or deployment changes. First cycle models and results remain immutable.
This protocol was written before any new participant footage was extracted or scored.

- CAUCAFall v5: new subjects 3–7 train; 8 validation; 2 and 9 sealed participant test.
  Each contributes all five falls and five ordinary activities. This is a new-person test,
  **not** a new-camera test: CAUCA uses the same camera installation.
- Existing GMDCSA subjects 1–2 train, 3 validation. Subject 4 is seen regression only.
  Previous CAUCA subjects 1/10 are also seen regression only, never described as fresh tests.
- UMAFall publisher demonstration videos: entire video collection reserved for a new-camera
  challenge, never fitting, epoch, threshold, persistence or model selection. No invented onset
  times: absent annotations permit only clip-level warning coverage, not latency/sensitivity.
  Source: https://doi.org/10.6084/m9.figshare.4214283.v8, CC BY 4.0;
  credit Eduardo Casilari, José A. Santoyo-Ramón, José Manuel Cano-García.
- Ivan Ursul video collection (Figshare 28596332 v2, CC BY 4.0): inspect provenance/archive
  structure before inclusion. Publisher paper Table 2 shows subjects 25–29 have no falls, so
  the initial numeric-range proposal is rejected **before extraction or scoring**. Revised
  split uses participants with both classes: 3–7, 9, 13 train; 8/10 validation; 14/20 test.
  Deterministic first repetition per activity/location, not chosen by detector success.
  Do not assume publication counts equal usable files.

Final Ursul selection is four evenly-spaced activity codes per class/person, first available
direction/repetition. Where a participant has fewer than four activity codes, spread deterministically
across directions/repetitions instead. The archive contains 2,014 grouped MP4 files; 2,013 match
the strict activity-path parser. Selected 88 files are individually hashed, with original paths
preserved. The selected videos are about 1.9 seconds, not the sensor-trace 8-second duration
described in the paper. Never stretch them to give a detector additional observations.

Fit normalization on training data only. Preserve frame labels and exclude ambiguous label
boundaries/recovery from positive training. Count clips with no usable poses as misses, not
exclude them. Compare candidates to both frozen cycle-1 model and unchanged production policy
on exactly the same fresh tests. Candidate selection uses development data only; final evaluation
is one-way and must not feed further tuning within this cycle. Report false warnings before
fall onset separately, ordinary-video duration, pose coverage, missed IDs and false-warning IDs.

Do not deploy based on clip accuracy. Staged short clips do not measure long-duration false
alerts per camera-day or performance on actual frail seniors, phones, occlusions and night scenes.
Copyright permission does not replace privacy/likeness rights: keep identifiable videos local.

Predeclared candidates: frozen Full pose extractor; 16-hidden-unit original temporal features,
and 32-hidden-unit articulated features (limb angles, identity-safe history, upright baseline).
Seed 41723, 120 epochs. Validation selection minimizes missed clips + 3×false-warning ordinary
clips + 3×known pre-onset-warning clips, with ties toward fewer false alarms then higher recall.
Threshold grid 0.5/0.7/0.9/0.95/0.98/0.995; persistence 0.3/0.6/1 seconds. No test-based retuning.
Ursul falls have clip-only labels: use explicit multiple-instance learning after a supervised
warm-up, selecting the highest-scoring contiguous observed 0.5s training window, not fabricated
onset annotations. This weak-supervision assumption may be wrong; external metrics with unknown
onsets remain clip coverage, not validated event detection. UMA stays reserved until model freeze.

## Completed run, October 12–13, 2026

Added **179 new clips**: 80 CAUCA, 88 Ursul, 11 UMA. The local selected corpus now has
359 distinct videos across four sources, with no exact SHA256 duplicates. New footage includes
different people, lighting, viewpoints, bedrooms, stairs, gym/outdoor scenes, kneeling, hopping,
bending, walking, bed movements and getting up from the ground. Source copyright permissions
were verified at the publisher; videos remain local and are not app assets.

Actually trained two new classifiers on 186 development clips, selecting against 69 validation
clips. The 16-unit temporal model beat the 32-unit articulated model on the predeclared validation
cost. Selected epoch 60, threshold 0.95, persistence 0.3s. Sigmoid scores are not calibrated
probabilities. Validation: 24/34 fall clips warned, 1/35 ordinary clips falsely warned, no warnings
before known source-positive ranges. No fresh test trace was read by the fitting script.

Frozen candidate SHA256, unchanged after all final evaluations:

- Temporal (selected): `a0c0d5242405bc2f1660dc3c28f6afa7cf64248a5654b335666c3c1c041a04ba`
- Articulated: `ed4834acc2f3c8f9f596cd0966b65918195bfca4e529579407a9a5c376f6f616`

At 18 Hz, on exactly the same videos:

| Evaluation set | Current Lite policy: falls / false ADL | Frozen cycle-1 Full candidate | Cycle-2 selected Full candidate |
| --- | --- | --- | --- |
| Fresh CAUCA people 2/9 | 7/10 / 3/10 | 9/10 / 7/10 | **9/10 / 0/10** |
| Fresh Ursul people 14/20 | 0/8 / 0/8 | 3/8 / 2/8 | **3/8 / 0/8** |
| Entirely unseen UMA source camera | 3/3 / 2/8 | 3/3 / 3/8 | **3/3 / 2/8** |
| Seen GMD subject 4 regression | 3/17 / 4/20 | 12/17 / 7/20 | 12/17 / 5/20 |
| Seen CAUCA people 1/10 regression | 7/10 / 3/10 | 8/10 / 3/10 | 9/10 / 0/10 |

Fresh aggregate: missed fall clips **11 → 6 of 21**; false-warning ordinary clips **5 → 2 of 26**.
This is not clinical sensitivity: 11 fresh fall clips have no onset annotations, and the Ursul
clips are shorter than the current policy's warm-up. The CAUCA source-interval check independently
confirms 9/10 new-candidate vs 7/10 current warnings inside author fall-positive intervals.
No unknown onset was fabricated. Two seen GMD fall onsets also remain unknown.

Fresh tests contain only ~510 seconds of ordinary-video duration, including UMA title/graph
cards. The candidate has eligible single-body geometry for only ~291 seconds of it. This is
**not** hours of continuous natural activity and cannot establish false alerts per camera-day.
UMA demonstrates a new source/viewpoint; its participant identity and camera hardware model
are not verified. CAUCA new people share the training camera installation.

### Low-rate stress test

Actual MediaPipe inference was repeated on fresh source bitmaps at 6 Hz (not simply dropping
already-computed poses). Same frozen model, no changed thresholds:

| Set | Candidate warned falls | False-warning ADL |
| --- | --- | --- |
| Fresh CAUCA | 10/10 | 0/10 |
| Fresh Ursul | 2/8 | 0/8 |
| UMA | 3/3 | 1/8 |

The change in which clips warn across rates shows temporal/pose/tracking instability. It does
not prove phones can run the Full model at 6 FPS or validate notification delivery.

### Remaining failures and release decision

- All six fresh 18 Hz misses had some high candidate scores, but those observations did not
  satisfy continuous score/eligible-geometry/identity evidence. This is diagnostic evidence of
  interrupted warning evidence, not a reason to blindly lower the threshold or retain stale poses.
- The new-camera false warnings were **walking** and **lying down/getting up from bed**.
  The model still cannot reliably distinguish intentional bed movements from a fall across rooms.
- The seen GMD regression has 5/20 false-warning clips vs 4/20 for the current Lite policy.
  The candidate is not uniformly superior on every set.
- Single-person features abstain with multiple raw pose detections. This can reject hallucinated
  bodies safely, but also miss real activity when another person appears. Multi-person handling,
  occlusions, actual older adults and continuous monitoring are not qualified.

**No deployment or live model replacement.** More epochs alone do not resolve the identified
continuity and scene/intent problems. A future cycle must validate any temporal stabilization or
scene-aware changes on a newly reserved test set; these test people/cameras are now seen data.

39 automated tests passed, including new recovery-label, identity-reset and past-only geometry
tests. No production dependency, runtime model or app setting changed. Source videos, hashes,
pose/decision traces, training curves and weights are retained locally. Decoded PNGs are
regenerable temporary caches and may be cleared after the completed run.

## Reproduce this cycle

```sh
node tools/fetch_cauca_challenge.mjs --cycle2
node tools/fetch_figshare_videos.mjs 4214283 28596332
node tools/prepare_ursul_manifest.mjs
node tools/prepare_uma_manifest.mjs
node tools/prepare_video_frames.mjs --cycle2
node tools/prepare_video_frames.mjs --ursul
node tools/prepare_video_frames.mjs --uma
python3 tests/fixture_server.py
```

Use one Ego TaskSpace and the existing runner. Set `benchmarkOptions` with `cycle:2`,
`model:'full'`, source `cauca-cycle2` or `ursul`, and split `train` then `validation`.
Original GMD Full traces from cycle 1 are reused. Run `node tools/train_video_cycle2.mjs`.
Freeze `cycle2/selection.json` and its model hash before final test/external replay.
Run fresh CAUCA/Ursul `test` and UMA `external`, both Full and Lite. Repeat Full fresh sets
with `samplingHz:6`. Use new module-import query suffixes for each automation run.
Finally run `node tools/report_video_cycle2.mjs --stress` for results and failure diagnostics.
Do not repeat fitting based on these final results and call the same people/cameras unseen.

Outputs are ignored under `tests/fixtures/generated/video-benchmark/cycle2/` and `results/`.
The live app's alert policy is **not** the new standalone candidate; simply OR-ing its warnings
with the old policy would retain the old false alarms and requires separate integration tests.
