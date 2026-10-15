/** Protected read-only account TOTAL billing snapshot. No GPU transitions,
 * API response logs, secret persistence or EUR spending authorization.
 * Runpod v2: GET /billing?lastN=1&bucketSize=month.
 */
import {pathToFileURL} from 'node:url';
const URL='https://api.runpod.io/v2/billing?lastN=1&bucketSize=month';
const deny=reason=>Object.freeze({ok:false,reason,mode:'READ_ONLY',maySpend:false,mayStartPod:false,mayPublishReview:false});
export function summarizeCurrentMonthBilling(payload,{now=new Date()}={}){
 const month=Number.isNaN(now.getTime())?null:now.toISOString().slice(0,7);
 const rec=payload?.records,meta=payload?.metadata;
 if(!month||!Array.isArray(rec)||rec.length!==1||
    !meta||meta.query?.bucketSize!=='month'||
    meta.recordCount!==1||
    !Array.isArray(payload.records))
   return deny('GPU_BILLING_MONTH_WINDOW_UNVERIFIED');
 const first=month+'-01T00:00:00Z';
 const item=rec[0],q=meta.query;
 if(q.startTime!==first||item?.startTime!==first)
   return deny('GPU_BILLING_MONTH_WINDOW_UNVERIFIED');
 const amount=item?.totalAmount,claimed=meta.totals?.totalAmount;
 if(typeof amount!=='number'||!Number.isFinite(amount)||
    amount<0||amount>1e6||typeof claimed!=='number'||
    !Number.isFinite(claimed)||Math.abs(amount-claimed)>0.001)
   return deny('GPU_BILLING_MONTH_TOTAL_UNVERIFIED');
 return Object.freeze({
  ok:true,mode:'READ_ONLY',month,reportedTotalUsd:Number(amount.toFixed(3)),
  providerLagVerified:false,exchangeRateVerified:false,
  euroMonthlyBudgetVerified:false,independentStopVerified:false,
  maySpend:false,mayStartPod:false,mayPublishReview:false,
  note:'READ ONLY observed bill, not an independent EUR monthly charge cap.'
 });
}
async function boundedBody(r){
 if(r?.status!==200||r?.redirected!==false||
    r?.url!==URL||!/^application\/json(?:\s*;|$)/i.test(r.headers?.get?.('content-type')||''))
    throw Error('GPU_BILLING_RESPONSE_UNVERIFIED');
 const sizeHeader=r.headers.get('content-length');
 if(sizeHeader!==null&&(!/^\d+$/.test(sizeHeader)||Number(sizeHeader)>16384))
   throw Error('GPU_BILLING_RESPONSE_OVERSIZED');
 if(typeof r.body?.getReader!=='function')throw Error('GPU_BILLING_RESPONSE_UNVERIFIED');
 const reader=r.body.getReader(),blocks=[];
 let n=0,done=false;
 try{
  for(;;){
   const item=await reader.read();
   if(item.done){done=true;break}
   if(!(item.value instanceof Uint8Array))throw Error('GPU_BILLING_RESPONSE_UNVERIFIED');
   n+=item.value.byteLength;
   if(n>16384)throw Error('GPU_BILLING_RESPONSE_OVERSIZED');
   blocks.push(Buffer.from(item.value));
  }
 }finally{
  if(!done){try{Promise.resolve(reader.cancel()).catch(()=>{})}catch{}}
  reader.releaseLock();
 }
 const bytes=Buffer.concat(blocks,n),s=bytes.toString('utf8');
 if(!Buffer.from(s,'utf8').equals(bytes))throw Error('GPU_BILLING_RESPONSE_UNVERIFIED');
 try{return JSON.parse(s)}catch{throw Error('GPU_BILLING_RESPONSE_UNVERIFIED')}
}
export async function probeMonthlyRunPodBilling({apiKey,fetchImpl=fetch,now=new Date()}={}){
 if(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>512||
    /[\r\n\0]/.test(apiKey))
   return deny('GPU_RUNPOD_API_KEY_NOT_CONFIGURED');
 let response;
 try{
  response=await fetchImpl(URL,{method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},
   signal:AbortSignal.timeout(8000)});
 }catch{return deny('GPU_BILLING_API_UNAVAILABLE')}
 if(response?.status===401||response?.status===403)
   return deny('GPU_RUNPOD_BILLING_SCOPE_DENIED');
 if(response?.status!==200)return deny('GPU_BILLING_HTTP_REJECTED');
 let json;
 try{json=await boundedBody(response)}catch{
  return deny('GPU_BILLING_RESPONSE_UNVERIFIED');
 }
 return summarizeCurrentMonthBilling(json,{now});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3||process.argv[2]!=='--read-only-monthly'){
  console.error('GPU_BILLING_INVALID_MODE');process.exitCode=2;
 }else{
  const result=await probeMonthlyRunPodBilling({apiKey:process.env.RUNPOD_API_KEY});
  console.log(JSON.stringify(result));
  if(!result.ok)process.exitCode=1;
 }
}
