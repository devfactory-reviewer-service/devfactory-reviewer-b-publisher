/**
 * R159: guarded SSH forwarding for existing Reviewer B /api/chat client.
 * No RunPod start or stop, credential logging, App token forwarding, model
 * replacement, or private output printing. Caller must bring verifiable
 * approved/provider/budget/independent-stop evidence BEFORE entering here.
 *
 * Production control remains the existing Publisher protected environment
 * and exact-head native COMMENTED uniqueness checks. This runner cannot
 * grant publication or HUMAN_GO/MERGE_GO itself.
 */
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {planReviewerBProtectedGpuTunnel} from './reviewer-b-protected-gpu-tunnel-plan.mjs';

const LOOP='http://127.0.0.1:11434/api/ps';
const MODEL='qwen2.5-coder:7b';
const DENY=code=>Object.freeze({ok:false,code,reviewAttempted:false,
   mayPublishReview:false,mayMerge:false});
const delay=ms=>pause(ms);
export function assessPinned7BGpuResident({status,redirected,url,models,contentType}={}){
 if(status!==200||redirected!==false||url!==LOOP||
    !/^application\/json(?:\s*;|$)/i.test(contentType||'')||
    !Array.isArray(models)||models.length<1||models.length>12)
   return DENY('GPU_OLLAMA_RESIDENCY_RESPONSE_INVALID');
 const chosen=models.filter(x=>x?.name===MODEL);
 if(chosen.length!==1)return DENY('GPU_MODEL_IDENTITY_NOT_RESIDENT');
 const m=chosen[0],s=m?.size,v=m?.size_vram;
 // Ollama's /api/ps attests full VRAM residency, not cryptographic GPU
 // identity or reviewer quality. SSH host pin + provider receipt required.
 if(!Number.isSafeInteger(s)||s<1000000||s>100000000000||
    !Number.isSafeInteger(v)||v<s)
   return DENY('GPU_MODEL_FULL_VRAM_RESIDENCY_UNVERIFIED');
 return Object.freeze({ok:true,code:'GPU_QWEN7B_VRAM_CONFIRMED',
   model:MODEL,fullyInVram:true,independentReviewVerified:false,
   mayPublishReview:false,mayMerge:false});
}
async function probe(fetchImpl){
 let r;
 try{
  r=await fetchImpl(LOOP,{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(3000),
   headers:{Accept:'application/json'}});
 }catch{return DENY('GPU_LOOPBACK_TRANSPORT_UNAVAILABLE');}
 if(r?.status!==200||r.redirected!==false||r.url!==LOOP||
   !/^application\/json(?:\s*;|$)/i.test(r.headers?.get?.('content-type')||''))
   return DENY('GPU_OLLAMA_RESIDENCY_RESPONSE_INVALID');
 const length=r.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>16384))
   return DENY('GPU_OLLAMA_RESIDENCY_RESPONSE_OVERSIZED');
 let data;
 try{
  const raw=await r.text();
  if(Buffer.byteLength(raw,'utf8')>16384)return DENY('GPU_OLLAMA_RESIDENCY_RESPONSE_OVERSIZED');
  data=JSON.parse(raw);
 }catch{return DENY('GPU_OLLAMA_RESIDENCY_RESPONSE_INVALID')}
 return assessPinned7BGpuResident({
  status:r.status,redirected:r.redirected,url:r.url,
  contentType:r.headers.get('content-type'),models:data?.models
 });
}
export async function withProtectedReviewerBGpuTunnel({
  guardInputs,reviewFn,spawnImpl=spawn,fetchImpl=fetch,
  sleepImpl=delay,startTimeoutMs=20000
}={}){
 if(typeof reviewFn!=='function'||typeof spawnImpl!=='function'||
    typeof fetchImpl!=='function'||typeof sleepImpl!=='function'||
    !Number.isSafeInteger(startTimeoutMs)||startTimeoutMs<500||
    startTimeoutMs>30000)
   return DENY('GPU_TUNNEL_CALLER_INVALID');
 const plan=planReviewerBProtectedGpuTunnel(guardInputs);
 if(!plan.ok)return DENY(plan.reason);
 let child,ran=false;
 try{
  child=spawnImpl(plan.executable,plan.args,{
    stdio:'ignore',shell:false,detached:false,
    env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/home/runner'},
  });
  if(!child||typeof child.kill!=='function')
   return DENY('GPU_SSH_LAUNCH_INVALID');
  const start=Date.now();
  let resident;
  while(Date.now()-start<startTimeoutMs){
    if(child.exitCode!==null&&child.exitCode!==undefined)
      return DENY('GPU_SSH_TUNNEL_EXITED');
    resident=await probe(fetchImpl);
    if(resident.ok)break;
    await sleepImpl(500);
  }
  if(!resident?.ok)return DENY('GPU_SSH_VRAM_PROOF_TIMEOUT');
  // Only the single protected Publisher review function may ingest PRIVATE
  // source after full runtime tunnel proof. Never pass App keys to subprocess.
  ran=true;
  await reviewFn({endpoint:plan.endpoint,model:MODEL,podId:plan.podId});
  return Object.freeze({ok:true,code:'GPU_PRIVATE_REVIEW_FUNCTION_FINISHED',
    reviewAttempted:true,mayPublishReview:false,mayMerge:false});
 }catch{
  return DENY(ran?'GPU_PRIVATE_REVIEW_FAILED_CLOSED':'GPU_TUNNEL_FAILED_CLOSED');
 }finally{
  try{child?.kill('SIGTERM')}catch{}
 }
}
