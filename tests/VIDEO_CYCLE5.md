# Reliability cycle 5: resumable evaluation and native pose sequences

Local research implementation. Nothing in this cycle is imported by the live worker,
and no deployment is authorized by a good unit-test result. Retain the original
production detector and all earlier frozen candidates for comparison.

## What changed

- `tools/video_checkpoint.mjs` atomically publishes one complete clip. A restart checks
  its SHA256 and the raw video, decoded PNGs, metadata, manifest, model and inference
  contract before reusing it. Failed clips start over; missing time never supplies
  invented motion history. Changed/corrupt checkpoints fail closed.
  Requested frame counts are checked independently of the result's declared length;
  concurrent workers cannot overwrite an already published recording.
- `tools/run_video_benchmark.mjs` reloads the document per recording, releases the
  previous graph/images, and retrieves bounded frame chunks. Complete recordings keep
  one uninterrupted detector state; no reset at individual fall events. Longer clips
  have a frame-count-based timeout. All progress remains local.
- `tools/video_sequence_v5.mjs` represents 13 individual MediaPipe joints, visibility
  masks, and observed hip motion at four causal times. It preserves missing samples,
  separate people, and actual elapsed time. Horizontal mirroring is training augmentation,
  not synthetic test footage. The model is a 48-hidden-unit MLP with 169 inputs.
- Training uses the existing 208 training/151 selection clip groups. A matched control
  isolates restoring eligible, same-ID weak fall windows after epoch 10. These windows
  are latent training hypotheses, not ground-truth onset annotations.
- Continuous scoring counts warning episodes and event latency. A warning that began
  before a fall cannot be counted again as a successful detection of that fall.

No production dependency was added. Browser camera selection, the UI, deployed weights,
and Cloudflare deployment remain unchanged.

## Bottleneck evidence (seen data)

The reproducible seated-fall failure `cauca-s2-fall-sitting` has 66 tracked, warmed
observations during 68 event frames; the original classifier never predicts fall.

Across 127 known-onset fall clips with Full pose inference, the original combined
warning path misses 60. Within those misses, the classifier path has two clips with
no tracked body, 12 that never warm, 42 with no fall prediction on a warmed observation,
and four with a warmed fall prediction but no final warning. Warm history and fall
prediction must occur on the same observation. This localizes classifier gates; it
does not separately attribute the person-down fallback or certify the anatomical
correctness of accepted landmarks.

The native candidate misses 21 of these 127. An ID-only control uses identical observed,
smoothed poses and restricts both arms to unambiguous one-pose frames. Holding the ID
constant reduces its misses 22→20 (two rescues, no new misses). This limited oracle
supports prioritizing classification/training; it does not say tracking is solved.
No corrected-landmark oracle was invented: independent pose labels would be required.

Detailed attribution: local `cycle5/bottleneck-report.json`.

## Development comparison — not unseen performance

| Candidate | Missed fall clips /176 | False-warning ordinary clips /183 |
| --- | ---: | ---: |
| Prior temporal candidate |43|8|
| Native joints, strong labels, matched control |43|7|
| Native joints + eligible weak fall sequences |38|4|

Selection alone: misses 24→22 of 72, false warnings 6→4 of 79, early-warning clips remain 1.
The selected new model is epoch 30, after weak-example fitting started; the previous
cycle selected epoch 20 before that fitting began. Development early-warning clips
are 2 for the new model versus 1 for the prior, separately recorded from ordinary clips.
The actual seated-fall, ordinary walking, and bed-entry regression traces pass.

New frozen candidate SHA256:
`6fb1b556903633862710960fe2872def1b748488109873c86048282d0b83ec37`.
The earlier strong-only candidate also remains frozen for an ablation comparison.

## Continuous unseen people and cameras

