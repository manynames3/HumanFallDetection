# Cycle 6: clip review, observation repair and actual model training

2026-10-13. **Release gate failed; no deployment.** This follows the initial
[diagnostic tooling report](VIDEO_CYCLE6.md). No money was spent on new services,
hardware, dependencies, compute or API usage. Claude used the existing confirmed
subscription; all training/evaluation ran locally with installed NumPy/Node.

## Outcome

The new 5,809-parameter causal temporal model reduces both error counts on the
combined EDF development recordings. It does **not** reduce both endpoints on
the broader activity set or the participant excluded from fitting. It is an
inspectable research candidate, not a qualified fix for the deployed detector.
Walking regresses. Bed entry remains quiet in the named regression clip.

| Evaluation | Frozen native v5: misses / false | New TCN: misses / false |
| --- | ---: | ---: |
| EDF 18 Hz, all five people | 44 / 16 | 26 / 12 |
| EDF 6 Hz, all five people | 41 / 17 | 25 / 15 |
| EDF 18 Hz, seen participant excluded from fitting/selection | 7 / 2 | 2 / 2 |
| EDF 6 Hz, same excluded participant | 6 / 2 | 2 / 3 |
| Original 359 fall/activity clips | 38 / 4 | 33 / 12 |

EDF has 80 camera-events: **40 staged falls paired across two views**, five
people, 28.19 camera-minutes total, but only 574.6 seconds (9.58 camera-minutes)
of reviewed normal exposure. Its false column counts warning **episodes**, not
false clips. The original corpus has 176 fall clips and 183 ordinary-activity
clips; its false column counts activity clips with a warning. The rows are not
interchangeable false-alarm rates and are not independent clinical trials.

All these recordings are previously seen development data. EDF training actors
are jianjun/jinhui/peter; selection actor songsong; excluded-from-fit seen retest
actor zhong. The aggregate improvements include training actors. Neither the
excluded actor nor the existing cameras can be called a genuinely unseen test.
Production Lite (44 misses/13 false episodes) and the previous temporal model
(43/9) are separate frozen comparators: beating one aggregate does not erase the
broader regression or establish superiority to the prior false-alarm count.

## Source review and observation bottleneck

Codex and Claude inspected 33 six-frame source contact rows, including all16
mined false episodes and selected visible/cropped/no-pose misses and controls.
See [the review summary](../research/reviews/2026-10-13-claude-clip-review.md).
These are AI-assisted source observations, not independent human labels or
full-video adjudication. No AI judgment was used as a training target.

The strict tracker rejects partly cropped core joints. The anchored continuation
retains them only for an existing matched ID, with unchanged core confidence,
at least half the torso segment in frame, and a full-frame anchor no older than
one second. Cropped observations cannot create or renew an anchored track.
Boxes use visible points; hidden coordinates remain estimates, never fabricated
visible joints. Confidence and association ambiguity safeguards remain in place.

All20 actual18/6-Hz traces verified exact baseline tracking, feature-vector,
warning-time and metric parity in strict mode before the comparisons below.

| Observation comparison | 18 Hz: misses / false | 6 Hz: misses / false |
| --- | ---: | ---: |
| Frozen native v5 | 44 / 16 | 41 / 17 |
| Anchored cropped continuation | 41 / 17 | 39 / 18 |
| Anchored history retained, current cropped pose not scored | 44 / 16 | 43 / 17 |
| No-anchor crop-admission control | 41 / 17 | 39 / 17 |
| Actual-observation lag repair only | 43 / 16 | 41 / 17 |
| Anchor plus lag repair | 40 / 17 | 39 / 18 |

None reduces both endpoints. The crop repair rescues three18-Hz camera-events,
but adds a songsong-view2 false episode and lengthens some ordinary warning
time. This rules out presenting tracker retention alone as the reliable fix.
The lag rule uses only an actual recent same-ID observation at/before the target
time; it never interpolates missing poses or scores an absent current person.

Coverage remains a bottleneck: the frozen diagnostic report detects35/43 events
with at least90% eligible coverage versus1/37 below90%. Eligibility is a code
gate, not verified anatomical accuracy, and the association is not causal proof.
Some falls are outside view; other visible falls lose/wrongly estimate joints.
Stable IDs alone do not repair those source observations.

