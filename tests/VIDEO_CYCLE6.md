# Cycle 6 — free diagnostics and independent-review tools

Initial Phase A implemented 2026-10-13. That initial step was research tooling only: no detector changes, new weights,
training, paid services, uploads, or deployment. This starts the
[cycle-6 plan](../research/RELIABILITY_CYCLE6_PLAN.md); it does not complete human
annotation, the observation repair, model comparisons, or fresh qualification.

Subsequent same-day execution added AI-assisted source review, bounded tracker
repairs and actual locally trained temporal weights. See
[the repair/training report](VIDEO_CYCLE6_REPAIR.md) for the measured gains,
regressions and rejected controls. Production remains unchanged; the broader
missed-fall/false-alarm release gate is still closed. The remainder of this
document preserves the initial diagnostic/audit-tool scope and results.

## Run locally

From the repository root, with the existing local video/trace cache available:

```sh
node tools/analyze_video_coverage_v6.mjs
node tools/prepare_video_audit_v6.mjs
node tools/serve_video_audit_v6.mjs
```

Open `http://127.0.0.1:8770/`. The server binds only to loopback, serves an exact
asset allowlist, supports video byte-range seeking, rejects writes and cross-site
requests, and has no upload endpoint. Stop it with Ctrl-C. Do not expose the port,
use a public tunnel, or deploy this dataset/review server.

Generated output lives in ignored
`tests/fixtures/generated/video-benchmark/cycle6-diagnostics/`:

- `summary.json`: all 80 camera-events, original metrics, coverage bins, provenance.
- `recordings/*.json`: per-frame raw-pose gate reasons, candidate IDs/scores,
  observed positive evidence, warning reasons, original production states, and
  coverage before/during/after each source-labelled descent.
- `audit/`: 120 source-first review windows, Lite/Full overlays, opaque public IDs,
  asset hashes, and a private provenance ledger. Videos are referenced, not copied.

The analyzer imports archived inference and verifies all 15 archived artifact
hashes. Its instrumented policy must exactly reproduce the frozen warning times;
each EDF recording's metrics must exactly match the frozen continuous report.
It does not change weights or select a new threshold. Review windows include
detected falls as controls, not only misses.

Identical reruns are non-overwriting and deterministic. Changed output fails
closed. For a changed diagnostic implementation, use a new output directory:

```sh
node tools/analyze_video_coverage_v6.mjs tests/fixtures/generated/video-benchmark/cycle6-diagnostics-next
node tools/prepare_video_audit_v6.mjs tests/fixtures/generated/video-benchmark/cycle6-diagnostics-next
node tools/serve_video_audit_v6.mjs 8770 tests/fixtures/generated/video-benchmark/cycle6-diagnostics-next/audit
```

No download command is run automatically. Missing/corrupt inputs are errors, not
silently skipped cases. The current bundle is approximately 235 MB of local JSON
and overlays; it is not part of the browser build or Git deployment.

## Observed output — still the same failed candidate

The completed diagnostic replay covered ten saved Full-pose recordings. It used
existing traces, not another pose inference pass or an unseen test.

| Measure | Result |
| --- | ---: |
| Camera-events | 80 (40 paired-view falls; five people) |
| Missed events | 44 |
| False warning episodes | 16 |
| Reviewed normal exposure | 574.6 seconds |
| Normal detector-warning time | 48.06 seconds |
| Detected with at least 90% eligible-pose coverage | 35 / 43 |
| Detected with lower eligible-pose coverage | 1 / 37 |