Use the original [EDF release](https://zenodo.org/records/15494102), CC BY 4.0, by
Zhang, Conly and Athitsos. Cite *Evaluating Depth-Based Computer Vision Methods for
Fall Detection under Occlusions*, ISVC 2014, DOI 10.1007/978-3-319-14364-4_19.
No noncommercial OmniFall labels or re-hosted third-party video were used.

All ten original RGB MP4s are downloaded by verified ZIP64 ranges, with per-entry
CRC32 and SHA256. The 16 GB archive is not downloaded in full, so its whole-archive MD5
is a publisher reference, not a claimed local verification. Native 30 fps frame counts
match contiguous original RGB BIN indices before mapping the author's 1-based labels.

- Five previously unused people; two camera views from the new study, Kinect RGB.
- 1,691.37 seconds (28.19 camera-minutes) of complete 320×240 recordings.
- 80 camera-events representing 40 staged falls recorded from two views; paired views
  are correlated, not 80 independent people/falls.
- Separate Lite 18 Hz, Full 18 Hz and Full 6 Hz passes, with real pixels at each cadence.
- Model and manifest freeze precedes all EDF pose inference; no fitting or threshold
  selection uses these people, cameras, or recordings.
- Warnings must start within the author fall process or within3 seconds after its end.
  Also report the stricter process-only count. Separate episodes require >5 seconds
  without a warning; stale warnings cannot rescue later events.
- Normal exposure is the prefix ending 1 second before the first fall and the final
  activity sequence starting 15 seconds after the last fall process. All ten timelines
  were reviewed without predictions. Intermediate falling/lying/recovery time is not
  silently relabelled normal. Review method is coarse; see
  `tests/fixtures/edf-continuous-review.json`.

Provenance and protocol: local `cycle5-continuous/freeze.json`.
Final report: `node tools/report_continuous_v5.mjs` refuses any incomplete inference
pass, changed weights/code/manifest, corrupted checkpoint, or non-continuous clock.
It reports camera/person subgroups and never deploys.

## Completed holdout — release gate failed

All 30 complete-recording replays finished. None of these people or recordings was
used to fit or select these frozen candidates. The 80 camera-events represent 40
performed falls from two views. False warnings below cover **574.6 seconds / 9.58
camera-minutes of reviewed normal activity**, not all 28.19 minutes of footage.

| Frozen pipeline | Missed events /80 | False-warning episodes | Warning seconds during normal activity |
| --- | ---: | ---: | ---: |
| Current production decision logic + Lite pose, 18 Hz | 44 | 13 | 27.3 |
| Current production decision logic + Full pose, 18 Hz | 45 | 15 | 30.8 |
| Prior temporal candidate + Full pose, 18 Hz | 43 | 9 | 32.3 |
| Previous fusion candidate + Full pose, 18 Hz | 45 | 10 | 33.6 |
| Native joints, earlier strong-only candidate + Full, 18 Hz | 43 | 15 | 40.3 |
| Selected native joints + weak sequences + Full, 18 Hz | 44 | 16 | 48.1 |
| Selected native joints + weak sequences + Full, 6 Hz | 41 | 17 | 54.5 |

The new candidate does **not** improve both misses and false alerts. Its development
gains did not generalize. Do not promote it or lower the threshold based on this test.
The prior candidate remains a useful comparison, but 43/80 missed events does not
qualify it for a safety release either. Faster latency among detected events is not
a substitute for detecting the missed events.

The selected candidate's camera-1 misses/false episodes are 18/40 and 11, versus
15/40 and 8 for the production-Lite comparison. Camera 2 is 26/40 and 5, versus
29/40 and 5. It improves one view's miss count while regressing the other; no broad
camera-generalization claim is justified. Full person/camera breakdowns and individual
event latencies remain in the JSON report.

Post-holdout diagnosis (not a second unseen test) attributes the 44 candidate misses to:

- 19 with eligible joint sequences but no score above the frozen threshold.
- 19 with some positive scores but insufficient observed temporal evidence.
- Three with warnings already active/merged rather than a new event-specific episode.
- Three with no detected pose throughout the event window, all in Peter's second view.

Manual inspection of one no-pose event shows the fall area outside the visible frame;
tracking cannot reconstruct unobserved pixels. One normal-activity false warning shows
the participant sitting on the mattress. A separate ID-only counterfactual uses identical
smoothed joints and excludes multi-pose frames in both arms: misses change 45→44,
false episodes 13→14. This is not identity ground truth and does not fix missing joints;
it does show that forcing ID continuity is not a sufficient repair for this candidate.

The remaining work is **cross-view motion classification and observed-pose quality**,
not a solved tracking bug. Future fitting may use EDF only as now-seen development
data and must reserve different people/cameras for the next independent gate. More
normal bed/mattress entry, recovery, and walking sequences need event-level labels;
the current small development set and four-timepoint classifier have not established
the required separation. Do not claim that another threshold change will solve it.

Reviewable weights, immutable reports and exact inference snapshots are retained outside
the ignored video cache in `research/candidates/native-sequence-v5/`. Raw footage and
landmark traces remain local and ignored. `node tools/archive_video_cycle5.mjs` verifies
hashes, refuses replacement with different contents, and never modifies the live app.

Verification: 89 local automated tests passed (zero skipped), including actual recorded
seated-fall, walking and bed-entry regressions; an interrupted-run test; concurrent
publication; corrupt/changed checkpoint rejection; stale-alert event scoring; and
the archived weights/inference/evidence integrity and model dimensions.
These tests verify code behavior, not commercial fall-detection reliability.

## Reproduction and resumption

Keep raw footage and poses under the ignored `tests/fixtures/generated/video-benchmark/`.
Start a loopback static server from the repository root, and use one authorized browser
TaskSpace. Set `globalThis.benchmarkOptions` then import the absolute path to
`tools/run_video_benchmark.mjs` through Ego Browser:

```js
globalThis.benchmarkOptions = {
  space: YOUR_EXISTING_SPACE_ID,
  pageLabel: 'p1', cycle: 5, source: 'cycle5-edf',
  split: 'external', model: 'full', samplingHz: 18
};
```

Repeat the exact command after interruption. Completed clips print `Resumed`; only
missing clips run. Choose a new `output` directory when the inference contract changes;
never silently reuse old predictions. Optional `ids` permits disjoint recording subsets.
The ten completed Full-model EDF recordings were rerun through this entry point:
all ten printed `Resumed`, with no additional inference.
The completed cycle 4 harness is retained with its local artifacts because adding the EDF
source changes the harness fingerprint.

Preparation: `node tools/fetch_edf_continuous.mjs --videos`, then
`node tools/prepare_edf_continuous.mjs` and `node tools/prepare_video_frames.mjs --edf`.
Manifest/freezes refuse overwrite. Model training is likewise append-only by run folder.
`node tools/train_video_sequence_v5.mjs --weak` is the selected fitting recipe;
`--control` runs the matched strong-only control. Never rerun fitting against opened
EDF results and continue calling those results unseen.

## Limits and release gate

Software tests are not accuracy evidence. Checkpoints fingerprint the model, JavaScript
inference bundle and source modules; this run did not separately fingerprint the WASM
runtime binaries. These staged adult recordings do not establish
older-adult/home performance, camera-day false-alarm rates, actual phone throughput,
background monitoring, or notification delivery. Camera-agnostic software still needs
supported placement/resolution/light conditions. Keep the gate closed unless missed
events and false alerts both improve on the independent evaluation; retain subgroup,
latency and normal-warning-duration results so a misleading aggregate cannot hide failures.
