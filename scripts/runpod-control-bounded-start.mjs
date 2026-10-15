/**
 * R164 protected, one-shot, bounded RunPod START policy.
 * Exact Pod ID. Only after an independent GH watchdog is observed
 * ACTUALLY sleeping, provider monthly USD billing is fresh and bounded
 * conservatively within the owner's 15 EUR/month budget (12+3 reserve).
 * One fixed podResume mutation; NO arbitrary resources, no secrets printed.
 * Caller must STOP in the same runner's finally; a separately owner-approved
 * GH runner is the independent 30-minute watchdog.
 */
import {pathToFileURL} from 'node:url';
import {GRAPHQL_URL,EXACT_POD_ID,probeRestrictedRunpodControl}
  from './runpod-control-readonly-preflight.mjs';
import {probeMonthlyRunPodBilling} from './runpod-gpu-billing-readonly.mjs';

const PUB='devfactory-reviewer-trust/devfactory-reviewer-b-publisher';
const WATCH_RUNS='https://api.github.com/repos/'+PUB+
  '/actions/workflows/runpod-control-stop-and-watchdog.yml/runs?per_page=10';
const START='mutation StartBoundedReviewerBPod($input: PodResumeInput!) { podResume(input: $input) { id desiredStatus } }';
const deny=reason=>Object.freeze({ok:false,reason,started:false,mayStartOtherPod:false,mayPublishReview:false});

