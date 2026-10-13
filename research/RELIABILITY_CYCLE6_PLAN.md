# Reliability cycle 6: observation-first, evidence-gated plan

Date: 2026-10-13. Status: **diagnostics, AI source review and bounded exploratory
repairs/training completed; independent-label/fresh qualification phases remain
incomplete; no candidate approved for deployment**.

Execution update, 2026-10-13: the free diagnostics and source-first audit tooling
are now implemented. See [cycle-6 execution notes](../tests/VIDEO_CYCLE6.md) for
commands, observed results, verification, and the remaining human-review gates.
The original plan below is preserved. A subsequent user-authorized Codex/Claude
clip review and exploratory repair/temporal training study is recorded in
[the execution report](../tests/VIDEO_CYCLE6_REPAIR.md). Actual research weights
changed; production weights did not. Several controls were rejected, and the
new model's broader ordinary-activity regressions keep deployment gated. AI
review is not a replacement for the independent human-label prerequisites;
this exploratory study does not complete the planned qualification ladder.

Prepared after a read-only Claude Code subscription review of detection source,
architecture, and archived benchmark reports, followed by independent Codex checks.
The user approved that code/report review; no videos or private recordings were
included in the handoff. This document is the consolidated plan, not a verbatim
Claude response. Production code, model weights, and the live site are unchanged.

## Recommendation

First establish why usable body observations disappear during falls. Then repair
the dominant observation failure and test one small temporal model on better
labels. Do not begin with another threshold search or another classifier trained
on the same weak examples.

Retain camera-brand independence, local processing, optional rather than mandatory
furniture markings, and the browser-first boundary in [ADR 0001](../docs/adr/0001-browser-v2-on-device-inference.md).
This plan does not introduce an edge appliance or cloud video upload. A compatible
camera is not a guarantee that every placement or device is supported.

## 1. Evidence that changes the next attempt

The [frozen continuous evaluation](candidates/native-sequence-v5/continuous-evaluation.json)
contains 80 camera-events: 40 staged falls from five people, each seen from two
views. These are not 80 independent falls. Reviewed normal exposure is only
574.6 seconds, or 9.58 camera-minutes.

| Frozen pipeline | Missed camera-events / 80 | False warning episodes |
| --- | ---: | ---: |
| Current production, Lite | 44 | 13 |
| Prior temporal candidate | 43 | 9 |
| Selected cycle-5 native-joint candidate, Full | 44 | 16 |

Codex recalculated the following from the selected candidate's
[failure attribution](candidates/native-sequence-v5/failure-attribution.json):

| Usable-pose coverage during the scoring window | Detected | Missed |
| --- | ---: | ---: |
| At least 90% | 35 / 43 (81.4%) | 8 |
| Below 90% | 1 / 37 (2.7%) | 36 |

Coverage means `eligibleFrames / sampledFrames`, from fall-process start through
process end plus three seconds. Eligibility is the code's joint/geometry gate,
not a human judgment that the skeleton belongs to the target or is anatomically
correct. Detected events have median eligible coverage 100%; missed events 49.8%.
Raw pose presence is also associated with detection: 35/50 events detected at
at least 90% raw coverage, versus 1/30 below it.

This is strong prioritization evidence, **not proof of causation**. Occlusion,
viewpoint, fall type, label timing, and tracking may affect both coverage and
detection. Eight high-coverage events still failed. All EDF footage is now seen
development material, never a fresh holdout again.

### Claude findings: verified and corrected

- Confirmed: `jointObservation` and the v4 tracker require both shoulders and
  both hips. `sequenceVector` returns null without a current observation, and
  `sequenceWarnings` cannot warn from a null feature vector. Missing-joint masks
  therefore do not solve missing-core-joint or missing-person cases.
- Confirmed: timestamp-only fall clips receive no supervised label after
  `fallEnd`; there is no explicit recovery/intentional-lying state taxonomy.
  Correction: the separate frame-annotation branch can supply post-descent labels;
  it is inaccurate to say all post-fall training is excluded.
- Confirmed: weak fall windows are selected using the model's own scores. They
  are hypotheses, not independently verified onset labels. Selection tried 90
  checkpoint/threshold/persistence configurations on one development split.