## Actual training, not another claim of unchanged weights

`tools/video_tcn_v6.mjs` implements18 causal time bins at6 Hz (2.833 seconds
between oldest/newest),13 joint XYZ values with visibility masks, a frame mask
and observed hip displacement. Depth is MediaPipe's **estimated** coordinate,
not a depth sensor measurement, true gravity or guaranteed metric3D. Missing
bins/joints remain zero-masked; current absence cannot supply a model score.

Two causal convolution layers (kernel5,16 channels, second-layer dilation3)
have5,809 trainable parameters. The local NumPy trainer uses a fixed seed,
40 epochs, and selects only between epoch20/40 by weighted selection BCE.
Threshold remains.98 and the warning policy remains.6s window/.15s observed
positive evidence. Normalization is fit only on training values. Horizontal
mirroring is training-only. The optimizer is Adam with bounded gradients.

Training contained17,372 samples including mirrored duplicates; selection had
5,906. These are correlated windows, **not that many independent falls/people**.
Original208 training/151 selection clip groups are retained. Unknown onsets and
ambiguous EDF intermediate intervals are omitted; source-labelled descent/recent
process and reviewed normal prefix/tail intervals supply targets. No public
research label was silently changed based on an AI review.

Epoch20 was selected (weighted selection BCE0.7562); epoch40 worsened to1.5605.
This is a warning about generalization/overfitting, not proof that more training
would improve deployment. Grouped supervision and weighting need further audit.
This binary-target exploratory study is **not** the plan's independently
reviewed state-target ladder or its three-seed qualification study.

Model SHA-256:
`8a5cfb0caf95ba243f9e18b4597a5ad8bb5c059255f3f80d551514b2bc6a12fc`.
Recipe/source/data/model hashes and optimizer/RNG checkpoint state are preserved.

## Controls and rejected calibration

| Model/control | EDF18: misses / false | EDF6: misses / false | Original359: misses / false |
| --- | ---: | ---: | ---: |
| Frozen native v5 | 44 / 16 | 41 / 17 | 38 / 4 |
| TCN with estimated depth | 26 / 12 | 25 / 15 | 33 / 12 |
| Matched zero-explicit-depth-coordinate TCN | 26 / 11 | 23 / 18 | 44 / 13 |
| Estimated-depth TCN plus upright guard | 27 / 12 | 25 / 14 | 39 / 9 |
| Zero-depth-coordinate TCN plus upright guard | 27 / 11 | 23 / 18 | 49 / 11 |

The depth control zeroes joint-Z and hip-delta-Z inputs but **retains the original
3D normalization**. It is not a pure2D retraining result. Training budget,
labels, split, architecture and policy match. The upright guard uses existing
stance logic with two complete leg chains; it does not solve walking and loses
true detections. It is rejected.

Guard-freeze wording erratum: “resets classifier evidence” in its generated
freeze description is imprecise. The implementation suppresses the current
positive and breaks positive adjacency; earlier eligible intervals can remain
in the.6-second policy window. The archived bytes are preserved unchanged;
the actual implemented semantics, not the description, produced these results.

A separate, disclosed post-observation calibration declared only.98/.995/.999,
using existing selection clips and the selection EDF actor. Neither excluded
retest data nor reserved new people were used to choose it. Qualification
required strictly fewer misses AND false alarms on both selection sets.

| Threshold | Original selection: misses / false | EDF selection: misses / false |
| --- | ---: | ---: |
| Frozen native baseline | 22 / 4 | 9 / 4 |
| .98 | 18 / 10 | 8 / 2 |
| .995 | 26 / 7 | 7 / 0 |
| .999 | 31 / 4 | 7 / 0 |

No threshold qualified; `selectedThreshold` is null. Higher cutoffs cannot be
presented as a fix while they miss more falls or merely tie false alarms.

## Fresh data boundary and remaining prerequisites

Before inference/training,24 cached Ursul clips were reserved by publisher
subject IDs16/17/18/24/25/26,12 fall/12 activity. Numeric direction/repetition
selection avoids score-based mining. The archive's MD5/size, manifest SHA and
duplicates against previous manifests were checked. No prediction or pose trace
was generated/opened for these reserved clips in this attempt.

