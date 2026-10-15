import test from 'node:test';
import assert from 'node:assert/strict';
import {
 redactAndClassifyProviderDiagnostics,probeRunpodStoppedPodDiagnostics
} from '../scripts/runpod-control-readonly-diagnostics.mjs';
const POD='ao1z73um41h61i',TOKEN='rpa_'+'X'.repeat(40);
const fixture=(msg='GPU machine no longer available',bal=3.23)=>({
 data:{pod:{id:POD,desiredStatus:'EXITED',locked:false,gpuCount:1,
  costPerHr:0.59,lastStatusChange:msg},
  myself:{clientBalance:bal,currentSpendPerHr:0}}
});
function reply(data){const r=new Response(JSON.stringify(data),{
 headers:{'content-type':'application/json'}});
 Object.defineProperty(r,'url',{value:'https://api.runpod.io/graphql'});
 return r}
test('R165 exact GraphQL read only detects GPU capacity category and hides provider message/balance',async()=>{
 let calls=0;
 const r=await probeRunpodStoppedPodDiagnostics({apiKey:TOKEN,fetchImpl:async(url,opts)=>{
  calls++;assert.equal(url,'https://api.runpod.io/graphql');
  assert.equal(opts.method,'POST');assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
  const body=JSON.parse(opts.body);
  assert.match(body.query,/^query /);assert.doesNotMatch(body.query,/mutation|podStop|podResume/);
  assert.equal(body.variables.input.podId,POD);
  return reply(fixture());
 }});
 assert.equal(calls,1);assert.equal(r.ok,true);assert.equal(r.state,'EXITED');
 assert.equal(r.category,'GPU_CAPACITY_OR_MACHINE');
 assert.equal(r.sufficientCreditForHalfHour,true);
 assert.equal(JSON.stringify(r).includes('GPU machine no longer'),false);
 assert.equal(JSON.stringify(r).includes('3.23'),false);
 assert.equal(r.maySpend,false);
});
test('R165 masks payment/balance status and denies foreign Pods and GraphQL error messages',()=>{
 assert.equal(redactAndClassifyProviderDiagnostics(fixture('Insufficient credit',0.20)).category,'BALANCE_OR_PAYMENT');
 assert.equal(redactAndClassifyProviderDiagnostics(fixture('Insufficient credit',0.20)).sufficientCreditForHalfHour,false);
 for(const x of [
  {...fixture(),data:{...fixture().data,pod:{...fixture().data.pod,id:'other'}}},
  {...fixture(),errors:[{message:'private sensitive error'}]},
  {data:{pod:null}},
  {...fixture(),data:{...fixture().data,pod:{...fixture().data.pod,desiredStatus:'STRANGE'}}}
 ]){
  const r=redactAndClassifyProviderDiagnostics(x);
  assert.equal(r.ok,false);
  assert.equal(r.maySpend,false);
  assert.equal(JSON.stringify(r).includes('private sensitive'),false);
 }
});
test('R165 missing credentials or network errors never cause mutations or echo secrets',async()=>{
 let requests=0;
 const e=await probeRunpodStoppedPodDiagnostics({apiKey:'invalid',fetchImpl:async()=>{requests++}});
 assert.equal(requests,0);assert.equal(e.ok,false);
 const f=await probeRunpodStoppedPodDiagnostics({apiKey:TOKEN,fetchImpl:async()=>{throw Error(TOKEN)}});
 assert.equal(f.ok,false);assert.equal(JSON.stringify(f).includes(TOKEN),false);
});
