import test from 'node:test';
import assert from 'node:assert/strict';
import {
 requireActiveIndependentWatchdog,checkConservativeOwnerBudget,
 startExactBoundedReviewerPod
} from '../scripts/runpod-control-bounded-start.mjs';
const now=new Date(),month=now.toISOString().slice(0,7);
const first=month+'-01T00:00:00Z',POD='ao1z73um41h61i';
const TOKEN='rpa_'+'X'.repeat(42);
const GH='https://api.github.com/repos/devfactory-reviewer-trust/devfactory-reviewer-b-publisher';
const watchRuns=GH+'/actions/workflows/runpod-control-stop-and-watchdog.yml/runs?per_page=10';
const jobs=GH+'/actions/runs/12345/jobs?per_page=20';
const GRAPHQL='https://api.runpod.io/graphql';
const billing='https://api.runpod.io/v2/billing?lastN=1&bucketSize=month';
const isoTime=ms=>new Date(now.getTime()-ms).toISOString();
function reply(data,url,status=200){
 const r=new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 Object.defineProperty(r,'url',{value:url});
 return r;
}
const ghRuns=()=>({workflow_runs:[{
  id:12345,status:'in_progress',conclusion:null,
  actor:{login:'devfactory-reviewer-service'},
  event:'issue_comment',head_branch:'main',
  path:'.github/workflows/runpod-control-stop-and-watchdog.yml'
}]});
const ghJobs=()=>({jobs:[{
 name:'Independent provider STOP after bounded 30 minutes',status:'in_progress',
 conclusion:null,steps:[{name:'Independent 30 minute deadline from protected runner',
  status:'in_progress',conclusion:null,started_at:isoTime(25000)}]
}]});
const pod=()=>reply({data:{pod:{id:POD,desiredStatus:'EXITED',
 costPerHr:0.59,gpuCount:1}}},GRAPHQL);
const monthBill=()=>reply({
 records:[{startTime:first,totalAmount:6.772}],
 metadata:{recordCount:1,query:{bucketSize:'month',startTime:first},
 totals:{totalAmount:6.772}}
},billing);
const rGithub=async url=>{
 if(url===watchRuns)return reply(ghRuns(),url);
 if(url===jobs)return reply(ghJobs(),url);
 throw Error('foreign GitHub URL');
};
test('R164 independent watchdog must be actually sleeping, unique and under 180 sec old',async()=>{
 const p=await requireActiveIndependentWatchdog({fetchImpl:rGithub,now});
 assert.equal(p.ok,true,p.reason);
 assert.equal(p.watchdogRunId,12345);
 assert.ok(p.watchdogRemainingMinimumSeconds>1700);
 for(const f of [
  (u)=>u===watchRuns?reply({workflow_runs:[]},u):reply(ghJobs(),u),
  (u)=>u===watchRuns?reply(ghRuns(),u):reply({jobs:[]},u),
  (u)=>u===watchRuns?reply(ghRuns(),u):reply({jobs:[{
    ...ghJobs().jobs[0],steps:[{...ghJobs().jobs[0].steps[0],started_at:isoTime(250000)}]
  }]},u),
  (u)=>u===watchRuns?reply({workflow_runs:[...ghRuns().workflow_runs,...ghRuns().workflow_runs]},u):reply(ghJobs(),u)
 ]){
  const fail=await requireActiveIndependentWatchdog({fetchImpl:f,now});
  assert.equal(fail.ok,false);
 }
});
test('R164 15 EUR monthly budget uses <=12 EUR operating incl storage buffer',()=>{
 const p=checkConservativeOwnerBudget({
  pod:{ok:true,podId:POD,state:'EXITED',reportedGpuCount:1,reportedUsdPerHour:0.59},
  bill:{ok:true,mode:'READ_ONLY',month,reportedTotalUsd:6.772},
  watchdog:{ok:true,watchdogRunId:12345,watchdogRemainingMinimumSeconds:1775}
 });
 assert.equal(p.ok,true,p.reason);assert.equal(p.ownerMonthlyTargetEur,15);
 assert.equal(p.reserveEur,3);
 const fail=checkConservativeOwnerBudget({
  pod:{ok:true,podId:POD,state:'EXITED',reportedGpuCount:1,reportedUsdPerHour:0.59},
  bill:{ok:true,mode:'READ_ONLY',month,reportedTotalUsd:12},
  watchdog:{ok:true,watchdogRunId:12345,watchdogRemainingMinimumSeconds:1775}
 });
 assert.equal(fail.ok,false);
});
test('R164 exact START only after proof and one mutation with exact constant Pod ID',async()=>{
 let mutations=0;
 const r=await startExactBoundedReviewerPod({apiKey:TOKEN,now,
  githubFetchImpl:rGithub,
  fetchImpl:async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
   if(url===billing){assert.equal(options.method,'GET');return monthBill()}
   assert.equal(url,GRAPHQL);
   const body=JSON.parse(options.body);
   if(body.query.includes('mutation')){
    mutations++;
    assert.match(body.query,/podResume/);
    assert.doesNotMatch(body.query,/podStop|podTerminate|podFindAndDeployOnDemand/);
    assert.deepEqual(body.variables.input,{podId:POD,gpuCount:1});
    return reply({data:{podResume:{id:POD,desiredStatus:'RUNNING'}}},GRAPHQL);
   }
   return pod();
  }
 });
 assert.equal(r.ok,true,r.reason);assert.equal(mutations,1);
 assert.equal(r.started,true);assert.equal(r.watchdogRunId,12345);
 assert.equal(r.billedTotalUsd,6.772);assert.equal(r.mayStartOtherPod,false);
 assert.equal(JSON.stringify(r).includes(TOKEN),false);
});
test('R164 denies mutations if watcher, billing or Pod fail',async()=>{
 for(const why of ['watch','bill','pod']){
  let mutated=0;
  const z=await startExactBoundedReviewerPod({apiKey:TOKEN,now,
   githubFetchImpl:why==='watch'
    ?async(url)=>reply({workflow_runs:[]},url):rGithub,
   fetchImpl:async(url,opts)=>{
    if(url===billing)return why==='bill'?reply({},url):monthBill();
    if(JSON.parse(opts.body).query.includes('mutation'))mutated++;
    return why==='pod'?reply({data:{pod:{id:'other',desiredStatus:'EXITED',
      costPerHr:0.59,gpuCount:1}}},url):pod();
   }
  });
  assert.equal(mutated,0,why);assert.equal(z.ok,false,why);
  assert.equal(z.started,false,why);
 }
});