async function getGhJson({url,fetchImpl}){
 let r;
 try{r=await fetchImpl(url,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),
   headers:{Accept:'application/vnd.github+json','User-Agent':'DevFactory-Runpod-Guard'}
 });}catch{return null}
 if(r?.status!==200||r?.redirected!==false||r?.url!==url||
   !/application\/json/i.test(r.headers?.get?.('content-type')||''))return null;
 const clen=r.headers.get('content-length');
 if(clen!==null&&(!/^\d+$/.test(clen)||Number(clen)>200000))return null;
 try{
  const s=await r.text();
  if(Buffer.byteLength(s,'utf8')>200000)return null;
  return JSON.parse(s);
 }catch{return null}
}
export async function requireActiveIndependentWatchdog({
  fetchImpl=fetch,now=new Date()
}={}){
 if(Number.isNaN(now.getTime()))return deny('GPU_WATCHDOG_CLOCK_INVALID');
 const list=await getGhJson({url:WATCH_RUNS,fetchImpl});
 if(!Array.isArray(list?.workflow_runs)||list.workflow_runs.length>10)
   return deny('GPU_WATCHDOG_GITHUB_API_UNVERIFIED');
 const candidates=list.workflow_runs.filter(x=>
   x.status==='in_progress'&&x.conclusion==null&&
   x.actor?.login==='devfactory-reviewer-service'&&
   x.event==='issue_comment'&&x.head_branch==='main'&&
   Number.isSafeInteger(x.id)&&x.id>0&&
   x.path==='.github/workflows/runpod-control-stop-and-watchdog.yml');
 if(candidates.length!==1)return deny('GPU_WATCHDOG_NOT_UNIQUELY_ARMED');
 const x=candidates[0],jobsUrl='https://api.github.com/repos/'+PUB+
    '/actions/runs/'+x.id+'/jobs?per_page=20';
 const jobs=await getGhJson({url:jobsUrl,fetchImpl});
 const all=jobs?.jobs;
 if(!Array.isArray(all)||all.length>20)
   return deny('GPU_WATCHDOG_JOB_EVIDENCE_UNVERIFIED');
 const matches=all.filter(j=>
   j.name==='Independent provider STOP after bounded 30 minutes'&&
   j.status==='in_progress'&&j.conclusion==null);
 if(matches.length!==1)return deny('GPU_WATCHDOG_JOB_NOT_RUNNING');
 const step=matches[0].steps?.find(y=>
   y.name==='Independent 30 minute deadline from protected runner');
 if(!step||step.status!=='in_progress'||step.conclusion!=null)
   return deny('GPU_WATCHDOG_DEADLINE_NOT_RUNNING');
 const started=Date.parse(step.started_at||'');
 const age=(now.getTime()-started)/1000;
 if(!Number.isFinite(age)||age<0||age>180)
   return deny('GPU_WATCHDOG_DEADLINE_NOT_FRESH');
 return Object.freeze({ok:true,watchdogRunId:x.id,
   watchdogRemainingMinimumSeconds:1800-age,
   confirmedBy:'GITHUB_REST_PUBLIC_READ_ONLY',
   mayStartOtherPod:false,mayPublishReview:false});
}
export function checkConservativeOwnerBudget({pod,bill,watchdog}={}){
 if(!pod?.ok||pod.podId!==EXACT_POD_ID||
   pod.state!=='EXITED'||pod.reportedGpuCount!==1||
   typeof pod.reportedUsdPerHour!=='number'||pod.reportedUsdPerHour<=0||
   pod.reportedUsdPerHour>0.75)
   return deny('GPU_START_POD_OR_PRICE_UNVERIFIED');
 if(!watchdog?.ok||!Number.isSafeInteger(watchdog.watchdogRunId)||
   watchdog.watchdogRemainingMinimumSeconds<1620)
   return deny('GPU_START_WATCHDOG_NOT_ARMED');
 if(!bill?.ok||bill.mode!=='READ_ONLY'||bill.month!==new Date().toISOString().slice(0,7)||
   typeof bill.reportedTotalUsd!=='number'||!Number.isFinite(bill.reportedTotalUsd)||
   bill.reportedTotalUsd<0)
   return deny('GPU_START_MONTH_TO_DATE_BILL_UNVERIFIED');
 // Conservative estimate incl >=30-min GPU rate, upper storage contingency
 // and 1.3 EUR/USD stress assumption. NOT an exchange-rate guarantee.
 const upperEur=(bill.reportedTotalUsd+
  (pod.reportedUsdPerHour+0.25)*0.5+0.5)*1.3;
 if(upperEur>12)
   return deny('GPU_START_12_EUR_OPERATING_ENVELOPE_EXCEEDED');
 return Object.freeze({ok:true,upperEur:Number(upperEur.toFixed(3)),
   reserveEur:3,ownerMonthlyTargetEur:15,
   estimatedMaximumComputeMinutes:25,
   actualProviderSpendingCapVerified:false});
}
export async function startExactBoundedReviewerPod({
  apiKey,fetchImpl=fetch,githubFetchImpl=fetch,now=new Date()
}={}){
 const pod=await probeRestrictedRunpodControl({apiKey,fetchImpl});
 if(!pod.ok)return deny('GPU_START_CONTROL_READBACK_UNVERIFIED');
 const bill=await probeMonthlyRunPodBilling({apiKey,fetchImpl,now});
 if(!bill.ok)return deny('GPU_START_BILLING_UNVERIFIED');
 const watch=await requireActiveIndependentWatchdog({fetchImpl:githubFetchImpl,now});
 if(!watch.ok)return deny(watch.reason);
 const budget=checkConservativeOwnerBudget({pod,bill,watchdog:watch});
 if(!budget.ok)return deny(budget.reason);
 let r;
 try{
  r=await fetchImpl(GRAPHQL_URL,{
   method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({query:START,variables:{input:{podId:EXACT_POD_ID,gpuCount:1}}}),
   signal:AbortSignal.timeout(12000)
  });
 }catch{return deny('GPU_START_PROVIDER_MUTATION_UNAVAILABLE')}
 if(r?.status!==200||r?.redirected!==false||r?.url!==GRAPHQL_URL||
   !/^application\/json(?:\s*;|$)/i.test(r.headers?.get?.('content-type')||''))
    return deny('GPU_START_PROVIDER_HTTP_UNVERIFIED');
 let parsed;
 try{
  const len=r.headers.get('content-length');
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>8192))
   return deny('GPU_START_RESPONSE_OVERSIZED');
  const text=await r.text();
  if(Buffer.byteLength(text,'utf8')>8192)
   return deny('GPU_START_RESPONSE_OVERSIZED');
  parsed=JSON.parse(text);
 }catch{return deny('GPU_START_RESPONSE_INVALID')}
 const p=parsed?.data?.podResume;
 if(Array.isArray(parsed?.errors)&&parsed.errors.length||
   p?.id!==EXACT_POD_ID||
   !['RUNNING','CREATED','RESTARTING'].includes(p.desiredStatus))
   return deny('GPU_START_PROVIDER_RECEIPT_UNVERIFIED');
 return Object.freeze({ok:true,started:true,podId:EXACT_POD_ID,
   providerState:p.desiredStatus,
   billedTotalUsd:bill.reportedTotalUsd,
   conservativeBudgetEur:budget.upperEur,
   watchdogRunId:watch.watchdogRunId,
   mayStartOtherPod:false,mayPublishReview:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3||process.argv[2]!=='--start-exact-bounded')
  {console.error('GPU_START_INVALID_MODE');process.exitCode=2}
 else{
  const result=await startExactBoundedReviewerPod({
   apiKey:process.env.RUNPOD_CONTROL_API_KEY});
  console.log(JSON.stringify(result));
  if(!result.ok)process.exitCode=1;
 }
}
