import test from 'node:test';
import assert from 'node:assert/strict';
import {
 probeMonthlyRunPodBilling,summarizeCurrentMonthBilling
} from '../scripts/runpod-gpu-billing-readonly.mjs';
const TOKEN='rpa_'+'A'.repeat(40);
const MONTH=new Date('2026-10-15T12:45:00.000Z');
const URL='https://api.runpod.io/v2/billing?lastN=1&bucketSize=month';
const data=()=>({
 records:[{startTime:'2026-10-01T00:00:00Z',
 endTime:'2026-11-01T00:00:00Z',
 totalAmount:6.772,podGpuAmount:6.618,podDiskAmount:0.154}],
 metadata:{recordCount:1,query:{
 startTime:'2026-10-01T00:00:00Z',
 endTime:'2026-11-01T00:00:00Z',bucketSize:'month'
 },totals:{totalAmount:6.772}}
});
const reply=(body=data(),params={})=>{
 const r=new Response(JSON.stringify(body),{status:params.status??200,
  headers:{'content-type':params.type??'application/json'}});
 Object.defineProperty(r,'url',{value:params.url??URL});
 return r;
};
test('R151 only authenticated fixed GET of current UTC month, never logs token',async()=>{
 let count=0;
 const result=await probeMonthlyRunPodBilling({now:MONTH,apiKey:TOKEN,
  fetchImpl:async (url,opts)=>{
   count++;assert.equal(url,URL);assert.equal(opts.method,'GET');
   assert.equal(opts.body,undefined);assert.equal(opts.redirect,'error');
   assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
   return reply();
 }});
 assert.equal(count,1);
 assert.equal(result.ok,true);
 assert.equal(result.month,'2026-10');
 assert.equal(result.reportedTotalUsd,6.772);
 assert.equal(result.euroMonthlyBudgetVerified,false);
 assert.equal(result.maySpend,false);
 assert.equal(JSON.stringify(result).includes(TOKEN),false);
});
test('R151 unknown month, status, amounts and metadata deny all budget assertions',()=>{
 for(const payload of [
  {...data(),records:[]},
  {...data(),records:[{...data().records[0],totalAmount:NaN}]},
  {...data(),records:[{...data().records[0],startTime:'2026-09-01T00:00:00Z'}]},
  {...data(),metadata:{...data().metadata,recordCount:2}},
  {...data(),metadata:{...data().metadata,query:{...data().metadata.query,bucketSize:'day'}}},
  {...data(),metadata:{...data().metadata,totals:{totalAmount:7.771}}},
 ]){
  const result=summarizeCurrentMonthBilling(payload,{now:MONTH});
  assert.equal(result.ok,false);assert.equal(result.maySpend,false);
 }
});
test('R151 rejects external redirect, non JSON, oversized or unauthenticated results',async()=>{
 for(const p of [
  {url:'https://example.org/v2/billing'},
  {type:'text/html'},
  {status:400},
  {status:403}
 ]){
  const got=await probeMonthlyRunPodBilling({apiKey:TOKEN,now:MONTH,
   fetchImpl:async()=>reply(data(),p)});
  assert.equal(got.ok,false);
  assert.equal(got.mayStartPod,false);
 }
 const bad=reply({...data(),junk:'x'.repeat(18000)});
 const got=await probeMonthlyRunPodBilling({apiKey:TOKEN,now:MONTH,
  fetchImpl:async()=>bad});
 assert.equal(got.ok,false);
});
test('R151 bad credential blocks even GET, and remote exceptions never echo secrets',async()=>{
 let n=0;
 const denied=await probeMonthlyRunPodBilling({apiKey:'invalid',now:MONTH,
  fetchImpl:async()=>{n++;throw Error(TOKEN)}});
 assert.equal(n,0);assert.equal(denied.ok,false);
 const out=await probeMonthlyRunPodBilling({apiKey:TOKEN,now:MONTH,
  fetchImpl:async()=>{throw Error(TOKEN)}});
 assert.equal(out.ok,false);
 assert.equal(JSON.stringify(out).includes(TOKEN),false);
});
