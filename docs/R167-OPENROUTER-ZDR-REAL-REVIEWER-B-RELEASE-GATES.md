# R167 - Reviewer B native OpenRouter ZDR (DRAFT / INACTIVE)

Status 2026-10-15: unmerged; protected main unchanged; zero PRIVATE source egress. One explicitly authorized PUBLIC SYNTHETIC paid OpenRouter Qwen Coder 30B call succeeded (4,664 ms, one finding); provider bill not independently verified. Existing local Reviewer B and Runpod work untouched.

## Implemented
- scripts/openrouter-zdr-executor.mjs: HTTPS OpenRouter chat completions, key monthly cap check, ZDR model catalog, exact allowlisted models, no fallback, no training/routing to storing endpoints, strict JSON, exact code-line validation, bounded cost and response.
- scripts/openrouter-semantic-full-review.mjs: same complete diff shard planner; at most 3 concurrent requests, no paid retry or partial results. A long review renews ONLY read-only key/ZDR/budget preflight before its 120-second proof expires.
- scripts/openrouter-native-report.mjs: authentic distinct OpenRouter native COMMENTED marker and SHA-bound report; NEVER claims local Ollama.
- scripts/openrouter-owner-consent.mjs: OWNER exact PR/HEAD/model/UTC month owner comment, 4-hour freshness, shared 15 EUR budget consent.
- scripts/protected-real-openrouter-review.mjs: protected App read/write credentials, exact authenticated diff, duplicate native review rejection before paid requests, refreshed secrets after inference and owner consent recheck before native publication.
- .github/workflows/reviewer-b-private-openrouter.yml: manual-only protected Publisher main, service actor only, shared concurrency lock with CPU Reviewer B, permissions {}, one protected environment. Default inactive until owner-controlled protected POLICY_READY secret.
- scripts/protected-real-semantic-review.mjs: existing local native publisher unchanged by default; cloud publication opt-in DENIED unless separate approved flag. No upgrade to independent human PASS.

## Mandatory gates before any PRIVATE OpenRouter code transfer (NOT MET)
1. The proposed DevFactory PR #927 now verifies a separate CLOUD Qwen marker, while the historical LOCAL Qwen route is preserved. Exact CI is green and the distinct, unpublished R170 security change passes shared tests in an isolated clone. Keep the cloud lane INACTIVE until #927 has separately required review/approval and is merged into canonical master.
2. Independently review and owner-approve the Publisher cloud integration. Public/synthetic tests are NOT private-model quality or security evidence.
3. In GitHub environment reviewer-b-publish, add secret REVIEWER_B_OPENROUTER_API_KEY (user-created $1/month capped key). Never send this secret to chat, PR, public actions, MSI file or repository. Disable automatic credit replenishment.
4. Only after both policies are LIVE and green, set separate GitHub PROTECTED environment secret REVIEWER_B_CLOUD_POLICY_READY with value approved-protected-v1. Until then new workflow CANNOT run inference.
5. Before each new PR, OWNER verifies actual Runpod + OpenRouter monthly EUR spend and explicitly consents to PRIVATE code being processed by third-party ZDR providers via one EXACT PR owner comment:
   /devfactory-openrouter-consent <PR> <EXACT_40_HEX_HEAD> qwen/qwen3-coder-30b-a3b-instruct <YYYY-MM-UTC> budget15eur
   Must come from deenkids7-dev authenticated GH user, exact PR/HEAD/model/month, within 4 hours. This is human budget attestation, NOT verified live Runpod billing.
6. ONLY then, devfactory-reviewer-service triggers workflow_dispatch on protected Publisher main, with pr_number, expected_head and exact model. Owner must release protected environment approval.
7. A separate live PUBLIC SYNTHETIC OpenRouter request (Qwen Coder 30B) succeeded in 4,664 ms, with valid synthetic schema, 136 prompt tokens, 120 completion tokens and one finding. That does NOT prove full private protected-workflow integration or provider billing; no private POST has occurred.
8. PR #926 already has a valid COMMENTED Reviewer B on current HEAD; do NOT run another review on it. New code blocks duplicate reviews.

## Important boundaries
- ZDR is a provider endpoint routing/retention policy; private code is still transferred to a third party.
- $1 per-key monthly cap is not free prepaid credit, nor a Runpod cap.
- First live protected model run must verify GitHub App Pull Requests:read can read exact owner PR issue comments.
- Strict JSON support varies by provider; unknown responses fail closed.
- No autonomous merge/PASS/HUMAN_GO; native cloud findings remain provisional, distinct later owner acceptance and Merge Executor checks are required.
- No changes to private DevFactory, Runner, Supervisor, Runpod, #876, #895, #926 and Publisher main in this branch.

## Developer checks
- npm test (Node >=20, CI Linux; Windows original checked-out YAML can have CRLF that breaks unrelated baseline EOL-sensitive tests)
- node --test test/openrouter-zdr-executor.test.mjs test/openrouter-native-policy.test.mjs test/candidate-trust-boundary.test.mjs test/protected-real-semantic-review.test.mjs
- git diff --check
All tests are offline mocks; no API key is read and no payment is made.