- Not accepted as a bug: cycle-5 persistence already sums elapsed seconds.
  A direct constant-positive probe triggers at 1/6 second at both 6 and 18 Hz,
  using two versus four observations. Sampling density still changes the evidence
  quality; investigate that without claiming the rule is frame-count based.
- Warning-duration clarification: the benchmark measures sampled detector warning
  states, including the production posture path's short hold. It does not measure
  the latched alert card or actual notification burden. Add both measurements.
- Rejected: numerical odds of success without a defensible statistical basis,
  treating dropout alone as a fall, and a release gate that permits worse false
  alarms. The user's requirement is improvement in **both** misses and false alarms.

## 2. Phase A — diagnosis and audit tooling before fitting

Target: 2–4 engineering days, no new paid services. These are estimates, not a
promise of elapsed completion time. Planned outputs, not existing implementations:

1. `tools/analyze_video_coverage_v6.mjs`: an event ledger linking raw detections,
   usable joints, identity changes, classifier scores, policy decisions, and final
   alerts. Measure coverage separately before, during, and after descent, rather
   than interpreting one whole-window average as a cause.
2. `tools/prepare_video_audit_v6.mjs`: local, synchronized source/overlay review
   pages with timestamps. Reviewers first label source video without predictions,
   then assess overlays. Include detected falls as controls, not only failures.
3. An evaluation specification covering event matching, repeat falls, multiple
   people, startup while already down, recovery, alert acknowledgment, dropped
   frames, and camera interruptions. Preserve the old metric for comparison;
   version any corrected metric and rerun every baseline identically.
4. Extend resumability to hash WASM/runtime assets and the complete model/decoder
   configuration. Future training checkpoints also save optimizer state, RNG,
   split IDs, normalization, and label hashes. Interrupted, changed, or incomplete
   jobs must not quietly count as completed evidence.

Run diagnostic-only score/coverage and latency analyses on seen footage. Compare
scores in equal-duration fall/normal windows so a longer window does not get an
unfair maximum-score advantage. Report all-event results alongside coverage
subgroups. A post-hoc threshold sweep or +10/+30-second grace analysis cannot
become the release result; retain the primary process-end-plus-three-second rule.

Do not infer that a stable ID proves correct joints. The existing constant-ID
counterfactual did not materially help EDF, but it did not test multi-person homes.
Add real crossing/occlusion sequences to the development requirements.

## 3. Phase B — independently reviewed labels and a causal diagnosis

Start with all 80 EDF camera-events and 40 diverse normal/confusing windows from
seen material. Include walking, bed/sofa entry, floor sitting, bending, kneeling,
recovery, leaving the image, and a second person. Group paired views together.

Two human reviewers independently annotate a manageable initial subset, reconcile
the written rubric, then expand. Record onset, supported down posture, recovery,
visibility, whether the action is intentional/ambiguous, and pose quality. Resolve
disagreements before model fitting and retain agreement statistics. Never treat
AI-generated labels as independent human ground truth.

Audit approximately 150 stratified frames with manually located visible joints
to distinguish detector failure, wrong landmarks, and an overly strict eligibility
gate. Hidden joints remain unknown. Any corrected-joint diagnostic is an explicitly
separate oracle study, not training/test evidence for deployed performance.

Use the audit to select the next change:

| Audited failure | Next bounded comparison |
| --- | --- |
| Useful visible joints exist but the four-joint gate discards them | Confidence/mask-aware observation retention, same pose backend and classifier |
| Person is visible but pose is absent or grossly wrong | One alternative pose/detector pipeline on the same audit pixels |
| Observations are good but action/context remains confused | Temporal representation and state-label comparison |
| Person/fall region is genuinely outside view | Placement/coverage guidance; count the miss, do not invent landmarks |

An alternative backend is not automatically superior. Start with MediaPipe
Lite/Full controls already available. Select at most one additional backend after
checking code, exact checkpoint, training-data terms, and a browser export probe.
Do not add a new production dependency without approval.

