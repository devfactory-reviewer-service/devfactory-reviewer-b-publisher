# Reviewer B R108 — Safe timing telemetry and benchmark acceptance

**Scope:** observation only. No change to protected workflow, Qwen model,
immutable HEAD/BASE proof, native COMMENTED review, output validation, shard
selection, retries, installation permissions, CI or protected merge authority.

## Verified baseline

Protected Publisher run 38583184038 completed successfully in 1 h 27 min 22 s
(2026-10-14 14:44:16Z to 16:11:38Z). The complete private-semantic and
native-comment step took 79 min 16 s, from 14:52:19Z to 16:11:35Z.
This includes Qwen inference and protected publication; it is **not**
a measurement of pure inference. Runner environment, load and PR complexity
vary. Its 50 completed model parts are not an average SLA.

## New non-authorizing telemetry

R108 measures each trusted local Ollama request with a monotonic clock and
keeps individual durations **in process memory only**. After complete diff
coverage, report validation and verified native publication, the entrypoint
prints ONE allowlisted `REVIEWER_B_PERF_V1` line containing only:
- `mode` (QUICK/DEEP)
- `original_parts`, `attempts`, `completed_parts`
- `transport_fallbacks`, `output_fallbacks`, `duplicate_fallbacks`
- rounded `wall_seconds`, `model_seconds`, `p50_request_seconds`,
  `p95_request_seconds`, `max_request_seconds`.

The numeric summary is immutable, not included in the private model-report
hash, cannot grant PASS/APPROVED/merge authority, and is not serialized in the
normal semantic review result. If the review or publication fails, **nothing
is emitted as successful performance telemetry**; failures still fail closed.
No private diff, path, source hash, finding, prompt, model response, error
body, GitHub token, installation credential, or per-shard progress is printed.
These timings do not claim to measure Ollama CPU utilization or peak memory.

## Current synthetic comparisons (not real Qwen throughput)

`npm run benchmark:shards-synthetic` builds public fixed synthetic patches
only, verifies the unchanged original diff SHA/byte count and all changed
NEW-side line coordinates, and compares the existing 1,536-byte baseline
partitioner against the currently deployed adaptive planner.

| Synthetic case | Baseline shards | Adaptive shards |
|---|---:|---:|
| small | 1 | 1 |
| medium | 6 | 3 |
| sensitive | 6 | 3 |
| many_files | 18 | 12 |

These counts prove that the existing optimizer can shorten synthetic plans;
they do **not** prove a 2x or any particular reduction in wall time. The
benchmark does not load the private repo or call Ollama.

## Rollout and evaluation gates

1. Do not change Publisher main or reissue #926 review while protected run
   38597800787 is active. R108 goes through separate Publisher PR and
   mandatory CI plus independent review.
2. After all protected gates, use the next naturally authorized Qwen run to
   collect aggregate metrics. Do not initiate a duplicate review merely for
   performance measurement.
3. Compare safe timings for like-sized diffs and sensitive DEEP vs non-sensitive
   QUICK, including retries and environment variance; use more than one
   sample before selecting any speed-changing configuration.
4. Benchmark any future chunk-size or parallelism change on **synthetic**
   independent runner jobs first, with strict coverage, findings checks,
   128-attempt limit, memory safety and fail-closed behavior. No private
   differential-review shortcut and no reuse of earlier-head acceptance.
5. Revert a variant if model reliability, leak resistance, native review
   provenance or protected authorization deteriorates, even when it is faster.

**Status:** R108 measures rather than accelerates production inference.
Its measured production benefit cannot be asserted before protected rollout.
