import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import {readFileSync} from 'node:fs';
import { prepareBoundedSemanticReview } from '../candidate/semantic-review-request.mjs';
import { executeLocalOllamaReview } from '../candidate/local-ollama-executor.mjs';

const secret='LOCAL_PRIVATE_SYNTHETIC_DO_NOT_LOG';
const diff=Buffer.from(
  'diff --git a/src/test.mjs b/src/test.mjs\n'+
  'index 1234567..abcdef0 100644\n--- a/src/test.mjs\n'+
  '+++ b/src/test.mjs\n@@ -1 +1 @@\n-before()\n+'+secret+'\n'
);
const digest=x=>createHash('sha256').update(x).digest('hex');
const plan=()=>prepareBoundedSemanticReview({snapshot:{
  repository:'deenkids7-dev/deenkids',repository_id:1282086207,
  pr_number:898,head_sha:'a'.repeat(40),base_sha:'b'.repeat(40),
  diff_sha256:digest(diff)
},rawDiffBytes:diff});
const completion=(findings=[],more={})=>JSON.stringify({
  model:'qwen2.5-coder:7b',done:true,done_reason:'stop',
  message:{role:'assistant',content:JSON.stringify({
    summary:'Synthetic local review',findings
  })},prompt_eval_count:450,eval_count:120,...more
});
const makeResponse=(content,overrides={})=>({
  status:200,redirected:false,url:'http://127.0.0.1:11434/api/chat',
  headers:{get:n=>n==='content-type'?'application/json':null},
  body:new Response(content).body,...overrides
});
const ctx=(more={})=>({
  plan:plan(),trustedDiffBytes:diff,runId:'local-synthetic-898',
  approvedLocalPrivateProcessing:true,
  fetchImpl:async ()=>makeResponse(completion()),...more
});
test('never calls any model without explicit protected local processing approval',async()=>{
  let called=false;
  for(const permission of [false,undefined,null,'true',0]){
    await assert.rejects(()=>executeLocalOllamaReview(ctx({
      approvedLocalPrivateProcessing:permission,
      fetchImpl:async()=>{called=true;throw Error('UNEXPECTED_NETWORK');}
    })),/LOCAL_PRIVATE_PROCESSING_NOT_AUTHORIZED/);
  }
  assert.equal(called,false);
});
test('fully scoped local inference is always INCONCLUSIVE without provenance',async()=>{
  const x=await executeLocalOllamaReview(ctx());
  assert.equal(x.localModelExecuted,true);
  assert.equal(x.provisionalState,'INCONCLUSIVE');
  assert.equal(x.independentReviewVerified,false);
  assert.equal(x.approvalAuthorized,false);
  assert.equal(x.publishEvent,null);
  assert.match(x.localResponseSha256,/^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(x),new RegExp(secret));
  assert.doesNotMatch(inspect(x),new RegExp(secret));
  assert.deepEqual(Object.keys(x).includes('privateCanonicalReportBytes'),false);
});
test('locally reported introduced security finding remains provisional FAIL',async()=>{
  const finding={severity:'high',path:'src/test.mjs',line:1,
    message:secret,evidence:'Synthetic vulnerable input'};
  const x=await executeLocalOllamaReview(ctx({
    fetchImpl:async()=>makeResponse(completion([finding]))
  }));
  assert.equal(x.provisionalState,'FAIL');
  assert.equal(x.findingCount,1);
  assert.ok(x.privateCanonicalReportBytes.toString().includes(secret));
  assert.doesNotMatch(JSON.stringify(x),new RegExp(secret));
  assert.doesNotMatch(inspect(x),new RegExp(secret));
  const copy=x.privateCanonicalReportBytes;
  copy.fill(0);
  assert.ok(x.privateCanonicalReportBytes.toString().includes(secret));
  assert.equal(x.approvalAuthorized,false);
});
test('never permits swapping the source after hash binding',async()=>{
  let called=false;
  await assert.rejects(()=>executeLocalOllamaReview(ctx({
    trustedDiffBytes:Buffer.from('substituted'),
    fetchImpl:async()=>{called=true;return makeResponse(completion());}
  })),/LOCAL_MODEL_DIFF_SCOPE_MISMATCH/);
  assert.equal(called,false);
});
test('model target locked to localhost and no auth token/header',async()=>{
  let capture;
  await executeLocalOllamaReview(ctx({
    fetchImpl:async(url,options)=>{
      capture={url,options};
      return makeResponse(completion());
    }
  }));
  assert.equal(capture.url,'http://127.0.0.1:11434/api/chat');
  assert.equal(capture.options.method,'POST');
  assert.equal(capture.options.redirect,'error');
  assert.equal(capture.options.cache,'no-store');
  assert.doesNotMatch(JSON.stringify(capture.options.headers),/authorization|token|private/i);
  assert.match(capture.options.body,new RegExp(secret));
});
test('redirect, wrong origin, or content type fail closed',async()=>{
  for(const response of [
    makeResponse(completion(),{url:'https://evil.example/api/chat'}),
    makeResponse(completion(),{redirected:true}),
    makeResponse(completion(),{status:302}),
    makeResponse(completion(),{headers:{get:()=> 'text/html'}})
  ]){
    await assert.rejects(()=>executeLocalOllamaReview(ctx({
      fetchImpl:async()=>response
    })),/LOCAL_MODEL_ENDPOINT_UNVERIFIED/);
  }
});
test('malformed or throwing response Headers fail closed without leaking details',async()=>{
  for(const headers of [
    {'content-type':'application/json'},
    {get:()=>{throw Error(secret);}},
    null
  ]){
    await assert.rejects(()=>executeLocalOllamaReview(ctx({
      fetchImpl:async()=>makeResponse(completion(),{headers})
    })),e=>e.message==='LOCAL_MODEL_ENDPOINT_UNVERIFIED'&&
      !e.message.includes(secret));
  }
});
test('oversized streaming denial never waits indefinitely for stuck cancel',async()=>{
  let cancelled=false,released=false;
  const stuck={
    getReader:()=>({
      read:async()=>({done:false,value:new Uint8Array(300000)}),
      cancel:()=>{cancelled=true;return new Promise(()=>{});},
      releaseLock:()=>{released=true;}
    })
  };
  await assert.rejects(()=>executeLocalOllamaReview(ctx({
    fetchImpl:async()=>makeResponse(completion(),{body:stuck})
  })),/LOCAL_MODEL_RESPONSE_REJECTED/);
  assert.equal(cancelled,true);
  assert.equal(released,true);
});
test('oversized response and malformed content never grant approval',async()=>{
  for(const data of ['{', 'x'.repeat(300000),completion([],{done:false})]){
    await assert.rejects(()=>executeLocalOllamaReview(ctx({
      fetchImpl:async()=>makeResponse(data)
    })),/(LOCAL_MODEL_|OLLAMA_COMPLETION_UNVERIFIED)/);
  }
});
test('untrusted errors are sanitized; model privacy never appears in errors',async()=>{
  await assert.rejects(()=>executeLocalOllamaReview(ctx({
    fetchImpl:async()=>{throw Error(secret);}
  })),e=>e.message==='LOCAL_MODEL_REQUEST_FAILED'&&
      !e.message.includes(secret));
});
test('unexpected supplied transport and input are rejected before network',async()=>{
  await assert.rejects(()=>executeLocalOllamaReview(ctx({
    fetchImpl:null
  })),/LOCAL_MODEL_INPUT_UNVERIFIED/);
  await assert.rejects(()=>executeLocalOllamaReview(ctx({
    trustedDiffBytes:null
  })),/LOCAL_MODEL_INPUT_UNVERIFIED/);
});

