/**
 * Public-safe, aggregate-only diagnostics for Reviewer B protected CPU runs.
 * Never accept paths, tokens, diff content, prompt text, hashes or errors.
 * No per-shard provenance is emitted in public GitHub Actions logs.
 */
const MAX_SECONDS=3*60*60;
const KEYS=['schema','mode','original_parts','attempts','completed_parts',
  'transport_fallbacks','output_fallbacks','duplicate_fallbacks',
  'wall_seconds','model_seconds','p50_request_seconds','p95_request_seconds',
  'max_request_seconds'];
const isCount=(x,max)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const secs=(ms)=>Math.min(MAX_SECONDS,Math.max(0,Math.round(ms/1000)));
const percentile=(arr,q)=>arr[Math.max(0,Math.ceil(arr.length*q)-1)]||0;

export function summarizeSafeReviewPerformance({
  mode,originalParts,attempts,completedParts,transportFallbacks,
  outputFallbacks,duplicateFallbacks,wallMs,requestDurationsMs,
}={}){
  if(!['DEEP','QUICK'].includes(mode)||
     !isCount(originalParts,128)||originalParts<1||
     !isCount(attempts,128)||attempts<originalParts||
     !isCount(completedParts,128)||completedParts<originalParts||
     completedParts>attempts||
     !isCount(transportFallbacks,3)||
     !isCount(outputFallbacks,16)||
     !isCount(duplicateFallbacks,8)||
     !Number.isFinite(wallMs)||wallMs<0||
     !Array.isArray(requestDurationsMs)||
     requestDurationsMs.length!==attempts||
     requestDurationsMs.some(x=>!Number.isFinite(x)||x<0))
    throw Error('REVIEW_PERFORMANCE_METRICS_INVALID');
  const sorted=[...requestDurationsMs].sort((a,b)=>a-b);
  const aggregate=Object.freeze({
    schema:'reviewer_b_safe_performance_v1',
    mode,
    original_parts:originalParts,
    attempts,
    completed_parts:completedParts,
    transport_fallbacks:transportFallbacks,
    output_fallbacks:outputFallbacks,
    duplicate_fallbacks:duplicateFallbacks,
    wall_seconds:secs(wallMs),
    model_seconds:secs(sorted.reduce((a,b)=>a+b,0)),
    p50_request_seconds:secs(percentile(sorted,0.5)),
    p95_request_seconds:secs(percentile(sorted,0.95)),
    max_request_seconds:secs(sorted[sorted.length-1]||0),
  });
  return aggregate;
}

/** Strict output whitelist; a forged object cannot inject private strings. */
export function formatSafeReviewPerformance(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).length!==KEYS.length||
     KEYS.some(k=>!Object.hasOwn(value,k)))return null;
  if(value.schema!=='reviewer_b_safe_performance_v1'||
     !['DEEP','QUICK'].includes(value.mode)||
     KEYS.slice(2).some(k=>!isCount(value[k],
       k.includes('seconds')?MAX_SECONDS:128)))return null;
  const out=Object.fromEntries(KEYS.map(k=>[k,value[k]]));
  return 'REVIEWER_B_PERF_V1 '+JSON.stringify(out);
}
