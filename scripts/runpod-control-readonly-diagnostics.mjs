/** R165 RunPod exact Pod diagnostic. READ ONLY even though the CONTROL key
 * has write authority. No raw provider errors, account balance or status
 * message in public logs; only fixed local classifications.
 */
import {pathToFileURL} from 'node:url';
import {GRAPHQL_URL,EXACT_POD_ID} from './runpod-control-readonly-preflight.mjs';
const QUERY='query ReviewerBStoppedPodDiagnostics($input: PodFilter) { pod(input: $input) { id desiredStatus locked lastStatusChange costPerHr gpuCount } myself { clientBalance currentSpendPerHr } }';
const deny=reason=>Object.freeze({ok:false,reason,readOnly:true,maySpend:false});
const category=s=>{
 if(typeof s!=='string')return 'UNKNOWN';
 if(/insufficient|balance|credit|payment|fund/i.test(s))return 'BALANCE_OR_PAYMENT';
 if(/gpu|machine|capacity|unavailable|resource|stock|allocat/i.test(s))return 'GPU_CAPACITY_OR_MACHINE';
 if(/terminated|deleted|dead/i.test(s))return 'POD_TERMINAL';
 if(/exit|stop/i.test(s))return 'POD_STOPPED';
 return 'UNCLASSIFIED';
};
export function redactAndClassifyProviderDiagnostics(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   !payload.data?.pod||payload.data.pod.id!==EXACT_POD_ID)
  return deny('GPU_DIAGNOSTIC_POD_IDENTITY_UNVERIFIED');
 const p=payload.data.pod;
 if(Array.isArray(payload.errors)&&payload.errors.length)
  return deny('GPU_DIAGNOSTIC_PROVIDER_GRAPHQL_ERROR');
 if(typeof p.desiredStatus!=='string'||!['EXITED','RUNNING','RESTARTING','CREATED','DEAD','TERMINATED','PAUSED'].includes(p.desiredStatus))
  return deny('GPU_DIAGNOSTIC_STATE_UNVERIFIED');
 const balance=payload.data.myself?.clientBalance,rate=p.costPerHr;
 const enough=typeof balance==='number'&&Number.isFinite(balance)&&balance>=0&&
   typeof rate==='number'&&Number.isFinite(rate)&&rate>=0?
   balance>=Math.max(1,rate*.5+.25):null;
 return Object.freeze({ok:true,readOnly:true,podId:EXACT_POD_ID,
  state:p.desiredStatus,
  locked:p.locked===true,
  category:category(p.lastStatusChange),
  sufficientCreditForHalfHour:enough,
  gpuCount:Number.isSafeInteger(p.gpuCount)?p.gpuCount:null,
  maySpend:false,mayStart:false,mayPublishReview:false});
}
export async function probeRunpodStoppedPodDiagnostics({apiKey,fetchImpl=fetch}={}){
 if(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>512||
   /[\x00-\x1f\x7f]/.test(apiKey))
  return deny('GPU_DIAGNOSTIC_CREDENTIAL_MISSING');
 let r;
 try{
  r=await fetchImpl(GRAPHQL_URL,{
   method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({query:QUERY,variables:{input:{podId:EXACT_POD_ID}}}),
   signal:AbortSignal.timeout(8000)
  });
 }catch{return deny('GPU_DIAGNOSTIC_PROVIDER_UNAVAILABLE')}
 if(r?.status!==200||r?.redirected!==false||r?.url!==GRAPHQL_URL||
  !/^application\/json(?:\s*;|$)/i.test(r.headers?.get?.('content-type')||''))
  return deny('GPU_DIAGNOSTIC_HTTP_UNVERIFIED');
 try{
  const raw=await r.text();
  if(Buffer.byteLength(raw,'utf8')>8192)return deny('GPU_DIAGNOSTIC_RESPONSE_OVERSIZED');
  return redactAndClassifyProviderDiagnostics(JSON.parse(raw));
 }catch{return deny('GPU_DIAGNOSTIC_RESPONSE_INVALID')}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3||process.argv[2]!=='--read-only'){
  console.error('GPU_DIAGNOSTIC_INVALID_MODE');process.exitCode=2;
 }else{
  const z=await probeRunpodStoppedPodDiagnostics({apiKey:process.env.RUNPOD_CONTROL_API_KEY});
  console.log(JSON.stringify(z));
  if(!z.ok)process.exitCode=1;
 }
}
