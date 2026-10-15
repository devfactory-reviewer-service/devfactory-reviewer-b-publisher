/**
 * R162 exact Pod emergency stop. HIGH-RISK credential is consumed ONLY
 * by an owner-approved protected Publisher-main GitHub Actions environment.
 * Query-only if Pod is already stopped. If RUNNING: one explicit podStop
 * GraphQL mutation and bounded authenticated STOPPED readback.
 *
 * No START, create, delete, terminate, SSH, model, private diff, app token,
 * account-wide management, or arbitrary Pod IDs/URLs.
 */
import {pathToFileURL} from 'node:url';
import {
  GRAPHQL_URL,EXACT_POD_ID,probeRestrictedRunpodControl
} from './runpod-control-readonly-preflight.mjs';

const STOP='mutation StopExactReviewerBPod($input: PodStopInput!) { podStop(input: $input) { id desiredStatus } }';
const deny=reason=>Object.freeze({ok:false,reason,podId:EXACT_POD_ID,
  mayStart:false,stopVerified:false});
const completed=reason=>Object.freeze({ok:true,reason,podId:EXACT_POD_ID,
  mayStart:false,stopVerified:true});

function verifyStopReceipt(payload){
  return payload&&typeof payload==='object'&&!Array.isArray(payload)&&
   (!Array.isArray(payload.errors)||payload.errors.length===0)&&
   payload.data?.podStop?.id===EXACT_POD_ID&&
   ['EXITED','RUNNING','RESTARTING'].includes(payload.data.podStop.desiredStatus);
}
export async function stopExactRunpodReviewerPod({
  apiKey,fetchImpl=fetch,delayImpl=ms=>new Promise(r=>setTimeout(r,ms))
}={}){
 const initial=await probeRestrictedRunpodControl({apiKey,fetchImpl});
 if(!initial.ok)return deny('GPU_STOP_INITIAL_IDENTITY_OR_CREDENTIAL_UNVERIFIED');
 if(initial.state==='EXITED')return completed('GPU_POD_ALREADY_STOPPED');
 if(!['RUNNING','RESTARTING','CREATED','PAUSED'].includes(initial.state))
   return deny('GPU_STOP_STATE_UNSUPPORTED');
 let response;
 try {
   response=await fetchImpl(GRAPHQL_URL,{
     method:'POST',redirect:'error',
     headers:{Authorization:'Bearer '+apiKey,Accept:'application/json','Content-Type':'application/json'},
     body:JSON.stringify({query:STOP,variables:{input:{podId:EXACT_POD_ID}}}),
     signal:AbortSignal.timeout(12000)
   });
 }catch{return deny('GPU_PROVIDER_STOP_MUTATION_UNAVAILABLE')}
 if(response?.status!==200||response?.redirected!==false||response?.url!==GRAPHQL_URL||
   !/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type')||''))
   return deny('GPU_PROVIDER_STOP_MUTATION_HTTP_UNVERIFIED');
 let result;
 try{
   const n=response.headers.get('content-length');
   if(n!==null&&(!/^\d+$/.test(n)||Number(n)>8192))
     return deny('GPU_PROVIDER_STOP_RECEIPT_OVERSIZED');
   const s=await response.text();
   if(Buffer.byteLength(s,'utf8')>8192)return deny('GPU_PROVIDER_STOP_RECEIPT_OVERSIZED');
   result=JSON.parse(s);
 }catch{return deny('GPU_PROVIDER_STOP_RECEIPT_INVALID')}
 if(!verifyStopReceipt(result))return deny('GPU_PROVIDER_STOP_RECEIPT_IDENTITY_UNVERIFIED');
 for(let attempt=0;attempt<5;attempt++){
   if(attempt>0)try{await delayImpl(1000)}catch{}
   const observed=await probeRestrictedRunpodControl({apiKey,fetchImpl});
   if(observed.ok&&observed.state==='EXITED')return completed('GPU_PROVIDER_CONFIRMED_EXITED');
 }
 return deny('GPU_PROVIDER_STOP_NOT_YET_VERIFIED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3||process.argv[2]!=='--stop-exact'){
    console.error('GPU_STOP_INVALID_MODE');process.exitCode=2;
  }else{
    const result=await stopExactRunpodReviewerPod({apiKey:process.env.RUNPOD_CONTROL_API_KEY});
    console.log(JSON.stringify(result));
    if(!result.ok)process.exitCode=1;
  }
}
