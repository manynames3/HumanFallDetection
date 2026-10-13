# Native pose-sequence candidate — not approved for deployment

The weights here were trained and tested; they are **not** imported by the live
Carewatch worker. This is a preserved failed generalization result, not a release.

All 30 continuous EDF replays completed: five new people, two camera views, 28.19
camera-minutes. There are 80 camera-events from 40 paired-view staged falls and
9.58 camera-minutes of reviewed normal exposure.

| Pipeline | Missed camera-events /80 | False-warning episodes |
| --- | ---: | ---: |
| Production logic + Lite pose | 44 | 13 |
| Prior temporal candidate + Full pose | 43 | 9 |
| New selected native sequence candidate + Full pose | 44 | 16 |

The release gate failed. Development improvements did not generalize. No weights,
thresholds, or labels were changed in response to this held-out result, and nothing
was deployed. These staged recordings do not establish older-adult/home reliability
or a camera-day false-alarm rate. Even the stronger prior comparison still misses
more than half of these camera-events.

## Contents

- `cycle5-weak/model.json`: selected, newly trained 169-input / 48-hidden-unit model.
  SHA256 `6fb1b556903633862710960fe2872def1b748488109873c86048282d0b83ec37`.
- `cycle5/model.json`: earlier strong-label candidate, frozen before EDF inference.
- `matched-control/`: same-seed strong-label control, used for development ablation
  only, not selected using EDF.
- Each model's selection file preserves its training/selection IDs, seed, epoch,
  inference and trainer hashes, policy, and development predictions.
- `inference/`: byte-for-byte frozen inference source snapshots. These are deliberate
  archival copies, not a second active implementation to update in place.
- `continuous-evaluation.json`: complete event-level result, person/camera subgroups,
  latencies, protocol freeze, review limitations and failed release gates.
- `continuous-manifest.json`: original source metadata, frame labels and SHA256s.
- `bottleneck-report.json`: seen-development classifier/ID diagnosis.
- `failure-attribution.json` and `identity-counterfactual.json`: post-holdout diagnostics,
  not additional unseen tests. Holding an ID constant in the restricted control gives
  45→44 misses but 13→14 false episodes; ID continuity alone is not sufficient.
- `previous-holdout-evaluation.json`: the completed earlier 42-clip holdout.
- `artifacts.json`: SHA256 and size for every archived evidence file above.

No footage or landmark traces are included. They remain in the ignored local fixture
cache. The EDF source is [Zhang, Conly and Athitsos' release](https://zenodo.org/records/15494102),
CC BY 4.0; see the manifest and [full protocol](../../../tests/VIDEO_CYCLE5.md) for
attribution, labels, limitations and reproduction commands. Dataset rights must not
be inferred from this repository's upstream software license.

The current trainer includes the later matched-control implementation. Its default
strong-only run is not claimed to reproduce the earlier strong-only candidate
bit-for-bit. The archived weights and inference snapshots are the exact evaluated
artifacts; their recorded source hashes distinguish the training runs.

Run `node --test tests/video-candidate-archive.test.js` to verify the published
archive. In the full local research workspace, run
`node tools/archive_video_cycle5.mjs` from the repository root to verify/reuse
the archive. It refuses replacement with different evidence. A future candidate
belongs in a new versioned folder and needs a new independent holdout; EDF is now
seen data for any subsequent development.
