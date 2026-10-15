/**
 * R161 - single-purpose restricted RunPod CONTROL credential scope test.
 * Authenticated read-only GraphQL query. NEVER mutations, never echo key.
 * This probe does NOT start, stop, or authorize any GPU usage.
 */
import {pathToFileURL} from 'node:url';

export const EXACT_POD_ID='ao1z73um41h61i';
export const GRAPHQL_URL='https://api.runpod.io/graphql';
const query='query ReviewerBExactPod($input: PodFilter) { pod(input: $input) { id desiredStatus costPerHr gpuCount } }';
const deny=reason=>Object.freeze({ok:false,reason,mode:'READ_ONLY_CONTROL_SCOPE_TEST',
  mayStartPod:false,mayStopPod:false,maySpend:false,mayReviewPrivateCode:false});
const states=new Set(['CREATED','RUNNING','RESTARTING','EXITED','PAUSED','DEAD','TERMINATED']);

export function evaluateExactPodGraphql(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
     !data.data||typeof data.data!=='object'||Array.isArray(data.data)||
     Array.isArray(data.errors)&&data.errors.length)
    return deny('GPU_CONTROL_GRAPHQL_RESPONSE_UNVERIFIED');
  const p=data.data.pod;
  if(!p||p.id!==EXACT_POD_ID||!states.has(p.desiredStatus)||
     typeof p.costPerHr!=='number'||!Number.isFinite(p.costPerHr)||
     p.costPerHr<0||p.costPerHr>50||
     !Number.isSafeInteger(p.gpuCount)||p.gpuCount<0||p.gpuCount>8)
    return deny('GPU_CONTROL_EXACT_POD_OR_COST_UNVERIFIED');
  return Object.freeze({ok:true,mode:'READ_ONLY_CONTROL_SCOPE_TEST',
    podId:EXACT_POD_ID,state:p.desiredStatus,reportedUsdPerHour:p.costPerHr,
    reportedGpuCount:p.gpuCount,
    keySupportsMutationsVerified:false,
    independentStopVerified:false,monthlyEuroLimitVerified:false,
    mayStartPod:false,mayStopPod:false,maySpend:false,mayReviewPrivateCode:false});
}
export async function probeRestrictedRunpodControl({apiKey,fetchImpl=fetch}={}){
  if(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>512||
     /[\x00-\x1f\x7f]/.test(apiKey))
    return deny('GPU_CONTROL_KEY_NOT_CONFIGURED');
  let res;
  try{
    res=await fetchImpl(GRAPHQL_URL,{
      method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({query,variables:{input:{podId:EXACT_POD_ID}}}),
      signal:AbortSignal.timeout(8000)
    });
  }catch{return deny('GPU_CONTROL_GRAPHQL_NETWORK_UNAVAILABLE')}
  if(res?.status===401||res?.status===403)return deny('GPU_CONTROL_CREDENTIAL_REJECTED');
  if(res?.status!==200||res?.redirected!==false||res?.url!==GRAPHQL_URL||
     !/^application\/json(?:\s*;|$)/i.test(res.headers?.get?.('content-type')||''))
    return deny('GPU_CONTROL_GRAPHQL_HTTP_UNVERIFIED');
  let data;
  try{
    const clen=res.headers.get('content-length');
    if(clen!==null&&(!/^\d+$/.test(clen)||Number(clen)>8192))
      return deny('GPU_CONTROL_GRAPHQL_OVERSIZED');
    const text=await res.text();
    if(Buffer.byteLength(text,'utf8')>8192)return deny('GPU_CONTROL_GRAPHQL_OVERSIZED');
    data=JSON.parse(text);
  }catch{return deny('GPU_CONTROL_GRAPHQL_INVALID_JSON')}
  return evaluateExactPodGraphql(data);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3||process.argv[2]!=='--read-only')
    {console.error('GPU_CONTROL_INVALID_MODE');process.exitCode=2}
  else {
    const result=await probeRestrictedRunpodControl({apiKey:process.env.RUNPOD_CONTROL_API_KEY});
    console.log(JSON.stringify(result));
    if(!result.ok)process.exitCode=1;
  }
}