test('R59 local Ollama request stays finite, isolated, and rejects timeout separately',()=>{
 const src=readFileSync(new URL('../candidate/local-ollama-executor.mjs',
  import.meta.url),'utf8');
 assert.match(src,/const modelSignal=AbortSignal\.timeout\(360000\)/);
 assert.match(src,/signal:modelSignal/);
 assert.match(src,/if\(modelSignal\.aborted\)deny\('LOCAL_MODEL_REQUEST_TIMEOUT'\)/);
 assert.match(src,/deny\('LOCAL_MODEL_REQUEST_FAILED'\)/);
 assert.match(src,/const LOCAL_URL='http:\/\/127\.0\.0\.1:11434\/api\/chat'/);
 assert.doesNotMatch(src,/https:\/\/(?:openai|google|anthropic)\./);
});

// R64 regression: finite local-only CPU allowance, never an indefinite job.
test('R64 slow CPU allowance is finite and LOCAL-only',()=>{
 const src=readFileSync(new URL('../candidate/local-ollama-executor.mjs',import.meta.url),'utf8');
 assert.match(src,/AbortSignal\.timeout\(360000\)/);
 assert.match(src,/if\(modelSignal\.aborted\)deny\('LOCAL_MODEL_REQUEST_TIMEOUT'\)/);
 assert.match(src,/const LOCAL_URL='http:\/\/127\.0\.0\.1:11434\/api\/chat'/);
 assert.doesNotMatch(src,/fetchImpl\(.*https:\/\//);
});


test('known Ollama loopback disconnects have a safe, bounded diagnostic',async()=>{
 const sensitive='SENSITIVE_LOCAL_MODEL_CAUSE_NEVER_EMIT';
 for(const code of ['ECONNRESET','ECONNREFUSED','EPIPE',
  'UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']){
  await assert.rejects(()=>executeLocalOllamaReview(ctx({
   fetchImpl:async()=>{throw new TypeError(sensitive,{cause:{code}});}
  })),e=>e.message==='LOCAL_MODEL_TRANSPORT_INTERRUPTED'
   &&!e.message.includes(sensitive)&&!e.message.includes(code));
 }
 await assert.rejects(()=>executeLocalOllamaReview(ctx({
  fetchImpl:async()=>{throw new Error(sensitive,{cause:{code:'ECONNRESET'}});}
 })),e=>e.message==='LOCAL_MODEL_TRANSPORT_INTERRUPTED'
    &&!e.message.includes(sensitive));
 await assert.rejects(()=>executeLocalOllamaReview(ctx({
  fetchImpl:async()=>{throw new Error(sensitive,{cause:{code:'UNKNOWN'}});}
 })),e=>e.message==='LOCAL_MODEL_REQUEST_FAILED');
});
