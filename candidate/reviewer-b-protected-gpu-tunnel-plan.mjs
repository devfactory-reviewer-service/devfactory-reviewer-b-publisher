/**
 * R158: prospective PRIVATE GPU inference transport authority boundary.
 *
 * This is a PURE policy module. It DOES NOT SSH, start/stop RunPod,
 * read or transmit PRIVATE diffs, access credentials, or post reviews.
 * The existing native GitHub Publisher must retain PRIVATE App credentials
 * and COMMENTED-only review publication. It must never use a GPU URL.
 */
import path from 'node:path';
// Production main must NOT import the unrelated draft PR #42 budget helper.
// Duplicate its fail-closed arithmetic under the owner 15 EUR policy.
// This calculates a quote; it is not provider billing or stop authority.
const validMoney=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10000;
function planBoundedRunPodGpuTest({
  podId,spentToDateEur,providerGpuEurPerHour,
  providerStorageEurPerHour,extraEur=0,standbyEur=0,
  proposedMinutes,independentlyEnforcedStop=false,
  quoteVerified=false,availableEuroBalanceVerified=false
}={}){
  if(podId!=='ao1z73um41h61i')return {ok:false,reason:'GPU_FOREIGN_POD'};
  if(![spentToDateEur,providerGpuEurPerHour,providerStorageEurPerHour,
       extraEur,standbyEur].every(validMoney)||providerGpuEurPerHour<=0)
    return {ok:false,reason:'GPU_COST_QUOTE_MISSING'};
  if(!Number.isSafeInteger(proposedMinutes)||proposedMinutes<1||proposedMinutes>60)
    return {ok:false,reason:'GPU_SESSION_DURATION_INVALID'};
  if(!independentlyEnforcedStop||!quoteVerified||!availableEuroBalanceVerified)
    return {ok:false,reason:'GPU_COST_OR_STOP_AUTHORITY_MISSING'};
  const estimate=spentToDateEur+extraEur+standbyEur+
    (providerGpuEurPerHour+providerStorageEurPerHour)*(proposedMinutes/60);
  if(!Number.isFinite(estimate)||estimate>12+1e-9)
    return {ok:false,reason:'GPU_TWELVE_EURO_OPERATING_ENVELOPE_EXCEEDED'};
  return {ok:true,operatingEnvelopeEur:12,reservedMarginEur:3};
}

const REPO='devfactory-reviewer-trust/devfactory-reviewer-b-publisher';
const REF=REPO+'/.github/workflows/reviewer-b-private-semantic.yml@refs/heads/main';
const POD='ao1z73um41h61i';
const MODEL='qwen2.5-coder:7b';
const LOOPBACK='http://127.0.0.1:11434';
const deny=reason=>Object.freeze({
  ok:false,reason,mayStartPod:false,maySpend:false,
  mayHandlePrivateDiff:false,mayPublishReview:false,mayMerge:false
});
const file=v=>typeof v==='string'&&v.startsWith('/')&&
  v.length>=2&&v.length<=250&&
  !/[\x00-\x1f\x7f]/.test(v)&&
  path.posix.normalize(v)===v&&v!=='/dev/null'&&
  !v.startsWith('/proc/')&&!v.startsWith('/sys/');
const host=h=>typeof h==='string'&&h.length>=4&&h.length<=253&&
 /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(h)&&
 !h.includes('..')&&h!=='localhost'&&h!=='127.0.0.1';
