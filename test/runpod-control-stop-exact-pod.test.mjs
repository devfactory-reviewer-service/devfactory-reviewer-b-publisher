import test from 'node:test';
import assert from 'node:assert/strict';
import {GRAPHQL_URL,EXACT_POD_ID} from '../scripts/runpod-control-readonly-preflight.mjs';
import {stopExactRunpodReviewerPod} from '../scripts/runpod-control-stop-exact-pod.mjs';
const key='rpa_'+'X'.repeat(40);
function response(data){
 const r=new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
 Object.defineProperty(r,'url',{value:GRAPHQL_URL});
 return r;
}
function observed(state='RUNNING'){
 return response({data:{pod:{id:EXACT_POD_ID,desiredStatus:state,costPerHr:0.59,gpuCount:1}}});
}
test('R162 EXITED status has no mutation, no cost and no extra API calls',async()=>{
 let n=0;const r=await stopExactRunpodReviewerPod({apiKey:key,
 fetchImpl:async(u,opts)=>{
  assert.equal(u,GRAPHQL_URL);assert.equal(opts.method,'POST');
  assert.match(JSON.parse(opts.body).query,/^\s*query /);
  n++;return observed('EXITED');
 }});
 assert.equal(n,1);assert.equal(r.ok,true);assert.equal(r.stopVerified,true);
 assert.equal(r.mayStart,false);
});
test('R162 RUNNING Pod generates exactly one fixed stop mutation and verifies authenticated EXITED',async()=>{
 let count=0,mutations=0;
 const r=await stopExactRunpodReviewerPod({apiKey:key,
  delayImpl:async()=>{},
  fetchImpl:async(url,opts)=>{
   count++;assert.equal(url,GRAPHQL_URL);assert.equal(opts.method,'POST');
   assert.equal(opts.headers.Authorization,'Bearer '+key);
   const obj=JSON.parse(opts.body);
   assert.equal(obj.variables.input.podId,EXACT_POD_ID);
   if(obj.query.includes('mutation')){
    mutations++;assert.match(obj.query,/podStop/);
    assert.doesNotMatch(obj.query,/podResume|podFindAndDeployOnDemand|podTerminate/);
    return response({data:{podStop:{id:EXACT_POD_ID,desiredStatus:'RUNNING'}}});
   }
   assert.match(obj.query,/^\s*query /);
   return observed(count===1?'RUNNING':'EXITED');
  }
 });
 assert.equal(r.ok,true,r.reason);assert.equal(count,3);assert.equal(mutations,1);
 assert.equal(r.reason,'GPU_PROVIDER_CONFIRMED_EXITED');
 assert.equal(JSON.stringify(r).includes(key),false);
});
test('R162 unauthorized/foreign Pod or broken mutation fails closed',async()=>{
 const scenarios=[
  [()=>response({data:{pod:{id:'foreign',desiredStatus:'RUNNING',costPerHr:0.59,gpuCount:1}}}),0],
  [()=>response({errors:[{message:'not authorized'}]}),0]
 ];
 for(const [reply] of scenarios){
  let mutations=0;
  const x=await stopExactRunpodReviewerPod({apiKey:key,fetchImpl:async(u,o)=>{
   if(JSON.parse(o.body).query.includes('mutation'))mutations++;
   return reply();
  }});
  assert.equal(x.ok,false);assert.equal(mutations,0);
 }
 for(const wrong of [
  {data:{podStop:{id:'foreign',desiredStatus:'EXITED'}}},
  {data:{podStop:{id:EXACT_POD_ID,desiredStatus:'MYSTERY'}}},
  {errors:[{message:'private'}]}
 ]){
  let calls=0;
  const x=await stopExactRunpodReviewerPod({apiKey:key,fetchImpl:async()=>{
   calls++;
   return calls===1?observed('RUNNING'):response(wrong);
  }});
  assert.equal(x.ok,false);assert.equal(calls,2);
  assert.equal(JSON.stringify(x).includes('private'),false);
 }
});
test('R162 provider mutation asynchronous but no EXITED readback is NOT success',async()=>{
 let calls=0;
 const x=await stopExactRunpodReviewerPod({
  apiKey:key,delayImpl:async()=>{},
  fetchImpl:async(u,opts)=>{
   calls++;
   return JSON.parse(opts.body).query.includes('mutation')
    ?response({data:{podStop:{id:EXACT_POD_ID,desiredStatus:'RUNNING'}}})
    :observed('RUNNING');
  }
 });
 assert.equal(calls,7);assert.equal(x.ok,false);
 assert.equal(x.reason,'GPU_PROVIDER_STOP_NOT_YET_VERIFIED');
 assert.equal(x.stopVerified,false);
});
