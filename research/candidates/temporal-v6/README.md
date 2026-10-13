# Temporal v6 — trained, evaluated, not released

These are actual local NumPy-trained5,809-parameter weights, not production
weights. The primary model reduces misses/false episodes on seen EDF aggregate
data but increases false ordinary-activity clips and fails the excluded-from-fit
participant's joint improvement gate. **Neither model nor tracker is imported
by the production web app.**

See [the complete report](../../../tests/VIDEO_CYCLE6_REPAIR.md) and
[Codex/Claude source review](../../reviews/2026-10-13-claude-clip-review.md).

- `estimated-depth/`: primary model, fixed recipe, training report/provenance,
  frozen source hashes and complete replay results.
- `zero-depth-coordinate/`: matched control; retains3D normalization, so not a
  pure2D comparison.
- `crop/`, `lag/`, `upright-guard/`, `calibration/`: rejected controls and fixed
  comparison outputs, including no selected calibration threshold.
- `source/`: exact model/feature/tracker/training/evaluation code at this run.
- `source-review-ledger.json`:33 source-review case IDs/times/image hashes,
  without the actual frames or absolute local paths.
- `reserved-data.json`: provenance of24 not-scored new-subject clips. The camera
  is already known and the short clips cannot qualify continuous monitoring.
- `artifacts.json`: byte sizes and SHA-256 of every archived evidence/source file.

Source footage, image sheets, feature-array binaries, raw pose traces and
optimizer checkpoints stay in the ignored local cache. This archive does not
grant permission to redistribute source media. Publisher data terms still apply.
No source samples here were relabelled using AI judgments.

Verify the published archive with `node --test tests/video-tcn-archive-v6.test.js`.
In the full local research workspace, create or verify an identical archive with
`node tools/archive_video_cycle6.mjs`.
Changed frozen source or different existing archive bytes fail closed. Rerun
the root-repository tools with existing local caches for full evaluation; do not
run archived dataset/evaluation scripts as a relocated independent workspace.
The archived scoring helper remains executable for inspecting the saved model.
The full active research runners and large local caches are not part of this
documentation/evidence publication. Command examples in historical reports
describe that local workspace, not a one-command benchmark from a clean clone.
