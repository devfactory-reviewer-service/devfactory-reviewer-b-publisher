# R150 - Owner-gated RunPod **read-only** preflight

Status: **DRAFT / REVIEW ONLY / NO MERGE OR GPU ACTIVATION AUTHORIZATION**.

## Exact purpose
The owner has stored a RunPod API key in a **different** GitHub
environment: `runpod-gpu-preflight.`. Its intended secret name is
`RUNPOD_API_KEY`. The owner has changed the existing RunPod key
permission setting to **Read only**. Key content must NEVER be copied
into PRs, issues, logs, comments or chat.

The separately gated workflow `.github/workflows/runpod-gpu-readonly-preflight.yml`
is a service-account-only inspection (manual dispatch OR exact preflight comment on isolated issue #52) of
the exact current RunPod Pod ID `ao1z73um41h61i` using one authenticated
GET to the official RunPod REST v2 endpoint and a second GET to
`/v2/billing?lastN=1&bucketSize=month`, reporting only the current UTC
month's sanitized USD total. It emits **only sanitized**
Pod identity and state, or a fixed error code. No RunPod response body
or credentials are printed.

## R155 exact environment-name incident

The owner-created environment displayed in GitHub mobile screenshots appears to be named `runpod-gpu-preflight.` **with a literal trailing period**. The earlier workflow referenced `runpod-gpu-preflight` and GitHub apparently created an unprotected empty environment under that different name. The first safe GET-only job failed with `GPU_RUNPOD_API_KEY_NOT_CONFIGURED` before any external request. This correction references the apparent exact owner-created name. Before trusting any credential, verify that the run actually **waits for the required human environment approval**. Do not copy or change the secret until the protection and name are confirmed. No GPU is started.

## Security gates
- Workflow dispatch OR exact service-signed comment on isolated issue #52 ONLY; no PR/push/schedule trigger. An unrelated issue comment cannot satisfy the job guard.
- Runs only from protected Publisher `main`, account
  `devfactory-reviewer-service`, and exact repository identity.
- Environment `runpod-gpu-preflight.` has owner-configured required
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
1. On GitHub, either run manual dispatch on protected `main` as `devfactory-reviewer-service` OR post the exact marker `DEVFACTORY_RUNPOD_READONLY_PREFLIGHT_R154` from that same service account on isolated issue #52.
2. Trigger once only. The protected environment approval remains required. Never post the preflight marker on reviewer issue #21.
3. Under the pending `runpod-gpu-preflight.` environment approval,
   have the separately authorized `deenkids7-dev` principal approve.
   Do not bypass protection rules or perform self-review.
4. Read ONLY the redacted Pod status AND the aggregate UTC-month bill.
   The billed amount may be delayed and is not a live EUR charge guarantee.
   If key scope fails, investigate
   without printing the key or lowering scope.
5. Do not resume the pod until independent stop guarantee, EUR month-to-date
   billing cap <=15 EUR including storage, SSH host identity, security
   and private data egress authority are proven.

## Out of scope and unresolved
This is **not** a production GPU switch, monthly 15 EUR budget safeguard,
GPU stop guarantee or credential installation onto the MSI. The Pod
currently appears stopped per owner dashboard; the API readback will
confirm when permitted. The active PRIVATE Reviewer B CPU workflow,
Publisher `reviewer-b-publish` environment, PR #926 and DevFactory
HUMAN_GO / MERGE_GO policies are unchanged.

Tests: `node --test test/runpod-gpu-readonly-preflight.test.mjs`,
`node --test test/runpod-gpu-billing-readonly.test.mjs` and
`node --test` (Publisher suite). These are offline tests; they do
not verify live provider access or monthly spend.