They use an already-known camera/source, and are only1.87–1.90-second clips
with weak clip labels; they cannot qualify long continuous monitoring, onset
latency or an unseen camera model. Because the candidate already fails walking
and broader false-alarm gates, this fresh reserve was **not consumed** to search
for a flattering result. No unseen-person/camera success is claimed.

The highest-value unresolved prerequisites are independent source/visible-joint
adjudication of the ambiguous cases, stronger continuous ordinary-activity
exposure, and one bounded observation-backend comparison on identical pixels if
the audit confirms wrong/missing poses. There is no basis here for inventing
hidden joints, treating dropout as a fall, or claiming thresholds solved intent.
Background browser operation, actual notification delivery/latched alert burden,
multi-person attribution and real-phone thermal/latency behavior remain untested.

## Local reproduction

Existing video/pose caches and the frozen native-v5 archive are required. No
script downloads data or installs libraries automatically. Run from repo root:

```sh
node tools/evaluate_cropped_cycle6.mjs
node tools/evaluate_lag_cycle6.mjs
node tools/prepare_tcn_cycle6.mjs
python3 tools/train_tcn_cycle6.py --self-test
python3 tools/train_tcn_cycle6.py --data tests/fixtures/generated/video-benchmark/cycle6-tcn
node tools/evaluate_tcn_cycle6.mjs
node tools/prepare_tcn_depth_control_v6.mjs
python3 tools/train_tcn_cycle6.py --data tests/fixtures/generated/video-benchmark/cycle6-tcn-no-depth
node tools/evaluate_tcn_depth_control_v6.mjs
node tools/evaluate_tcn_guard_cycle6.mjs
node tools/calibrate_tcn_cycle6.mjs
python3 tests/train-tcn-resume.test.py
node --test tests/*.test.js
```

Use the existing NumPy-enabled interpreter when `python3` lacks NumPy. Identical
research JSON reruns fail closed on different bytes rather than replacing
evidence. The trainer resumes only a matching source/data/recipe contract and
atomically saves checkpoint state everyfive epochs. Its deterministic exports
can be regenerated from the matching checkpoint. Changed experiments require
new recipe/output IDs; do not rewrite a failed frozen report.

## Verification performed

- Numerical gradients: max absolute discrepancy1.035e-11 over30 sampled
  parameters, and a descent-step check passed.
- JavaScript inference matches32 independent NumPy reference vectors within1e-6.
- Final full local JavaScript suite:115 passed, zero failures/skips, including
  the two added archive-integrity/executable-model checks.
- A real synthetic training run was terminated after a saved checkpoint and
  resumed; model/report/reference and all optimizer/RNG checkpoint arrays
  exactly matched an uninterrupted run. No video is used in that test.
- All20 continuous pose traces and359 old clips were evaluated, with fixed
  episode matching and process-end-plus3s deadline. Named walking/bed-entry/
  seated-fall regressions were explicitly checked.
- No trained candidate is imported into production. No commit, push or
  deployment was performed. Research software tests are not clinical validation.

## Claude final-review limit

The two source-image consultations completed. A later bounded read-only
code/results handoff authenticated successfully, then returned the subscription
session-limit message without a review. Calls stopped immediately; no credits,
paid fallback or model switch was used. No final code-review findings are
attributed to Claude. The earlier clip-review contribution remains documented;
Codex performed the implementation, training and verification above.

## Durable evidence

Models, recipes, complete comparison results, sample provenance and frozen source
are preserved in [the temporal-v6 archive](../research/candidates/temporal-v6/README.md).
The large frame/video/feature arrays and optimizer checkpoints remain local,
ignored, and are not added to a deployment. Archive checks pin bytes and fail
closed on changed evidence; earlier failed studies are retained rather than
overwritten by a more favorable result.

The archiver ran twice with identical output (49 indexed model/source/evidence
files). Both the older native-v5 and new temporal-v6 integrity tests passed.
Tracked Git diffs remain empty: only local research files/artifacts were added
or updated. Unrelated work was preserved. The genuine interrupted-training
comparison passed twice; the gradient check was also rerun successfully.
