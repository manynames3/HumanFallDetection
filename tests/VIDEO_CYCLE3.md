# Reliability cycle 3 — fixed development failures, entirely new final footage

Written before extracting/scoring new footage. No deployment or live model promotion.
Previous test people/cameras are **seen development/regression**, never fresh tests again.

Frozen classifier: cycle-2 temporal model SHA256
`a0c0d5242405bc2f1660dc3c28f6afa7cf64248a5654b335666c3c1c041a04ba`.
Investigate tracking, confidence-mask flicker and transition-aware decision policy before more
epochs. Preserve old models/traces/results; do not tune on new final footage.

## Fresh final selection

- Entire IKAR source (RODBUK/AGH v1, DOI 10.58032/AGH/A1NZPE, CC BY 4.0) reserved for final
  evaluation. Six evenly-spaced numeric video IDs in each of four categories: 24 clips. All
  source participants/views are absent from development; participant-level IDs are not supplied.
  Spatial boxes are not fall-onset labels, so report clip warning coverage only unless event
  annotations are independently verified. No ordinary-activity files are provided by this source.
- Entire FallVision source (Harvard Dataverse v2, DOI 10.7910/DVN/75QPKK) reserved for final.
  Dataset publisher metadata specifies CC0 1.0, distinct from the paper's CC BY-NC license.
  Selected raw archives: f_raw_b_3, f_raw_s_2, nf_raw_b_2, nf_raw_s_2. Four evenly-spaced
  filename-ordered MP4s per archive: 16 clips, expected 8 fall/8 ordinary. Preserve subject
  names and source directories. Do not infer event onsets from predictions or masked-pose videos.
- Unseen Ursul participants 1/2 (four evenly-spaced activity codes per class) and participant
  15 (four fall-only activities): 20 clips. Participant 15 falls and participant 2 ordinary
  activity use LOC5, absent from previous fitting/testing. This is a new viewpoint/room, not
  evidence of a different physical phone model.

No new source/participant enters fitting or parameter selection. Exact camera hardware IDs
may be unavailable: describe new source/views honestly, not certified camera-model generalization.
Check exact-byte duplicates against the previous selected corpus. Preserve author licenses,
checksums and attribution. Privacy/likeness rights are separate: keep identifiable footage local.

## Candidate and selection

Implement identity-safe association, duplicate-pose suppression and confidence-aware past-only
smoothing. Never fill missing observations with stale coordinates, count unseen time as positive
evidence, link arbitrary people across crossings or retain history through camera resets.
Require observed transition/body support compatibility, not horizontal posture alone. No mandatory
furniture marking. Automatic support-line proxies are not depth or proof of physical floor contact.

Use all previous development and regression footage (359 clips) for selection, with the three
reported failures as explicit regression constraints. Predeclared policy grid: evidence window
0.6/0.9s, required observed evidence 0.15/0.25/0.35s, transition retention 1.5/3s. Threshold remains
the frozen classifier's 0.95. Select minimum missed clips + 3×ordinary false-warning clips;
tie fewer false warnings then higher recall. All three reported regression tests must pass.
Freeze policy parameters and code hash before new final inference/evaluation. Report failures,
source-specific results, low-rate stress tests and the uncertainty of short/clip-only datasets.

Do not claim improved unattended reliability from these samples. No deployment until misses and
false alarms improve consistently, with subsequent long-duration and live-device qualification.

## Development revision before any new final scoring

The initial mandatory support-reference policy passed all three symptom regressions but worsened
development fall coverage from 136/176 to 92/176 (false-warning ordinary clips 8/183 to 2/183).
Rejected as overly conservative; initial selection is retained separately, not used as a success.
Revise support history to admit visible upright torsos when feet are temporarily unavailable,
retain an explicit unknown-support state, and veto controlled reclines rather than requiring a
ground-plane proxy for every decision. Border clipping and identity safety remain enforced.
Reuse the same predeclared parameter grid and entirely untouched final sources. No new footage
was scored before this revision. This remains pose-only: inferred support is not scene semantics.

The revised rule policy also lost development sensitivity (108/176 vs 136/176). Before opening
fresh tests, add a learned fusion candidate trained with the **same stabilized inputs used at
inference**: 75 temporal pose features plus 12 causal track/transition/support/context features.
Use 24 tanh hidden units, seed 41723, 80 epochs, training-only normalization. Training groups:
GMD 1/2; CAUCA 2–7/10; Ursul 3–7/9/13; the two now-seen UMA negative regressions. Selection
groups: GMD 3/4; CAUCA 1/8/9; Ursul 8/10/14/20; other UMA clips. These are development,
not fresh validation claims. Unknown-onset training falls receive no invented frame labels;
the frozen prior supplies their previously learned signal. Threshold grid 0.7/0.9/0.95/0.98/0.995,
same evidence window/duration grid, minimum misses + 3×false-warning clips, required three-case
regression pass. Freeze selected weights and all inference code before final evaluation.

## Frozen candidate and tracking diagnostic

Selected fusion weights SHA256
`ef42efc8613ba8d64ce5c9dfd8eb17e97a5af1e6a222d289fc49441f1315fc71`;
inference code SHA256
`b3a6a2bfe4b0d1d6647a0721a36f4f8a36a7f9d4c0b01e595d4a67c59138414c`.
Frozen at 2026-10-13T04:56:22.005Z, before opening fresh test results. Selected
epoch 40, threshold 0.995, evidence 0.25s in a 0.6s observed window. The sigmoid
threshold is not a calibrated reliability percentage. All 51 automated tests pass;
those tests do not establish clinical or unattended performance.

Evaluation-only IKAR actor-box association uses two fixed IoU thresholds, not tuned
against results. At IoU 0.1, the candidate observes 1,436/1,628 annotated replay frames
vs 1,361 previously, and missing runs decrease 59 to 45. However, consecutive matched
ID changes increase **39 to 104**. At IoU 0.3, observed frames change 1,143 to 1,162,
missing runs 107 to 106, and ID changes **26 to 72**. This is a tracking regression,
not a completed fix. Reject promotion of this candidate. Preserve the frozen model
and finish its final evaluation without further tuning on these test results.

These are approximate spatial-association diagnostics, not IDF1/MOTA: source frame
alignment can differ by one frame, skeleton bounds differ from actor boxes, and
unannotated bystanders/hallucinations are not assessed. Full details are stored in
the local generated `cycle3/tracking-report.json`; the script is reproducible.
