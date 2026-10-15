import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXACT_POD_ID,GRAPHQL_URL,evaluateExactPodGraphql,probeRestrictedRunpodControl
} from '../scripts/runpod-control-readonly-preflight.mjs';
const token='rpa_'+ 'X'.repeat(40);
const fixture=()=>({data:{pod:{
  id:EXACT_POD_ID,desiredStatus:'EXITED',costPerHr:0.59,gpuCount:1
}}});
function response(x=fixture(),status=200,url=GRAPHQL_URL){
 const res=new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
 Object.defineProperty(res,'url',{value:url});
 return res;
}
test('R161 GraphQL probe makes only a fixed read query for exact Pod, never an API mutation',async()=>{
 let n=0;
 const r=await probeRestrictedRunpodControl({
 apiKey:token,fetchImpl:async(url,opts)=>{
   n++;assert.equal(url,GRAPHQL_URL);
   assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');
   assert.equal(opts.headers.Authorization,'Bearer '+token);
   const body=JSON.parse(opts.body);
   assert.equal(body.variables.input.podId,EXACT_POD_ID);
   assert.match(body.query,/^\s*query\s/);
   assert.doesNotMatch(body.query,/\bmutation\b|podStop|podResume|podTerminate|podFindAndDeployOnDemand/);
   assert.equal(JSON.stringify(body).includes(token),false);
   return response();
 }});
 assert.equal(n,1);assert.equal(r.ok,true);assert.equal(r.state,'EXITED');
 assert.equal(r.reportedUsdPerHour,0.59);assert.equal(r.maySpend,false);
 assert.equal(r.mayStartPod,false);assert.equal(r.mayStopPod,false);
 assert.equal(r.keySupportsMutationsVerified,false);
 assert.equal(JSON.stringify(r).includes(token),false);
});
test('R161 incorrect status, Pod identity, cost or GPU count deny all authority',()=>{
 for(const p of [
  {...fixture(),data:{pod:{...fixture().data.pod,id:'foreign'}}},
  {...fixture(),data:{pod:{...fixture().data.pod,desiredStatus:'INSTANT'}}},
  {...fixture(),data:{pod:{...fixture().data.pod,costPerHr:NaN}}},
  {...fixture(),data:{pod:{...fixture().data.pod,costPerHr:500}}},
  {...fixture(),data:{pod:{...fixture().data.pod,gpuCount:-1}}},
  {errors:[{message:'secret'}]},
  {data:{pod:null}}
 ]){
 const r=evaluateExactPodGraphql(p);assert.equal(r.ok,false);
 assert.equal(r.mayStartPod,false);assert.equal(r.maySpend,false);
 }
});
test('R161 missing scope, credential, redirects, HTTP errors do not reveal key',async()=>{
 let calls=0;
 const missing=await probeRestrictedRunpodControl({apiKey:'x',fetchImpl:async()=>{calls++}});
 assert.equal(calls,0);assert.equal(missing.ok,false);
 for(const [rstatus,url] of [[403,GRAPHQL_URL],[302,GRAPHQL_URL],[200,'https://elsewhere.example/graphql']]){
 const r=await probeRestrictedRunpodControl({apiKey:token,fetchImpl:async()=>response(fixture(),rstatus,url)});
 assert.equal(r.ok,false);
 assert.equal(JSON.stringify(r).includes(token),false);
 }
 const x=await probeRestrictedRunpodControl({apiKey:token,fetchImpl:async()=>{throw Error(token)}});
 assert.equal(x.ok,false);assert.equal(JSON.stringify(x).includes(token),false);
});
