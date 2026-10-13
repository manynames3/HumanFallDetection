# Reliability cycle 4 — lifecycle repair and weak-label balance

No deployment or production imports. Cycle3 weights, inference code and results stay
immutable. The 60 cycle3 clips are now seen diagnostic/regression footage, never fresh
validation again. A real three-frame duplicate/ambiguity cascade is minimized before
changing the tracker. Preserve observed geometry and ambiguous-crossing safety; never
bridge different people's histories or invent missing observations.

Development remains the same 359 clips, with the original 208 training / 151 selection
group split. Compare a tracker-only recalibration of frozen fusion3 with a retrained
87-feature, 24-hidden-unit fusion. The latter restores cycle2's identity-safe contiguous
window multiple-instance training for unknown-onset fall bags; selected training windows
are latent hypotheses, NOT ground-truth fall onset. Known source frame labels remain
supervised. Seed 41723, 80 epochs, existing regularization. Threshold grid .7/.9/.95/.98/
.995; observed window .6/.9s, evidence .15/.25/.35s. Selection penalizes missed fall clips
+ 3×ordinary false-warning clips + 3×known pre-onset warning clips. Required seated-fall,
walking and bed regression tests must pass. Positive intervals require valid above-
threshold observations at BOTH ends; missing time or changed IDs contribute nothing.
Known-onset metrics require warnings inside source [fallStart, fallEnd], not after recovery.

Freeze selected model bytes, inference code, policy and exact holdout manifest hashes
before any new holdout pose inference/scoring. Do not tune after opening the final results.
Report misses, false-warning clips, known early warnings, and per-source performance.
Deployment remains blocked unless both misses and false warnings improve, including
tracking stability; small staged clips do not qualify unattended safety performance.

## Predeclared fresh footage (42 clips: 15 fall / 27 ordinary)

- Entire new ASSIST-IoT reference-video source, pinned commit
  `7a11c96b9a3576cef92f0795a19b3786c69a3335`, all blobs matching
  `^videos/(adl|fall)/[^/]+\.mp4$`: 26 clips (7 human falls, 19 ordinary activities).
  Exclude mannequin and immobility folders. Publisher CC BY4.0, author README/notes/LICENSE.
  Verify Git blob SHA1, save SHA256, reject duplicates against all419 previous clips.
  Relevant negatives include both walking speeds, slow/quick sit→lie→sit, chair movements,
  bending, stumbling and crawling. Reference videos do not identify actors/camera hardware,
  nor align sensor event timestamps to video: report new source/viewpoints and clip labels.
- Ursul publisher Figshare v2, CC BY4.0, retained archive MD5
  `c784167d08f2fa94e3afd36cec758e1f`. Four unused subject IDs: falls11/12 activities
  1/4/8/11; ordinary19/23 activities13/16/19/20. First numeric direction/repetition then
  filename per activity. 16 clips, 8 fall / 8 ordinary. Subjects are new; LOC1–3 and phone
  source are already seen, so this is not a new physical-camera-model claim.

Raw identifiable footage stays local/ignored; copyright licensing is separate from likeness
rights. No test actor or new source is added to fitting. No fall onset inferred from our
predictions. Short staged tests cannot estimate alerts per camera-day, older-adult sensitivity,
phone throughput, background operation, or notification delivery.

## Completed evidence and current status

All **73 automated tests pass**, with no skips in the installed local environment.
The repeated-ID cascade is fixed without relaxing confidence/distance/expiry gates.
On seen IKAR actor-box diagnostics at IoU0.1, candidate ID changes decrease104→48,
with observed frames unchanged at1,436/1,628 and missing runs unchanged45. Comparing
only consecutive frames matched by both systems, v4 has44 changes vs the original
tracker39; at IoU0.3 both have26. Residual loose-box ambiguity remains, so this is not
a claim that every tracking interruption is solved. `cycle4/tracking-report.json`
records tool/tracker/input hashes and common-observation comparisons.

There is also a runtime limitation: actual recorded tracker updates were fast, but
exhaustive assignment is not hard-runtime bounded with many hypothetical ghost aliases.
No mobile throughput or hard-real-time qualification is claimed.

Completed **seen-development** comparison uses176 fall and183 ordinary clips and
source-positive interval bounds (the older136/176 result counted three late warnings).

| Candidate | Warned fall clips | False-warning ordinary clips |
| --- | ---: | ---: |
| Previous temporal candidate |133/176|8/183|
| Fixed tracker + recalibrated frozen fusion |120/176|2/183|
| Retrained fusion |118/176|5/183|

Thus neither new candidate improves BOTH missed falls and false warnings. Do not deploy.
The retrainer evaluated80 epochs and restored eligible weak training windows in25/28
bags, but cost selection chose epoch20 before weak-label fitting starts. Best later
weak-label selection increased selection coverage to53/72 while false warnings increased
to9/79; it was not selected and is not a claimed training success.

Final candidate/manifest freeze: `cycle4/final-freeze.json`, 2026-10-13T05:25:55.118Z.
Reused SHA256 `545920d91994b2c4f053cf487ed8ee81ceaf54b3c79857c0219f74bed8611970`;
retrained SHA256 `1b8ae0527b01829a0f79305e42f894cd7cc67a0d6f35e08dce27e23db6e1a1c3`.
Hashes reverified after the interrupted run. All42 final videos remain out of fitting.

**Fresh42-clip evaluation completed on 2026-10-13 after the user requested resumption.**
The earlier attempt failed during ASSIST decoding and lost all completed-source output.
The replacement runner atomically saves and verifies each complete clip, reloads the
document between clips, and never checkpoints a partial temporal history. All 126
replays (Full18Hz, Lite18Hz, Full6Hz) completed. An actual restart reused saved clips.
Frozen cycle4 model/inference hashes remained unchanged.

| Candidate | Warned fall clips | False-warning ordinary clips |
| --- | ---: | ---: |
| Production Lite |4/15|1/27|
| Previous temporal candidate |5/15|1/27|
| Fixed tracker + reused fusion |6/15|0/27|
| Retrained fusion |6/15|0/27|
| Retrained fusion at 6 Hz |4/15|0/27|

ASSIST supplies all detected falls; every model misses all eight short Ursul falls.
This is clip-level coverage, not annotated transition sensitivity. The fresh sample
improves both counts for the two18Hz candidates, but their development regressions
remain. No candidate is promoted. Full evidence: local `cycle4/evaluation-report.json`.
The long-recording, new-person/camera test is documented in [cycle5](VIDEO_CYCLE5.md).