New phase-specific inspection (unweighted mean of each event's sampled coverage):

| Events | Before descent | During descent | After descent |
| --- | ---: | ---: | ---: |
| 36 detected | 87.9% | 98.1% | 96.3% |
| 44 missed | 65.1% | 62.9% | 49.7% |

“Eligible” is the model's joint/geometry gate, not independently verified pose
correctness. The intervals are three seconds before start, start to process end,
and up to three seconds after process end. During/after boundaries are disjoint;
the original inclusive event-scoring window remains unchanged. Missing frames
remain in the denominator. Empty intervals return null, not perfect coverage.

The report also preserves 0/3/10/30-second grace sensitivity and equal-duration
five-second score windows. These are diagnostic aids, not newly selected release
metrics. Longer grace cannot be used to rewrite the failed primary result.

## Independent review workflow

1. Use a pseudonymous reviewer code, not a person's name or email. Each reviewer
   works separately without seeing another reviewer's labels. Distinct codes
   alone do not establish independence.
2. Watch source video with overlays off. Classify the visible action and visibility.
   Mark descent onset, supported down posture, and recovery only when observable.
   Leave unknown or out-of-window times blank. Do not infer impact or hidden joints.
3. Save the source-only review. It locks before overlays can be requested.
   Unsaved source drafts and saved reviews persist under that pack/reviewer key
   in local browser storage. Export regularly; browser storage is not a backup.
4. Reveal the overlay, recording exposure in the audit trail. Compare MediaPipe
   Full and Lite, and save a separate quality verdict for each. Raw pose boxes are
   not annotated identities. Full candidate IDs/scores must not be attributed to
   raw Lite skeletons or another person's box.
5. Export JSON. Import checks the pack, reviewer, timestamps, duplicate IDs, and
   exposure history; conflicting saved reviews are rejected, not overwritten.
6. Compare two exported files:

```sh
node tools/compare_video_audits_v6.mjs reviewer-a.json reviewer-b.json comparison.json
```

Pass a fourth argument with the audit manifest path for a non-default pack. The
comparison reports missing cases, action/visibility disagreements, timestamp
differences, and per-backend pose-quality disagreement. A 0.25-second difference
is a triage threshold, not a detection-latency standard. Human adjudication is
still required. Matching uncertain judgments are not proof of correctness.

The queue contains 80 source-labelled fall-event views, 16 mined normal-warning
windows, and 24 windows across eight UMAFall ordinary-activity recordings. Selection
uses source annotations/frozen errors, so it is not a random sample for prevalence
or false-alert-rate estimation. Full-recording access and independent adjudication
remain necessary for ambiguous boundaries. Crossing-person coverage is not established.

Review exports are explicitly `unadjudicated-reviewer-observations`, never automatic
training labels. For multiple people without a clear target, use “unclear” and
describe the ambiguity. A manual joint-label editor and consensus-label approval
workflow are not yet implemented. No human labels were manufactured by Codex;
browser QA uses a clearly marked test reviewer and is not ground truth.

## Evaluation contract and unmeasured endpoints

Keep the original v5 metric unchanged for baseline comparison:

- One recording is one uninterrupted state sequence. No reset at each fall.
- A new warning episode starts after more than five seconds of warning silence.
- One episode can match at most one fall; a preexisting/sticky warning cannot
  claim detection of a later fall. Primary deadline is source process end +3 s.
- Normal intervals must be finite, ordered, non-overlapping, and inside the recording.
- The archived metric combines people at recording level. It is **not qualified
  for multi-person event attribution**. Future labelled actor-specific tests must
  define target association before evaluating crossing/repeated-person events.
- Startup already down, intentional lying, recovery, uncertain visibility, and
  camera interruption must be labelled separately. Do not retroactively relabel
  them to improve an observed metric. Coverage loss must not hide missed falls.
- Warning time counts detector-state samples, not delivered notifications, alert
  acknowledgment, sound count, or a latched UI card. Those are explicitly
  `not-recorded` in these traces; do not fabricate them from classifier scores.
- Offline 18-Hz traces do not establish real-time mobile performance. Actual
  browser latency, background suspension, and thermal behavior remain unqualified.

Before future fitting, freeze a versioned actor/state/notification metric and
rerun all baselines under it. Independent annotation, time-aligned notification
telemetry and fresh participants/cameras are prerequisites, not optional cleanup.

## Stronger replay fingerprints

New `run_video_benchmark.mjs` contracts are version 2. They add per-file hashes for
the MediaPipe bundle, SIMD/non-SIMD JS glue and both WASM binaries, plus decoded
cadence and decoder metadata, alongside existing video, decoded-pixel, model,
source, manifest and code hashes. A changed binary fails checkpoint reuse.

Use a new replay output such as `output: 'cycle6-results'`. Do not overwrite the
old `results/` traces. Their version-1 contracts remain readable for historical
diagnosis, but cannot be retroactively given WASM provenance. No new full replay
or training run was started here. Optimizer/RNG training checkpoints belong to
the later training phase and have not been implemented without that trainer.

## Verification

- Focused tests cover frozen-policy parity at 6/18 Hz, missing-pose denominators,
  phase bounds, corruption, review validation, non-overwrite publication, reviewer
  comparison, HTTP range requests and server origin/path/write restrictions.
- The full detector/research test suite passed: 102 tests, zero failures or skips.
  Passing software tests is not detection accuracy evidence.
- The analyzer and pack builder are run twice to check deterministic reruns.
- Browser QA checks actual video decoding, zero detail requests before source
  save, overlay rendering, source locking, saved-review reload and export/import.
- Desktop and 390-pixel responsive views were inspected. The narrow view had no
  horizontal overflow. This is layout QA, not a real-phone inference benchmark.

The reliability gate remains closed. Detector code and weights remain unchanged
until the reviewed evidence supports a repair and both error endpoints improve.
