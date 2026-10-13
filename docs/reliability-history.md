# Carewatch: improvement history, limitations and reasoning

Last updated: October 13, 2026. This is an engineering evidence record, not a
reliability certification or a claim that every implemented change was released.

[README](../README.md) · [Browser guide](../BROWSER_V2.md) ·
[C4 architecture](architecture.md) · [On-device inference ADR](adr/0001-browser-v2-on-device-inference.md)

## What runs in the browser versus what is research

The browser version uses self-hosted MediaPipe Lite pose estimation, the retained
upstream two-layer LSTM port, and separate rule-based transition/person-down
checks. It requests a browser-accessible camera and computes locally. The
original MIT research code/checkpoint, author credit and citation are retained.
Replacing upstream OpenPifPaf with MediaPipe changes the perception pipeline;
published upstream results cannot be attributed to Carewatch.

The trackers, learned fusion/native-joint models and new temporal convolutional
model below are offline research candidates. They are not imported by the
production worker. Their implementations and actual trained weights exist, but
their release gates have not passed. A research improvement is not automatically
a change in the live app, and documentation updates do not deploy anything.

## Browser improvement history

Dates here come from repository commits, not inferred release timestamps.

| Date / commit | Change | Reason and boundary |
| --- | --- | --- |
| Oct 2 — `cb9e3a4`, `0e0cef2` | MIT classifier port, camera UI and static Cloudflare Pages browser implementation. | Make phone/computer cameras usable without login, a camera-vendor SDK or per-frame cloud processing. Not direct RTSP ingestion or validation of upstream accuracy. |
| Oct 2 — `049c5f4` | Sustained person-down checks, optional room regions and diagnostics. | A classifier can miss the transition or start observing someone already down. A posture warning does not confirm a fall, impact or floor contact. |
| Oct 3 — `d9e2f2a` | Automatic standing/sitting-to-down and down-posture checks without mandatory room marking. | Reduce first-use setup friction while retaining optional furniture exclusions. Intentional lying and incorrect exclusions remain risks. |
| Oct 12 — `4055a16`, `8499c33` | Supreme AI Ventures branding, streamlined camera workspace and clearer wording. | Improve usability without obscuring privacy/safety limits or claiming improved detection from styling. |
| Oct 13 — `aaf71fa` | Browser/upstream branch guide, ADR, C4 views and camera-off interface screenshot. | Preserve upstream credit and distinguish web-app behavior from Python research capabilities. The screenshot is UI evidence, not fall accuracy. |

