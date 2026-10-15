import test from 'node:test';
import assert from 'node:assert/strict';
import {startExactBoundedV2} from '../scripts/runpod-control-bounded-start-v2.mjs';
const now=new Date(),month=now.toISOString().slice(0,7);
const first=month+'-01T00:00:00Z',podId='ao1z73um41h61i',token='rpa_'+'A'.repeat(40);
const R='https://api.runpod.io/v2/pods/'+podId;
const action=R+'/action',B='https://api.runpod.io/v2/billing?lastN=1&bucketSize=month';
const G='https://api.runpod.io/graphql';
const GH='https://api.github.com/repos/devfactory-reviewer-trust/devfactory-reviewer-b-publisher';
const ghRuns=GH+'/actions/workflows/runpod-control-stop-and-watchdog.yml/runs?per_page=10';
const ghJobs=GH+'/actions/runs/12345/jobs?per_page=20';
function reply(payload,url,status=200){
 const r=new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});
 Object.defineProperty(r,'url',{value:url});return r;
}
const gh=async url=>url===ghRuns?reply({workflow_runs:[{id:12345,status:'in_progress',
 conclusion:null,actor:{login:'devfactory-reviewer-service'},event:'issue_comment',
 head_branch:'main',path:'.github/workflows/runpod-control-stop-and-watchdog.yml'}]},url):
 url===ghJobs?reply({jobs:[{name:'Independent provider STOP after bounded 30 minutes',
 status:'in_progress',conclusion:null,steps:[{name:'Independent 30 minute deadline from protected runner',
 status:'in_progress',conclusion:null,started_at:new Date(now.getTime()-30000).toISOString()}]}]},url):
 (()=>{throw Error('foreign github url')})();
const bill=()=>reply({records:[{startTime:first,totalAmount:6.772}],
 metadata:{recordCount:1,query:{bucketSize:'month',startTime:first},totals:{totalAmount:6.772}}},B);
const gql=()=>reply({data:{pod:{id:podId,desiredStatus:'EXITED',costPerHr:0.59,gpuCount:1}}},G);
test('R166 REST v2 one exact start action accepted only after verified watchdog/billing',async()=>{
 let actions=0;
 const x=await startExactBoundedV2({apiKey:token,now,githubFetchImpl:gh,
  delayImpl:async()=>{},
  fetchImpl:async (url,opt)=>{
   assert.equal(opt.headers.Authorization,'Bearer '+token);
   if(url===G)return gql();
   if(url===B){assert.equal(opt.method,'GET');return bill()}
   if(url===action){
    assert.equal(opt.method,'POST');
    assert.deepEqual(JSON.parse(opt.body),{action:'start'});
    actions++;return reply({id:podId,status:'STARTING'},action,202);
   }
   if(url===R){assert.equal(opt.method,'GET');return reply({id:podId,status:'RUNNING'},R)}
   throw Error('foreign url');
  }
 });
 assert.equal(x.ok,true,x.reason);assert.equal(actions,1);
 assert.equal(x.started,true);assert.equal(x.watchdogRunId,12345);
 assert.equal(x.providerState,'RUNNING');assert.equal(x.mayPublishReview,false);
 assert.equal(JSON.stringify(x).includes(token),false);
});
test('R166 HTTP 409 startup denial is distinctly reportable and no repeated mutations',async()=>{
 let actions=0;
 const x=await startExactBoundedV2({apiKey:token,now,githubFetchImpl:gh,
 fetchImpl:async(u,opts)=>{
  if(u===G)return gql();
  if(u===B)return bill();
  if(u===action){actions++;return reply({title:'GPU unavailable secret'},action,409)}
  throw Error('unexpected fetch');
 }});
 assert.equal(x.ok,false);assert.equal(x.reason,'GPU_V2_START_HTTP_409');
 assert.equal(actions,1);assert.equal(JSON.stringify(x).includes('secret'),false);
});
test('R166 HTTP 202 is not permission to claim GPU RUNNING without exact GET readback',async()=>{
 let actions=0,reads=0;
 const x=await startExactBoundedV2({apiKey:token,now,githubFetchImpl:gh,delayImpl:async()=>{},
 fetchImpl:async(u)=>{
  if(u===G)return gql();
  if(u===B)return bill();
  if(u===action){actions++;return reply({id:podId,status:'STARTING'},action,202)}
  if(u===R){reads++;return reply({id:podId,status:'EXITED'},R)}
  throw Error('foreign');
 }});
 assert.equal(x.ok,false);assert.equal(x.reason,'GPU_V2_START_PROVIDER_DID_NOT_CONFIRM_RUNNING');
 assert.equal(actions,1);assert.equal(reads,24);
});
