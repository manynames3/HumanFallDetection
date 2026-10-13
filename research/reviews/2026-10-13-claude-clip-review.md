# Cycle 6: Codex and Claude source review

Date: 2026-10-13. AI-assisted diagnosis, **not independent human ground truth**.
This is a consolidated summary, not a verbatim transcript of Claude's responses.

## What was actually reviewed

Codex prepared 33 selected source contact rows with six time-ordered source frames
each, assembled into nine sheets. Codex inspected all nine sheets. Claude Code
read the same image sheets through its file tool, using the user's first-party
Pro subscription with confirmed Extra Usage off. The selection contained all
16 mined false-warning windows, representative missed/detected falls, walking,
and bed entry. It was deliberately failure-enriched, not a random sample.

The frames come from already-cached public research recordings. No personal
recordings, credentials or raw landmark traces were included in the handoff.
These sampled frames establish visible posture/coverage clues, not impact,
intent, precise continuous onset, clinical outcomes, or a full-video independent
annotation. The source videos remain available in the local audit tool.

The generator is `tools/prepare_ai_clip_review_v6.mjs`; its local output is
`tests/fixtures/generated/video-benchmark/cycle6-ai-review/ledger.json`.
The ledger preserves frame times, case IDs and source-image hashes.

## Source observations

| Cases | AI-assisted source observation |
| --- | --- |
| C01, C04, C08, C12, C15, C16 | Low postures include floor sitting, crouching, kneeling, recovery and sitting. A low body alone is not an observed fall. |
| C02, C03, C06, C10, C14 | Cropped bodies, exits, and empty-room frames can coexist with inferred skeletons; do not turn estimated hidden joints into observations. |
| C05, C07, C09, C11, C13 | Mattress entry/sitting/reclining is represented. Some intent boundaries cannot be determined from six frames alone. |
| C17–C19 | The fall region is outside the usable camera view; no classifier can recover an unobserved descent from missing pose alone. |
| C20–C24 | Visible/cropped descents expose foreshortening, observation dropout or missed high-confidence decisions. |
| C25–C31 | Visible fall/recovery controls; do not inspect only errors. |
| C32–C33 | Ordinary walking and lying/sitting up in bed controls. |

These are diagnostic observations only. They were **not converted into training
labels**, independent reviewer exports, manually corrected joints, or consensus
annotations. Training used existing publisher labels, with unknown intervals
omitted.

## Claude's contribution and Codex's checks

Claude identified the mismatch between the strict four-core-joint in-frame
tracker and partly visible torso estimates. It proposed a bounded continuation:
retain an existing same-person track only when at least half of the estimated
shoulder-midpoint/hip-midpoint segment remains in frame and that track had a
fully visible torso within one second. Cropped poses cannot start a track or
renew its full-frame anchor; confidence cutoffs stay unchanged.

Codex implemented the anchored tracker plus history-only/no-anchor controls,
verified exact strict-path parity on all 20 saved continuous traces, and kept
the original classifier weights and policy fixed. The primary repair rescued
three camera-events at 18 Hz, but added a false episode: **44 misses/16 false
became 41/17**. It was rejected rather than promoted.

Claude's follow-up correctly emphasized that most existing false episodes are
full-frame low ordinary postures, so cropped-body retention cannot solve them.
A lag-lookup repair was isolated as another bounded control; it improved one
18-Hz miss but did not reduce false episodes. It was also rejected.

Codex then ran a separate exploratory temporal-model study, its explicit-depth
coordinate ablation, an upright-stance guard, and a small conservative selection
calibration. Results and the final code/results review are recorded in
[the execution report](../../tests/VIDEO_CYCLE6_REPAIR.md). These studies do not
satisfy the plan's independent-human-label prerequisites or qualify a release.

## Boundaries

Claude could read images/code and reason about the results, but could not run
tests. Codex executed and checked the numerical, replay and software tests.
No paid compute, new package installation, API billing, credit purchase, camera
purchase or deployment occurred. Subscription allowance was used for the
user-requested Claude reviews. The production detector and live site remain
unchanged.