The browser's current down path requires eight seconds of observed down posture;
its transition path requires a prior standing/sitting baseline, a rapid observed
change, then two seconds of observed down posture. These are implementation
defaults, not validated response-time promises. Brief unclear observations add
no positive evidence. See [the browser guide](../BROWSER_V2.md#design) for exact
behavior and [the ADR](adr/0001-browser-v2-on-device-inference.md) for design choices.

## Research improvement history

Results below retain their original dataset/split/metric. Different rows must
not be stitched into a single accuracy trend: the tests and denominators change.
Previously opened holdouts become seen development data in subsequent cycles.
“New source/viewpoint” does not prove a new physical camera model.

### Cycles 1–2: better data and actual fitted models

Built an actual-frame replay pipeline using lossless decoded PNGs and real
MediaPipe inference. An initial paused-video replay supplied a cached first
frame; those invalid results were discarded. Fresh bitmaps replaced that input
path, rather than tuning against a broken test.

The corpus expanded to 359 clips from GMDCSA, CAUCAFall, Ursul and UMAFall.
Source annotations/checksums were retained, normalization fit only on training
data, and participant/source groups—not adjacent random frames—defined splits.
Temporal and articulated models were actually trained locally.

Cycle 2's small then-fresh aggregate improved missed fall clips from 11 to 6
of 21, and false-warning activity clips from 5 to 2 of 26 versus production
Lite. However, eleven fresh fall clips had no onset annotations, short Ursul
clips lasted about 1.9 seconds, and ordinary exposure was only about 510 seconds.
UMA walking and lying/getting up from bed still warned. Seen regressions and
low-rate instability prevented promotion. These sources are no longer fresh.

Evidence: [initial benchmark](../tests/VIDEO_BENCHMARK.md),
[cycle 2](../tests/VIDEO_CYCLE2.md).

### Cycles 3–4: tracking defects and conservative-policy tradeoffs

Added identity-safe association, duplicate suppression and observed temporal
evidence. Mandatory support-reference rules reduced ordinary warnings but lost
many fall detections, so they were rejected. Learned fusion was compared using
the same stabilized observations used at inference.

Actor-box proxy diagnostics exposed a regression: cycle 3 increased loose-IoU
matched ID changes from 39 to 104. A minimized repeated-ID reset cascade was
repaired in cycle 4; that proxy decreased from 104 to 48 with observed frames
unchanged. On frames observed by both systems, the result was still 44 changes
versus the original 39. This is neither ground-truth identity-switch counting
nor evidence that all tracking interruptions were fixed.

Cycle 4's 42 then-fresh clips showed 6/15 fall clips warned and 0/27 ordinary
clips warned, versus production's 4/15 and 1/27. Nevertheless, every model missed
the eight short Ursul falls, and the new models lost sensitivity on existing
development recordings. Better counts on one small set did not authorize release.

Evidence: [cycle 3](../tests/VIDEO_CYCLE3.md), [cycle 4](../tests/VIDEO_CYCLE4.md).

### Cycle 5: resumable replay and continuous-video reality check

The replay runner atomically checkpoints complete clips, hashes inputs/inference,
refuses corrupt or incompatible reuse, and preserves uninterrupted detector state
within each recording. Restarting no longer discards all completed work. Actual
recorded regression tests cover seated falls, walking and bed entry.

A trained native-joint model represents 13 joints, visibility masks and observed
motion at four past times. On the 359 seen clips, it improved the prior temporal
candidate from 43 to 38 misses of 176 falls and from 8 to 4 false-warning clips
of 183 activities. All three named regressions passed in that setting.

The then-fresh continuous EDF evaluation did not reproduce those gains:

| Frozen pipeline on the same EDF recordings | Misses / 80 camera-events | False episodes |
| --- | ---: | ---: |
| Production decision logic + Lite, 18 Hz | 44 | 13 |
| Prior temporal research model + Full, 18 Hz | 43 | 9 |
| Selected native-joint research model + Full, 18 Hz | 44 | 16 |
| Same native-joint model + Full, 6 Hz | 41 | 17 |

These are ten 320×240 recordings, five people and two paired views: 80
camera-events represent 40 staged falls. Total footage is 28.19 camera-minutes,
but reviewed normal exposure is only 574.6 seconds (9.58 camera-minutes).
Neither staged falls nor this brief normal exposure qualify real-world caregiver
notifications or false alerts per camera-day. EDF is now seen development data.

Evidence: [cycle 5](../tests/VIDEO_CYCLE5.md),
[frozen native-model archive](../research/candidates/native-sequence-v5/README.md).

### Cycle 6: diagnosis, bounded repairs and trained causal model

Added source-first review tools and coverage diagnostics; runtime fingerprints
now include WASM/glue assets for new replays. Codex and Claude inspected sampled
source frames from 33 selected clip windows. This is AI-assisted diagnosis,
not independent human annotation; those judgments were not used as training labels.

Bounded crop retention requires an existing matched track and a recent full-frame
torso anchor. It never creates a cropped new track, upgrades hidden joints or
fills missing observations. Strict-path parity was checked on all 20 saved
18/6-Hz continuous traces. At 18 Hz it changed native misses/false episodes
from 44/16 to 41/17: some rescues, but a false-alarm regression. It was rejected.
An actual-observation lag repair changed counts to 43/16; it also failed the joint gate.

The new 5,809-parameter causal temporal convolutional network uses roughly three
seconds of masked pose history and estimated depth. Missing current observations
cannot produce a score. Its weights are actually trained with existing local
NumPy; source/data/model hashes and optimizer/RNG checkpoints are retained.
Estimated depth is not a depth sensor, gravity reference or guaranteed metric 3D.

| Matched evaluation | Native v5 misses / false | New TCN misses / false |
| --- | ---: | ---: |
| Seen EDF, 18 Hz | 44 / 16 | 26 / 12 |
| Seen EDF, 6 Hz | 41 / 17 | 25 / 15 |
| Seen EDF participant excluded from fitting/selection, 18 Hz | 7 / 2 | 2 / 2 |
| Same excluded participant, 6 Hz | 6 / 2 | 2 / 3 |
| Original 359 seen clips | 38 / 4 | 33 / 12 |

EDF false counts are episodes; original-corpus false counts are activity clips
with warnings. The new model fits three EDF actors and selects against a fourth;
the aggregate includes training actors. Even the excluded actor was already
seen in earlier research, not an independent new-person qualification test.
Walking regresses; the named bed-entry clip stays quiet. **No promotion.**

The matched zero-explicit-depth-coordinate control, upright-stance guard and
higher-confidence selection cutoffs failed to improve both endpoints. The depth
control retains 3D normalization and must not be described as a pure 2D model.
Twenty-four new-subject clips remain reserved/unscored; they share a known camera
and are too short to qualify continuous monitoring.

Evidence: [diagnostics](../tests/VIDEO_CYCLE6.md),
[training/repair report](../tests/VIDEO_CYCLE6_REPAIR.md),
[AI source-review scope](../research/reviews/2026-10-13-claude-clip-review.md),
[actual weights and rejected comparisons](../research/candidates/temporal-v6/README.md).

## Why the latest model still misses events

A read-only follow-up replay used the archived cycle-6 model and actual saved
18-Hz poses. Recomputed warning times/metrics exactly matched its frozen report.
Within each original fall-start to process-end-plus-three-second window:

| Remaining camera-event misses | Count | Diagnostic meaning |
| --- | ---: | --- |
| Warnings exist but no new matching episode starts | 11 | Ten episodes are assigned to an earlier fall; one started early and is unmatched. A warning during the next fall does not automatically establish a new event-specific alert. |
| No score reaches the fixed cutoff | 7 | Some usable observations exist, but no score reaches 0.98. All seven have less than half-window usable-pose coverage. Scores are not calibrated probabilities. |
| Positive scores without enough observed warning evidence | 5 | A brief high score is insufficient; interruptions/score changes prevent the policy from accumulating the required evidence in time. This count alone does not identify each physical cause. |
| No raw skeleton in the window | 3 | There is no pose input to classify. Sampled source review shows the fall region outside the usable view. |

Missed windows average 51.7% usable-pose coverage, versus 86.7% for detected
windows. “Usable” is a code gate, not verified anatomical accuracy; correlation
is not proof that dropout alone causes the miss.

**The 11 episode cases are a benchmark event-grouping interaction, not measured
live notification loss.** The [scorer](../tools/video_event_metrics.mjs) groups
warnings with gaps of five seconds or less, permits one fall per episode, and
requires its start inside the original event deadline. It must not be relaxed
after seeing the result to manufacture a success. Recovery-aware event handling
is a candidate investigation; actual UI/audio/acknowledgment telemetry is still
needed to know what a caregiver would receive. Existing traces record sampled
detector warnings, not delivered notifications or the latched alert card.

## Situation-specific limitations

“Observed” means there is a source/replay example, not a measured prevalence.
“Unqualified” means the tests do not establish performance in that situation.

| Situation | Specific failure/risk | Evidence and current boundary |
| --- | --- | --- |
| Fall outside view or partly behind a doorway/furniture | No pose, wrong joints or discarded core joints; the descent can disappear completely. | Observed in EDF/source review. Better tracking cannot recover unobserved pixels; count the miss. |
| Cropped bodies, foreshortening or motion toward the camera | Apparent body proportions change and confidence drops just during descent. | Observed pose/coverage failures. Crop retention rescued some events but increased false alarms; no qualified fix. |
| Walking, bending, kneeling, crouching or floor sitting | Normal activity can resemble descent or a down posture. | Observed false warnings; walking regresses in cycle 6. More permissive thresholds are not automatically safer. |
| Getting into/out of bed, reclining on a sofa or intentional lying | A low/horizontal skeleton does not reveal intent or support surface. | Observed confusion. A named regression passing does not qualify all beds/rooms. Optional exclusions can also hide real falls. |
| Already down at startup or a missed transition | The model cannot reconstruct the earlier event from current posture. | Browser has a separate sustained-down path. It warns about observed posture, not confirmed prior falling or impact. |
| Recovery followed by another fall soon afterwards | Warning persistence/episode grouping can hide a distinct next event in evaluation. | Eleven latest misses have in-window warnings but no matching new episode. Live notification/rearming behavior is not measured by these traces. |
| A bystander, duplicate skeleton or genuine crossing | Track histories can reset or associate ambiguously; a visible other body is not target identity ground truth. | Reset-cascade defect repaired in research, but crossing/multi-person attribution remains unqualified. Never splice arbitrary histories. |
| Short recordings or low analysis rates | Warm-up/evidence may be incomplete; cadence changes poses, IDs and warning decisions. | Short Ursul falls missed; real 6-Hz replays vary. Offline cadence does not certify phone throughput. |
| Dim/night scenes, blankets and varied older-adult mobility | Pose/body visibility and movement differ from staged adult tests. | Unqualified; no representative performance claim for these conditions or frail seniors. |
| Distant/tiny person or different camera placement/resolution | Too few usable body pixels, different geometry and viewpoint. | Geometry gates reject tiny bodies; EDF demonstrates cross-view differences. No validated minimum/maximum distance or universal camera-model support. |
| Handheld/moving camera or changed setup | Camera motion can mimic body motion; saved room regions may no longer align. | Known design risk. Keep camera stationary; optional zones are session-only and need reevaluation after movement. |
| Hidden tab, locked phone, OS suspension or stopped stream | There are no continuing frames to analyze. | Browser intentionally releases the camera when hidden. Not an unattended 24/7 background-monitoring service. |
| Remote caregiver response or emergency escalation | A local warning does not guarantee someone receives/acts on it. | No remote notifications, contact escalation or emergency dispatch. Delivery/acknowledgment endpoints are not measured. |

## Why these decisions were made

- **Keep camera-brand independence:** use browser camera APIs and local inference,
  not a proprietary-camera dependency. This does not imply direct support for all
  IP cameras, every angle, distance or device performance level.
- **Separate fall-transition and person-down warnings:** a fall is an event; a
  down posture is a state. Startup while down needs a different path, and neither
  observation confirms injury, impact or intent.
- **Make furniture marking optional:** reduce setup burden while offering a room
  workaround. Do not pretend automatic pose geometry understands every bed/floor
  or require exclusions to hide benchmark false alarms.
- **Never invent pose evidence:** interpolation, stale skeletons and forced IDs
  can create confident-looking but wrong histories. Missing observations remain
  missing and short/occluded cases remain in the denominator.
- **Measure both sides of the tradeoff:** lowering cutoffs may rescue falls while
  increasing normal-activity alarms; stricter support rules may do the reverse.
  Rejected controls remain documented, not silently removed from the narrative.
- **Use uninterrupted recordings and grouped splits:** isolated clips hide alert
  carryover and normal-activity exposure; adjacent frames are not independent
  examples. Once tested, a person/source is not fresh again.
- **Preserve reproducibility:** complete-clip checkpoints, input/runtime/source
  hashes, matching optimizer/RNG contracts and immutable evidence make failed
  runs resumable and comparisons inspectable. Software correctness is necessary
  but does not establish medical or commercial reliability.
- **Do not deploy the new candidate yet:** its continuous-development improvement
  coexists with more walking/ordinary-activity warnings and a worse low-rate
  excluded-participant false count. Neither aggregation nor UI branding removes
  those failures.

## What has not been demonstrated

No validated clinical sensitivity, specificity, caregiver false-alert rate per
camera-day, supported distance range, all-camera compatibility, fall-impact
confirmation, frail-senior/night/blanket coverage, continuous phone operation,
multi-person event attribution or remote notification delivery is claimed.

The latest implementation checks passed 115 local JavaScript tests, numerical
gradient/inference checks and a genuinely interrupted optimizer-resume comparison.
These are historical software-verification results, not proof that all user
falls are detected. The evidence needed before promotion includes independent
source/joint adjudication, much longer realistic normal-activity recordings,
prospectively frozen new-person/view tests and measured live alert behavior.
Any changed event definition needs a versioned metric and reruns of every
baseline—not a retroactive rewrite of failed results.

Raw videos, source frames, landmark traces and large training arrays stay local
in ignored caches; they are not app assets or permission to redistribute
identifiable footage. Code licensing and footage/privacy rights are separate.

The GitHub publication includes these reports, frozen model/evidence archives
and their integrity tests. Full active development runners and large caches
remain in the local research workspace; historical reproduction commands assume
that workspace. Archived source snapshots are provided for inspection, not as
a new deployable detector or a complete clean-clone benchmark toolchain.

## Keeping this record current

For each subsequent cycle, append its date, concrete code/weight changes, purpose,
matched baseline, dataset/split/metric, gains, regressions, failed situations and
release decision. Link the frozen evidence; identify what actually shipped.
Keep negative results and explain changed metrics or previously opened data.
Publish linked reports/manifests alongside documentation when committing it to
GitHub, but never add ignored identifiable videos or local credentials. New test
counts are software evidence, not a substitute for the two-sided reliability gate.