If observation retention changes, preserve identity conservatively with observed
box/joint evidence, bounded timeouts, and explicit ambiguity. A predicted location
must not be passed off as an observed pose or accumulated as fall evidence.
Test genuine person exits and crossings as aggressively as occluded falls.

If the next repair does not improve usable, human-verified evidence without
introducing wrong-person history, stop and report the limit before training.

## 4. Phase C — one bounded temporal-model study

Conditional primary model: a compact **causal temporal convolutional network
(TCN)**, initially budgeted below 100,000 parameters. Use about three seconds of
past joint observations, confidence/missing masks, actual elapsed times, and
observed motion. This is a candidate to measure, not a proven architecture.

Use a fixed time grid with explicit missing bins; do not interpolate hidden joints
or repeat stale poses as new evidence. Keep time-since-observation and last-observed
motion as context. Dropout by itself is uncertainty, not proof of a fall.

Separate motion states from alert policy: ordinary upright/seated activity,
descent, supported down posture, intentional lying, recovery, and unknown. Intent
labels are used only where independently supported; uncertain cases stay unknown.
Someone already down at startup remains a separately evaluated person-down path.
Changing the alert name must not hide false caregiver notifications.

Pre-register a small comparison ladder on identical grouped development data:

1. Current MLP retrained with corrected labels: data-only control.
2. TCN on the same observations and binary targets: representation comparison.
3. Same TCN with the reviewed state targets: supervision comparison.

Keep observation backend, split, normalization policy, evaluation, and training
budget fixed within each comparison. Use three fixed seeds, bounded epochs and a
declared model-selection rule. Fit normalizers only within training folds. Use
person/session-grouped cross-validation plus held-out room/view development checks;
all views, related takes, mirrors and derivatives of one event stay in one group.
Unknown identity across datasets is a documented leakage risk, not assumed distinct.

No wide hyperparameter search. No self-selected weak positives in the first study.
If poses cannot distinguish bed entry from a fall, only then evaluate a separate
local RGB/context branch on development data. That is a new hypothesis, not an
automatic escalation to a large video model.

## 5. Fresh evaluation and explicit gates

Freeze the collection/split protocol before development decisions. Use newly
consented recordings or verified, commercially usable untouched data. Reserve
12–15 new capable adults, at least three camera types and several rooms, aiming
for approximately 150 distinct safely staged fall events and 24–30 camera-hours
of ordinary activity. Multiple views remain paired observations of the same fall.
Include single-view tests; the product must not require two cameras.

These are study-design targets, not a power calculation or guaranteed affordable
recruitment. Final sample size is set from development effect sizes and clustered
uncertainty before opening the holdout. If the required sample is unaffordable,
report insufficient evidence rather than lower the bar after seeing results.

Never ask older adults or untrained participants to fall. Use capable, appropriately
supervised adults and a safe protocol, or licensed existing footage. Consent must
cover storage, annotation, training/evaluation, retention, and withdrawal limits.
Keep recordings local unless separately authorized. Recruit separate development
examples if needed; never consume reserved participants for tuning.

Freeze code, model, thresholds, quantization, label protocol, and all hashes, then
open the final holdout once. Blind annotators must not see model predictions.
Compare the actual browser artifact, not just a faster offline implementation.

### Research improvement gate — necessary, not permission to deploy

Against **both** frozen production and the prior temporal candidate, require:

- At least 20% relative reduction in both missed-event rate and false episodes
  per normal camera-hour. If a comparator has zero false episodes, improvement
  cannot be established by a tie: the result is inconclusive on that endpoint.
- For both endpoints, the paired participant-cluster bootstrap's one-sided 95%
  upper bound on candidate-minus-baseline is below zero. Keep paired views inside
  the same resampled cluster. With few independent clusters, disclose instability;
  do not treat a bootstrap as a cure for inadequate sampling.
- No material prespecified camera/room/action regression, no increased combined
  false-caregiver-alert burden or normal warning time, and no worse latency.
- Report missed falls during loss of coverage and startup. Abstention does not
  remove falls from the denominator. Report monitoring-interruption notices both
  separately and in total caregiver burden.

