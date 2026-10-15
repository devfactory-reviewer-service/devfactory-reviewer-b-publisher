# R150 - Owner-gated RunPod **read-only** preflight

Status: **DRAFT / REVIEW ONLY / NO MERGE OR GPU ACTIVATION AUTHORIZATION**.

## Exact purpose
The owner has stored a RunPod API key in a **different** GitHub
environment: `runpod-gpu-preflight`. Its intended secret name is
`RUNPOD_API_KEY`. The owner has changed the existing RunPod key
permission setting to **Read only**. Key content must NEVER be copied
into PRs, issues, logs, comments or chat.

The separately gated workflow `.github/workflows/runpod-gpu-readonly-preflight.yml`
is a manually dispatched, no-input, service-account-only inspection of
the exact current RunPod Pod ID `ao1z73um41h61i` using one authenticated
GET to the official RunPod REST v2 endpoint and a second GET to
`/v2/billing?lastN=1&bucketSize=month`, reporting only the current UTC
month's sanitized USD total. It emits **only sanitized**
Pod identity and state, or a fixed error code. No RunPod response body
or credentials are printed.

## Security gates
- Workflow dispatch ONLY; no PR/push/issue-comment/schedule trigger.
- Runs only from protected Publisher `main`, account
  `devfactory-reviewer-service`, and exact repository identity.
- Environment `runpod-gpu-preflight` has owner-configured required
  reviewer `deenkids7-dev`, no admin bypass and a `main`-only branch
  policy; those UI settings are not independently API-verified here.
- `permissions: {}` provides no GitHub GITHUB_TOKEN access.
- A public Publisher commit tarball is retrieved **before** reading
  the RunPod secret. No untrusted PR branch code is checked out.
- `RUNPOD_API_KEY` exists only in the authenticated GET step.
- No `POST`, `PATCH`, `DELETE`, Pod start/resume/stop, storage
  mutation, expensive GPU access, reviewer publication or fusion.
- Never deliver Github App credentials/private DevFactory diff to GPU.

## Operator sequence AFTER independent code review and a canonical main merge
1. On GitHub, signed in as `devfactory-reviewer-service`, select
   Actions > `RunPod GPU - owner-gated READ ONLY Pod preflight`.
2. Choose `Run workflow` on `main` **once** (no review job re-dispatch).
3. Under the pending `runpod-gpu-preflight` environment approval,
   have the separately authorized `deenkids7-dev` principal approve.
   Do not bypass protection rules or perform self-review.
4. Read ONLY the redacted Pod status AND the aggregate UTC-month bill.
   The billed amount may be delayed and is not a live EUR charge guarantee.
   If key scope fails, investigate
   without printing the key or lowering scope.
5. Do not resume the pod until independent stop guarantee, EUR month-to-date
   billing cap <=10 EUR including storage, SSH host identity, security
   and private data egress authority are proven.

## Out of scope and unresolved
This is **not** a production GPU switch, monthly budget safeguard,
GPU stop guarantee or credential installation onto the MSI. The Pod
currently appears stopped per owner dashboard; the API readback will
confirm when permitted. The active PRIVATE Reviewer B CPU workflow,
Publisher `reviewer-b-publish` environment, PR #926 and DevFactory
HUMAN_GO / MERGE_GO policies are unchanged.

Tests: `node --test test/runpod-gpu-readonly-preflight.test.mjs`,
`node --test test/runpod-gpu-billing-readonly.test.mjs` and
`node --test` (Publisher suite). These are offline tests; they do
not verify live provider access or monthly spend.
