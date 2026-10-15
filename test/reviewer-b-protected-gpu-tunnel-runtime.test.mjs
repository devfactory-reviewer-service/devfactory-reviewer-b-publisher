import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {
 assessPinned7BGpuResident,withProtectedReviewerBGpuTunnel
} from '../candidate/reviewer-b-protected-gpu-tunnel-runtime.mjs';
const POD='ao1z73um41h61i';
const base=()=>({
 context:{
  repository:'devfactory-reviewer-trust/devfactory-reviewer-b-publisher',
  ref:'refs/heads/main',
  workflowRef:'devfactory-reviewer-trust/devfactory-reviewer-b-publisher/.github/workflows/reviewer-b-private-semantic.yml@refs/heads/main',
  actor:'devfactory-reviewer-service',publisherSha:'a'.repeat(40),
  event:'issue_comment',issueNumber:21
 },
 target:{repository:'deenkids7-dev/deenkids',prNumber:926,
  headSha:'b'.repeat(40),baseSha:'c'.repeat(40),
  readOnlyScopeVerified:true,nativeReviewAlreadyPresent:false
 },
 pod:{id:POD,status:'RUNNING',authenticatedProviderReadback:true,
  verifiedGpuName:'RTX A6000',ollamaModelInVram:'qwen2.5-coder:7b'},
 ssh:{host:'tcp-proxy.runpod.net',port:22005,
  privateKeyFile:'/home/runner/keys/pod-ssh',
  pinnedKnownHostsFile:'/home/runner/keys/known_hosts',
  hostKeyMatchedToExactProviderPod:true,
  httpPortPubliclyExposed:false,
  privateKeyOnlyInProtectedPublisher:true,
  gitHubAppKeyNeverForwarded:true},
 billing:{providerAuthenticatedMonth:true,fxRateAuthenticatedEurPerUsd:true,
  snapshotAgeSeconds:30,monthlyCapEur:15,spentToDateEur:7,
  providerGpuEurPerHour:0.7,providerStorageEurPerHour:0.1},
 stop:{providerIndependentStopArmed:true,stopProofPodId:POD,
  separateStopCredentialVerified:true,expiryMinutes:20},
 exactOwnerPrivateEgressConsent:true,
 model:'qwen2.5-coder:7b'
});
const reply=(models)=>{
 const r=new Response(JSON.stringify({models}),{status:200,
  headers:{'content-type':'application/json'}});
 Object.defineProperty(r,'url',{value:'http://127.0.0.1:11434/api/ps'});
 return r;
};
const good=()=>reply([{name:'qwen2.5-coder:7b',size:4900000000,size_vram:4900000000}]);
const fakeSpawn=record=>{
 const child=new EventEmitter();
 child.exitCode=null;
 child.kill=sig=>{record.killed=sig;return true};
 return (exe,args,opts)=>{
  record.exe=exe;record.args=args;record.opts=opts;
  return child;
 };
};
test('R159 Ollama model 7B full VRAM proof does not grant reviewer authority',()=>{
 const r=assessPinned7BGpuResident({status:200,redirected:false,
  url:'http://127.0.0.1:11434/api/ps',
  contentType:'application/json',
  models:[{name:'qwen2.5-coder:7b',size:4900000000,size_vram:4900000000}]});
 assert.equal(r.ok,true);
 assert.equal(r.mayMerge,false);
 assert.equal(r.mayPublishReview,false);
});
test('R159 wrong model, partial VRAM, bogus status or redirect deny',()=>{
 for(const m of [
  [{name:'qwen3.6:35b-a3b-coding',size:12000000000,size_vram:12000000000}],
  [{name:'qwen2.5-coder:7b',size:4900000000,size_vram:4800000000}],
  [{name:'qwen2.5-coder:7b',size:4900000000,size_vram:4900000000},{name:'qwen2.5-coder:7b',size:4900000000,size_vram:4900000000}],
  []
 ]){
  const r=assessPinned7BGpuResident({status:200,redirected:false,
   url:'http://127.0.0.1:11434/api/ps',contentType:'application/json',models:m});
  assert.equal(r.ok,false,JSON.stringify(m));
 }
 assert.equal(assessPinned7BGpuResident({status:302,redirected:true}).ok,false);
});
test('R159 no private review before exact host and stop+budget proof',async()=>{
 const x=base();x.stop.providerIndependentStopArmed=false;
 let spawned=0,reviewed=0,fetched=0;
 const r=await withProtectedReviewerBGpuTunnel({
  guardInputs:x,
  spawnImpl:()=>{spawned++},
  fetchImpl:async()=>{fetched++},
  reviewFn:()=>{reviewed++}
 });
 assert.equal(r.ok,false);
 assert.equal(spawned,0);assert.equal(fetched,0);assert.equal(reviewed,0);
});
test('R159 exact tunnel uses no SSH shell, no forwarded App credentials; closes on native success',async()=>{
 const record={};
 let fetched=0,reviewed=0;
 const r=await withProtectedReviewerBGpuTunnel({
  guardInputs:base(),spawnImpl:fakeSpawn(record),
  fetchImpl:async(url,opts)=>{
   fetched++;assert.equal(url,'http://127.0.0.1:11434/api/ps');
   assert.equal(opts.method,'GET');return good();
  },
  reviewFn:async info=>{
   reviewed++;assert.equal(info.model,'qwen2.5-coder:7b');
   assert.equal(info.endpoint,'http://127.0.0.1:11434');
   return {ok:true,code:'REAL_REVIEW_COMMENT_VERIFIED'};
  }
 });
 assert.equal(r.ok,true,r.code);
 assert.equal(r.code,'GPU_PRIVATE_REVIEW_NATIVE_COMMENT_VERIFIED');
 assert.equal(fetched,1);assert.equal(reviewed,1);
 assert.equal(record.exe,'ssh');
 assert.equal(record.opts.shell,false);
 assert.equal(record.opts.stdio,'ignore');
 assert.equal(record.opts.env.GITHUB_TOKEN,undefined);
 assert.equal(record.opts.env.REVIEWER_B_GITHUB_APP_PRIVATE_KEY_PEM,undefined);
 assert.equal(record.killed,'SIGTERM');
 assert.ok(record.args.includes('StrictHostKeyChecking=yes'));
 assert.ok(record.args.includes('ForwardAgent=no'));
 assert.equal(r.mayPublishReview,false);
});
test('R159 failed native COMMENTED readback is rejected and SSH killed',async()=>{
 const record={};
 const r=await withProtectedReviewerBGpuTunnel({
  guardInputs:base(),spawnImpl:fakeSpawn(record),
  fetchImpl:async()=>good(),
  reviewFn:async()=>({ok:false,code:'SEMANTIC_READBACK_INVALID'})
 });
 assert.equal(r.ok,false);assert.equal(record.killed,'SIGTERM');
 assert.equal(r.code,'GPU_PRIVATE_REVIEW_NATIVE_COMMENT_NOT_VERIFIED');
});
test('R159 loopback failure never executes private review, closes tunnel',async()=>{
 const record={};let calls=0;
 const r=await withProtectedReviewerBGpuTunnel({
  guardInputs:base(),spawnImpl:fakeSpawn(record),
  fetchImpl:async()=>{throw Error('do not echo PRIVATE')},
  sleepImpl:async()=>await new Promise(x=>setTimeout(x,3)),
  startTimeoutMs:500,
  reviewFn:async()=>{calls++}
 });
 assert.equal(r.ok,false);assert.equal(calls,0);
 assert.equal(record.killed,'SIGTERM');
 assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
