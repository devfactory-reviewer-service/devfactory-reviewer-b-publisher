/**
 * R166 - provider v2 fixed Pod START, after R164 independent 30min watchdog
 * + authenticated monthly billing + owner's 15 EUR conservative budget.
 * R164's GraphQL START receipt was not authoritative on the live Pod.
 * This v2 replacement NEVER treats a POST receipt as runtime GPU readiness.
 */
import {pathToFileURL} from 'node:url';
import {EXACT_POD_ID,probeRestrictedRunpodControl}
 from './runpod-control-readonly-preflight.mjs';
import {probeMonthlyRunPodBilling}
 from './runpod-gpu-billing-readonly.mjs';
import {probeOwnerRunPod}
 from './runpod-gpu-readonly-preflight.mjs';
import {requireActiveIndependentWatchdog,checkConservativeOwnerBudget}
 from './runpod-control-bounded-start.mjs';

const ACTION_URL='https://api.runpod.io/v2/pods/'+EXACT_POD_ID+'/action';
const deny=reason=>Object.freeze({ok:false,reason,podId:EXACT_POD_ID,
  started:false,mayStartOtherPod:false,mayPublishReview:false});
export async function startExactBoundedV2({
 apiKey,fetchImpl=fetch,githubFetchImpl=fetch,
 delayImpl=ms=>new Promise(r=>setTimeout(r,ms)),now=new Date()
}={}){
 const pod=await probeRestrictedRunpodControl({apiKey,fetchImpl});
 if(!pod.ok)return deny('GPU_V2_START_PROVIDER_POD_UNVERIFIED');
 const bill=await probeMonthlyRunPodBilling({apiKey,fetchImpl,now});
 if(!bill.ok)return deny('GPU_V2_START_MONTHLY_BILL_UNVERIFIED');
 const watchdog=await requireActiveIndependentWatchdog({fetchImpl:githubFetchImpl,now});
 if(!watchdog.ok)return deny(watchdog.reason);
 const plan=checkConservativeOwnerBudget({pod,bill,watchdog});
 if(!plan.ok)return deny(plan.reason);
 let response;
 try{
  response=await fetchImpl(ACTION_URL,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({action:'start'})
  });
 }catch{return deny('GPU_V2_START_PROVIDER_NETWORK_UNAVAILABLE')}
 // Distinguish 4xx/5xx WITHOUT ever logging provider body or token.
 if(![200,201,202].includes(response?.status)){
  const known=new Set([400,401,402,403,404,409,422,429,500,502,503,504]);
  return deny(known.has(response?.status)?'GPU_V2_START_HTTP_'+response.status:
   'GPU_V2_START_HTTP_UNVERIFIED');
 }
 if(response.redirected!==false||response.url!==ACTION_URL)
  return deny('GPU_V2_START_REDIRECT_OR_URL_INVALID');
 // Even a positive HTTP receipt is not RUNNING proof.
 for(let index=0;index<24;index++){
  if(index>0){
   try{await delayImpl(2000)}catch{return deny('GPU_V2_START_PROVIDER_WAIT_INTERRUPTED')}
  }
  const x=await probeOwnerRunPod({apiKey,fetchImpl});
  if(x.ok&&x.status==='RUNNING')return Object.freeze({
    ok:true,started:true,podId:EXACT_POD_ID,providerState:'RUNNING',
    budgetUpperEur:plan.upperEur,watchdogRunId:watchdog.watchdogRunId,
    mayStartOtherPod:false,mayPublishReview:false
  });
  if(x.ok&&['TERMINATED','DEAD'].includes(x.status))
   return deny('GPU_V2_START_POD_TERMINAL');
 }
 return deny('GPU_V2_START_PROVIDER_DID_NOT_CONFIRM_RUNNING');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3||process.argv[2]!=='--start-exact-bounded')
  {console.error('GPU_V2_START_INVALID_MODE');process.exitCode=2}
 else{
  const r=await startExactBoundedV2({apiKey:process.env.RUNPOD_CONTROL_API_KEY});
  console.log(JSON.stringify(r));
  if(!r.ok)process.exitCode=1;
 }
}