Proposed absolute research continuation targets: at least 85% event recall,
95% lower bound at least 75%, median alert latency at most three seconds and p90
at most eight seconds, and at most 0.5 false episodes per normal camera-hour.
These are engineering targets, not clinical standards or adequate home-service
reliability. Report confidence bounds and continuous normal exposure honestly.

### Pilot qualification — separate study, separate authorization

Proposed starting targets are at least 95% sensitivity, a lower confidence bound
of at least 90%, and a false-alert rate whose 95% upper bound is at most one per
camera-day, plus device/runtime and response-workflow qualification. These require
long natural-use recordings across households; staged young-adult falls alone
cannot establish performance in older adults.

Under a stationary Poisson approximation, zero false alerts in 72 camera-hours
only gives an upper bound of roughly one per day (3/T). It is not proof across
homes; activity and household clustering may require substantially more exposure.
Do not extrapolate the current 9.58 normal minutes to daily reliability.

## 6. Browser feasibility is an early gate, not the last surprise

Before long training, probe the intended model graph and observation backend on
the available reference phone and desktop, with a second mobile platform when
available. Record device, OS, browser, power mode, frame age, dropped-frame rate,
memory, and sustained throughput over 30 minutes. Proposed target: at least 10
analyzed frames/second in 95% of one-second windows, with p95 frame age below
500 ms; also test the actual lower-rate failure behavior.

Validate reference-versus-browser numerical outputs and alert decisions on frozen
development sequences. Qualify quantization and preprocessing before the one-shot
holdout. A changed model after holdout requires new independent confirmation.
Use a tested numerical implementation/runtime; a small parameter count is not a
reason to improvise unverified training or inference math.

The [ONNX Runtime Web documentation](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
lists WebAssembly and GPU execution options. Export success alone does not establish
operator support or acceptable performance on our target phones. Any runtime
addition needs dependency approval. Browser background suspension remains a
separate blocker to an unattended 24/7 service, even if detection improves.

## 7. Research references, budget, and ownership

[SAFER-Activities](https://safer-activities.github.io/) provides a useful example of
untrimmed, subject/view-separated fall evaluation with look-alike activities. Its
authors report better cross-domain generalization for skeleton models than frozen
RGB features in their tests. This does not prove a TCN will solve Carewatch. Its
CC BY-NC-SA 4.0 dataset is a methodology reference here, not an approved source for
commercial product training or evaluation without suitable permission.

[MMAction2](https://github.com/open-mmlab/mmaction2) offers open-source action-model
implementations; repository licensing is not automatic clearance for every dataset
or pretrained checkpoint. Audit lineage before importing any weights. Do not assume
generic action-recognition benchmark accuracy transfers to falls or our joint schema.

No new spending is authorized by this plan. Start with free local diagnostics.
Suggested maximum allocations, requiring separate approval and actual quotes:

| Use | Proposed ceiling |
| --- | ---: |
| Independent annotation/adjudication, including holdout labels | $600 |
| Necessary compute, only after the diagnosis gate | $200 |
| Consented collection/recruitment | $1,000 |
| Contingency | $200 |
| Total | $2,000 |

This is a spending ceiling, not a claim that the complete study fits it. Availability
of volunteer participants and review time matters. Do not quietly shrink the
qualification study or buy hardware to force the budget to work. No appliance
purchase or full pose-model retraining is proposed by default.

Codex owns harnesses, implementation, reproducibility, source verification, and
reports. Claude supplied the independent code/plan critique; it did not run tests
or inspect videos. Humans provide consent, independent labels/adjudication and
safe collection. Paid reviewers, new production dependencies, and compute charges
need approval. Allow several weeks for recruitment/review; engineering progress
alone cannot remove these dependencies.

If the bounded study fails either endpoint, keep deployment blocked and document
which assumption failed. A narrower product, different sensing hardware, or cloud
processing would require a new user decision, not a silent scope change.

## Verification of this planning document

Codex read the relevant training, tracking, policy, UI, and metric implementations;
recomputed the coverage table and baseline totals; verified all 15 files listed
in the frozen archive manifest; and ran the small 6/18-Hz persistence probe.
No new video inference, model fitting, dependency installation, commit, push, or
deployment was performed. Existing research files and frozen evidence were preserved.
