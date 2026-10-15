import test from 'node:test';
import assert from 'node:assert/strict';
import {planReviewerBProtectedGpuTunnel} from '../candidate/reviewer-b-protected-gpu-tunnel-plan.mjs';
const POD='ao1z73um41h61i';
const model='qwen2.5-coder:7b';
const fixture=()=>({
  context:{
    repository:'devfactory-reviewer-trust/devfactory-reviewer-b-publisher',
    ref:'refs/heads/main',
    workflowRef:'devfactory-reviewer-trust/devfactory-reviewer-b-publisher/.github/workflows/reviewer-b-private-semantic.yml@refs/heads/main',
    actor:'devfactory-reviewer-service',publisherSha:'a'.repeat(40),
    event:'issue_comment',issueNumber:21,
  },
  target:{
    repository:'deenkids7-dev/deenkids',prNumber:926,
    headSha:'b'.repeat(40),baseSha:'c'.repeat(40),
    readOnlyScopeVerified:true,nativeReviewAlreadyPresent:false
  },
  pod:{
    id:POD,status:'RUNNING',authenticatedProviderReadback:true,
    verifiedGpuName:'RTX A6000',ollamaModelInVram:model
  },
  ssh:{
    host:'tcp-proxy.runpod.net',port:22119,
    privateKeyFile:'/home/runner/.ssh/runner_runpod_pod',
    pinnedKnownHostsFile:'/home/runner/.ssh/known_hosts',
    hostKeyMatchedToExactProviderPod:true,
    httpPortPubliclyExposed:false,
    privateKeyOnlyInProtectedPublisher:true,
    gitHubAppKeyNeverForwarded:true
  },
  billing:{
    providerAuthenticatedMonth:true,fxRateAuthenticatedEurPerUsd:true,
    snapshotAgeSeconds:60,monthlyCapEur:15,
    spentToDateEur:7.5,providerGpuEurPerHour:0.62,
    providerStorageEurPerHour:0.10,extraEur:0.1,standbyEur:0.2
  },
  stop:{
    providerIndependentStopArmed:true,stopProofPodId:POD,
    separateStopCredentialVerified:true,expiryMinutes:20
  },
  exactOwnerPrivateEgressConsent:true,model
});
test('R158 Qwen 7B private tunnel is a pure no-spend no-publish plan',()=>{
 const plan=planReviewerBProtectedGpuTunnel(fixture());
 assert.equal(plan.ok,true,plan.reason);
 assert.equal(plan.model,model);
 assert.equal(plan.podId,POD);
 assert.equal(plan.endpoint,'http://127.0.0.1:11434');
 assert.equal(plan.mayHandlePrivateDiff,true);
 assert.equal(plan.mayStartPod,false);
 assert.equal(plan.maySpend,false);
 assert.equal(plan.mayPublishReview,false);
 assert.equal(plan.mayMerge,false);
 assert.equal(plan.budgetEnvelopeEur,12);
 assert.equal(plan.reservedMarginEur,3);
 assert.equal(Object.isFrozen(plan),true);
 assert.equal(Object.isFrozen(plan.args),true);
 assert.equal(plan.args[plan.args.length-1],'root@tcp-proxy.runpod.net');
 assert.ok(plan.args.includes('StrictHostKeyChecking=yes'));
 assert.ok(plan.args.includes('ForwardAgent=no'));
 assert.ok(plan.args.includes('ExitOnForwardFailure=yes'));
 assert.ok(plan.args.includes('127.0.0.1:11434:127.0.0.1:11434'));
 assert.equal(JSON.stringify(plan).includes('PRIVATE_KEY'),false);
});
test('R158 no unrelated/private/PR actors can change the protected publisher trust',()=>{
 for(const bad of [
  {repository:'other/repo'},{ref:'refs/heads/feature'},
  {workflowRef:'fake'},{actor:'deenkids7-dev'},
  {publisherSha:'z'.repeat(40)},{issueNumber:52},
  {event:'pull_request'}
 ]){
  const x=fixture();Object.assign(x.context,bad);
  const r=planReviewerBProtectedGpuTunnel(x);
  assert.equal(r.ok,false,JSON.stringify(bad));
  assert.equal(r.mayHandlePrivateDiff,false);
 }
});
test('R158 exact private HEAD + scope and no duplicated native bot review',()=>{
 for(const bad of [
  {repository:'foreign/private'},{prNumber:0},{headSha:'bad'},
  {baseSha:'bad'},{readOnlyScopeVerified:false},
  {nativeReviewAlreadyPresent:true}
 ]){
  const x=fixture();Object.assign(x.target,bad);
  const r=planReviewerBProtectedGpuTunnel(x);
  assert.equal(r.ok,false,JSON.stringify(bad));
 }
});
test('R158 35B, 9B, missing 7B VRAM and foreign/offline Pod are denied',()=>{
 for(const bad of [
  {model:'qwen3.6:35b-a3b-coding'},
  {model:'qwen3.5:9b'},
  {pod:{...fixture().pod,id:'65d120da1098'}},
  {pod:{...fixture().pod,status:'EXITED'}},
  {pod:{...fixture().pod,authenticatedProviderReadback:false}},
  {pod:{...fixture().pod,verifiedGpuName:'other'}},
  {pod:{...fixture().pod,ollamaModelInVram:'qwen3.5:9b'}},
  {exactOwnerPrivateEgressConsent:false},
 ]){
  const x={...fixture(),...bad};
  const r=planReviewerBProtectedGpuTunnel(x);
  assert.equal(r.ok,false,JSON.stringify(bad));
  assert.equal(r.mayStartPod,false);
 }
});
test('R158 never trusts unverified independent stop, EUR bill or old snapshot',()=>{
 for(const bad of [
  {stop:{...fixture().stop,providerIndependentStopArmed:false}},
  {stop:{...fixture().stop,stopProofPodId:'bad'}},
  {stop:{...fixture().stop,separateStopCredentialVerified:false}},
  {stop:{...fixture().stop,expiryMinutes:61}},
  {stop:{...fixture().stop,expiryMinutes:0}},
  {billing:{...fixture().billing,providerAuthenticatedMonth:false}},
  {billing:{...fixture().billing,fxRateAuthenticatedEurPerUsd:false}},
  {billing:{...fixture().billing,snapshotAgeSeconds:301}},
  {billing:{...fixture().billing,monthlyCapEur:10}},
  {billing:{...fixture().billing,spentToDateEur:11.95}},
  {billing:{...fixture().billing,providerStorageEurPerHour:NaN}},
 ]){
  const r=planReviewerBProtectedGpuTunnel({...fixture(),...bad});
  assert.equal(r.ok,false,JSON.stringify(bad));
  assert.equal(r.maySpend,false);
 }
});
test('R158 insecure SSH identities and public Ollama exposure always denied',()=>{
 for(const bad of [
  {host:'localhost'},{host:'evil;touch /tmp/x'},{port:0},
  {privateKeyFile:'relative-key'},{pinnedKnownHostsFile:'/dev/null'},
  {privateKeyFile:'/home/runner/.ssh/known_hosts'},
  {hostKeyMatchedToExactProviderPod:false},
  {httpPortPubliclyExposed:true},
  {privateKeyOnlyInProtectedPublisher:false},
  {gitHubAppKeyNeverForwarded:false}
 ]){
  const x=fixture();Object.assign(x.ssh,bad);
  const r=planReviewerBProtectedGpuTunnel(x);
  assert.equal(r.ok,false,JSON.stringify(bad));
  assert.equal(r.mayHandlePrivateDiff,false);
 }
});