const sha40=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
export function planReviewerBProtectedGpuTunnel({
  context={},target={},pod={},ssh={},billing={},stop={},
  exactOwnerPrivateEgressConsent=false,
  model=MODEL
}={}){
  if(context.repository!==REPO||context.ref!=='refs/heads/main'||
      context.workflowRef!==REF||context.actor!=='devfactory-reviewer-service'||
      !sha40(context.publisherSha)||context.event!=='issue_comment'||
      context.issueNumber!==21)
    return deny('GPU_PUBLISHER_TRUST_CONTEXT_UNVERIFIED');
  if(target.repository!=='deenkids7-dev/deenkids'||
     !Number.isSafeInteger(target.prNumber)||target.prNumber<1||
     !sha40(target.headSha)||!sha40(target.baseSha)||
     target.readOnlyScopeVerified!==true||
     target.nativeReviewAlreadyPresent!==false)
    return deny('GPU_TARGET_EXACT_PRIVATE_SCOPE_UNVERIFIED');
  if(model!==MODEL||pod.id!==POD||pod.status!=='RUNNING'||
     pod.authenticatedProviderReadback!==true||
     pod.verifiedGpuName!=='RTX A6000'||
     pod.ollamaModelInVram!==MODEL)
    return deny('GPU_PROVIDER_IDENTITY_AND_MODEL_UNVERIFIED');
  if(exactOwnerPrivateEgressConsent!==true)
    return deny('GPU_PRIVATE_EGRESS_CONSENT_MISSING');
  if(stop.providerIndependentStopArmed!==true||
     stop.stopProofPodId!==POD||
     stop.separateStopCredentialVerified!==true||
     stop.expiryMinutes>60||
     !Number.isSafeInteger(stop.expiryMinutes)||stop.expiryMinutes<1)
    return deny('GPU_INDEPENDENT_PROVIDER_STOP_NOT_PROVEN');
  if(billing.providerAuthenticatedMonth!==true||
     billing.fxRateAuthenticatedEurPerUsd!==true||
     !Number.isSafeInteger(billing.snapshotAgeSeconds)||
     billing.snapshotAgeSeconds<0||billing.snapshotAgeSeconds>300||
     billing.monthlyCapEur!==15)
    return deny('GPU_MONTH_BILLING_OR_FX_UNVERIFIED');
  const budget=planBoundedRunPodGpuTest({
    podId:POD,
    spentToDateEur:billing.spentToDateEur,
    providerGpuEurPerHour:billing.providerGpuEurPerHour,
    providerStorageEurPerHour:billing.providerStorageEurPerHour,
    extraEur:billing.extraEur,
    standbyEur:billing.standbyEur,
    proposedMinutes:stop.expiryMinutes,
    independentlyEnforcedStop:true,
    quoteVerified:true,
    availableEuroBalanceVerified:true
  });
  if(!budget.ok)return deny(budget.reason);
  if(!host(ssh.host)||!Number.isSafeInteger(ssh.port)||
    ssh.port<1||ssh.port>65535||
    !file(ssh.privateKeyFile)||!file(ssh.pinnedKnownHostsFile)||
    ssh.privateKeyFile===ssh.pinnedKnownHostsFile||
    ssh.hostKeyMatchedToExactProviderPod!==true||
    ssh.httpPortPubliclyExposed!==false||
    ssh.privateKeyOnlyInProtectedPublisher!==true||
    ssh.gitHubAppKeyNeverForwarded!==true)
    return deny('GPU_SSH_HOST_KEY_OR_SECRETS_UNVERIFIED');
  const args=Object.freeze([
    '-F','/dev/null','-o','BatchMode=yes',
    '-o','IdentitiesOnly=yes',
    '-o','StrictHostKeyChecking=yes',
    '-o','PasswordAuthentication=no',
    '-o','KbdInteractiveAuthentication=no',
    '-o','ForwardAgent=no',
    '-o','PermitLocalCommand=no',
    '-o','ExitOnForwardFailure=yes',
    '-o','ServerAliveInterval=10',
    '-o','ServerAliveCountMax=2',
    '-o','ConnectTimeout=10',
    '-o','RequestTTY=no',
    '-o','LogLevel=ERROR',
    '-o','GlobalKnownHostsFile=/dev/null',
    '-o','UserKnownHostsFile='+ssh.pinnedKnownHostsFile,
    '-i',ssh.privateKeyFile,'-p',String(ssh.port),
    '-L','127.0.0.1:11434:127.0.0.1:11434',
    '-N','root@'+ssh.host
  ]);
  return Object.freeze({
    ok:true,model,podId:POD,executable:'ssh',args,
    endpoint:LOOPBACK,authoredBy:'protected-publisher-APP-ONLY',
    privacy:'SSH-ENCRYPTED_PRIVATE_INFERENCE_WITHOUT_APP_SECRETS',
    budgetEnvelopeEur:budget.operatingEnvelopeEur,
    reservedMarginEur:budget.reservedMarginEur,
    mayHandlePrivateDiff:true,
    mayStartPod:false,maySpend:false,
    mayPublishReview:false,mayMerge:false,
    note:'This only plans a tunnel; it cannot validate provider billing, independent stop or private transit at runtime by itself.'
  });
}
