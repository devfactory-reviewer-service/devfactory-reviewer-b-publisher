# R158–R159 — Protected PRIVATE GPU Qwen 7B transport (candidate, NOT LIVE)

**Selected model:** `qwen2.5-coder:7b`. Production protected native Reviewer B successfully completed #926 on this exact model (run 38715430667, 73 exact authenticated shards, 92 completed model parts, wall ~7493 sec, 33 **provisional** findings, COMMENTED only). A public GH-hosted `qwen3.5:9b` synthetic job (run 38643784063) failed strict quality: 3/5 seeded semantic bugs detected, so do not promote it. The former RunPod A6000 `qwen3.6:35b-a3b-coding` output-rate measurement (~56–73 tokens/sec) was short synthetic inference ONLY, without matching private review quality validation. The lowest-risk first GPU acceleration trial is the SAME 7B model, not a model switch.

## Verified remote-access baseline
- Separate RunPod protected read-only environment `runpod-gpu-preflight.` (literal dot) is owner-approved and tested in GitHub run `38746049080`, full SUCCESS.
- Exact RunPod Pod `ao1z73um41h61i`: provider status `EXITED` at check; authenticated October 2026 spend `6.772 USD`, billing may lag.
- Owner spending target `15 EUR/month` **ALL IN**; proposed 12 EUR operating + 3 EUR reserve, BUT **NO provider-enforced cap exists**. No Pod start without a genuinely independent STOP mechanism and fresh authenticated EUR-converted billing.
- Current API key in preflight environment is READ ONLY. Do not widen it or copy it into the review Publisher.

## Code under review
- Pure fail-closed private SSH plan restricted to the exact protected Publisher workflow/main/service actor, issue #21, exact private PR SHA/BASE, unique native bot reviewer, owner-private egress consent, exact Pod ID, Qwen 7B, independently armed provider stop, fresh 15 EUR budget, and strict host-key pinned loopback-only SSH.
- Privileged transport runner kept **outside candidate/**, in scripts/ to satisfy public trust boundaries. Starts a bounded `ssh -N` forwarding process with `StrictHostKeyChecking=yes`, `ForwardAgent=no`, no shell; polls local `GET /api/ps` for exact fully VRAM-resident 7B before invoking the already protected reviewer callback. Closes tunnel in `finally`; requires verified native COMMENTED readback. No app key, review diff, or model response in logs.
- **Do not confuse these pure/mock assertions with live Pod/billing/SSH/STOP proofs**. A caller-provided flag is not independently audited authority.
- Full Publisher local `node --test` **562/562 PASS**, 0 fails. All tests are offline.

## Not yet integrated / barriers to live
1. RunPod is currently STOPPED; no API key allowing **start and stop** has been securely scoped/provisioned, and no independent provider watchdog with verified kill receipt exists.
2. Exact SSH host/port + provider-associated host fingerprint for the CURRENT Pod not proved; dedicated SSH key is on the MSI, not yet safely provisioned to protected `reviewer-b-publish` GitHub environment.
3. Protected Reviewer B workflow still starts CPU Ollama. No shadow GPU duplicate may consume issue #21 or publish a second review. A single-route opt-in producer mutation, proof-generating provider guard and controlled launch/STOP must be separately reviewed before enabling.
4. Private source on third-party RunPod is owner-requested but must use authenticated SSH transit and never send GitHub App credentials or protected environment secrets.
5. No quality or speed claim for GPU **Qwen 7B** until a matching PUBLIC holdout and then one authorized actual private review complete and the Pod is stopped.

**HOLD:** keep this PR DRAFT, do not merge/dispatch RunPod based solely on these unit tests. Do not alter #926/#878, #895/#876 issue authorities, protected Publisher main, or the active DevFactory Runner.