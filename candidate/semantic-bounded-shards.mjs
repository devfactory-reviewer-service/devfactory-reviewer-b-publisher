/**
 * Complete bounded semantic review of a GitHub-authenticated PRIVATE diff.
 *
 * Splits each validated hunk into standalone, strictly valid small Git diff
 * fragments, preserving every original change and NEW-side line number.
 * Every fragment must complete real LOCAL inference or the whole run fails.
 * No external model API, report publication or approval authority here.
 */
import {createHash} from 'node:crypto';
import {inspect} from 'node:util';
import {performance} from 'node:perf_hooks';
import {summarizeSafeReviewPerformance} from './review-performance.mjs';
import {canonicalJson} from '../src/canonical.mjs';
import {deriveAddedLinesFromDiff} from './diff-added-lines.mjs';
import {deriveRemovedLinesFromDiff} from './diff-removed-lines.mjs';
import {prepareBoundedSemanticReview} from './semantic-review-request.mjs';
import {prepareOfflineOllamaCandidate} from './ollama-offline-contract.mjs';
import {makeBoundedDiffDeclarationIndex} from './semantic-diff-declarations.mjs';
import {executeLocalOllamaReview} from './local-ollama-executor.mjs';

const REPO='deenkids7-dev/deenkids',MODEL='qwen2.5-coder:7b';
const sha=x=>createHash('sha256').update(x).digest('hex');
const HUNK=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n$/;
function deny(code){throw Error(code);}
function lines(s){return s.match(/[^\n]*\n|[^\n]+$/g)||[];}
// Object.keys() hoists integer-like filenames ahead of insertion order.
// Compare anchor membership only; exact Git diff FILE ORDER is separately
// checked against starts[] below, so reordering private source still fails.
function keysEqual(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
 const expected=new Set(b);
 return expected.size===b.length&&new Set(a).size===a.length&&
   a.every(x=>expected.has(x));
}
function snapFor(plan,bytes){
 const s=plan.exactScope;
 return {repository:REPO,repository_id:1282086207,pr_number:s.prNumber,
  head_sha:s.headSha,base_sha:s.baseSha,diff_sha256:sha(bytes)};
}
function makeShard(plan,text,path,sourceIndex){
 const bytes=Buffer.from(text,'utf8');
 if(bytes.length>3072||bytes.length<16)deny('BOUNDED_SHARD_BAD_SIZE');
 const p=prepareBoundedSemanticReview({
   snapshot:snapFor(plan,bytes),rawDiffBytes:bytes
 });
 if(!keysEqual(p.changedPaths,[path]))deny('BOUNDED_SHARD_PATH_CHANGED');
 const item={path,sourceIndex,diffSha256:sha(bytes),
  byteCount:bytes.length,approvalAuthorized:false,
  independentReviewVerified:false};
 Object.defineProperties(item,{
  privateDiffBytes:{enumerable:false,configurable:false,
    get:()=>Buffer.from(bytes)},
  toJSON:{enumerable:false,configurable:false,
    value:()=>({...Object.fromEntries(Object.entries(item)),
      privateDiffBytes:'[REDACTED]'})},
  [inspect.custom]:{enumerable:false,configurable:false,
    value:()=> '[BoundedPrivateSemanticShard: REDACTED; NOT APPROVED]'}
 });
 return Object.freeze(item);
}
/** Pure shape proof. Reject CRLF and unsupported rename/binary/mode-only
 * changes rather than silently skipping any part of the original diff.
 */
export function partitionRealSemanticDiff({plan,maxChunkBytes=1536}={}){
 if(!plan||plan.exactScope?.repository!==REPO||
   !Number.isSafeInteger(plan.exactScope.prNumber)||
   !Number.isSafeInteger(maxChunkBytes)||maxChunkBytes<768||
   maxChunkBytes>3072||!Array.isArray(plan.changedPaths)||
   typeof plan.privateDiffText!=='string')
   deny('SEMANTIC_SHARD_UNTRUSTED_PLAN');
 const original=Buffer.from(plan.privateDiffText,'utf8');
 if(original.length<16||original.length>128*1024||
   sha(original)!==plan.exactScope.diffSha256||
   plan.privateDiffText.includes('\r'))
   deny('SEMANTIC_SHARD_SOURCE_INVALID');
 const anchored=deriveAddedLinesFromDiff({diffBytes:original});
 if(!keysEqual(Object.keys(anchored),plan.changedPaths))
   deny('SEMANTIC_SHARD_SCOPE_MISMATCH');
 const text=plan.privateDiffText;
 const starts=[...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)\n/gm)];
 if(starts.length!==plan.changedPaths.length||starts[0]?.index!==0)
   deny('SEMANTIC_SHARD_FILE_MISMATCH');
 const shards=[];
 let covered=0,coveredLines=0;
 for(let fileIndex=0;fileIndex<starts.length;fileIndex++){
   const start=starts[fileIndex].index;
   const end=starts[fileIndex+1]?.index??text.length;
   const file=text.slice(start,end),path=plan.changedPaths[fileIndex];
   if(starts[fileIndex][1]!==path||starts[fileIndex][2]!==path)
     deny('SEMANTIC_SHARD_FILE_MISMATCH');
   const hunkMarkers=[...file.matchAll(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@[^\n]*\n/gm)];
   if(!hunkMarkers.length)deny('SEMANTIC_SHARD_NO_HUNKS');
   const prefix=file.slice(0,hunkMarkers[0].index);
   if(Buffer.byteLength(prefix,'utf8')>1024||
     !prefix.startsWith('diff --git a/'+path+' b/'+path+'\n'))
     deny('SEMANTIC_SHARD_BAD_HEADER');
   let rebuilt=prefix;
   for(let i=0;i<hunkMarkers.length;i++){
     const marker=hunkMarkers[i],meta=marker[0].match(HUNK);
     if(!meta)deny('SEMANTIC_SHARD_BAD_HUNK');
     const oldStart=Number(meta[1]),oldLen=meta[2]===undefined?1:Number(meta[2]);
     const newStart=Number(meta[3]),newLen=meta[4]===undefined?1:Number(meta[4]);
     const bodyStart=marker.index+marker[0].length;
     const bodyEnd=hunkMarkers[i+1]?.index??file.length;
     const body=file.slice(bodyStart,bodyEnd);
     rebuilt+=marker[0]+body;
     const sourceLines=lines(body);
     const units=[];
     for(const part of sourceLines){
       if(part.startsWith('\\ No newline at end of file')){
         if(!units.length)deny('SEMANTIC_SHARD_ORPHAN_MARKER');
         units[units.length-1]+=part;
       }else if(/^[ +\-]/.test(part)){
         units.push(part);
       }else if(part==='\n'&&sourceLines.at(-1)===part){
         // Git hunk body may have a trailing blank separator; this never
         // contributes source coverage and is not passed to a model.
       }else{
         deny('SEMANTIC_SHARD_BAD_SOURCE_LINE');
       }
     }
     if(!units.length)deny('SEMANTIC_SHARD_EMPTY_HUNK');
     let consumedOld=0,consumedNew=0,chunkLines=[],blockOld=0,blockNew=0,chunkBytes=0;
     const maxData=maxChunkBytes-Buffer.byteLength(prefix,'utf8')-64;
     function flush(){
       if(!chunkLines.length)return;
       const header='@@ -'+(oldStart+consumedOld-blockOld)+','+blockOld+
         ' +'+(newStart+consumedNew-blockNew)+','+blockNew+' @@\n';
       const fragment=prefix+header+chunkLines.join('');
       if(Buffer.byteLength(fragment,'utf8')>maxChunkBytes)
         deny('SEMANTIC_SHARD_CHUNK_TOO_LARGE');
       shards.push(makeShard(plan,fragment,path,fileIndex));
       chunkLines=[];blockOld=0;blockNew=0;chunkBytes=0;
     }
     for(const unit of units){
       const size=Buffer.byteLength(unit,'utf8');
       if(size>maxData)deny('SEMANTIC_SHARD_LINE_TOO_LARGE');
       if(chunkLines.length &&
          chunkBytes+size>maxData)
          flush();
       chunkLines.push(unit);
       chunkBytes+=size;
       const c=unit[0];
       if(c!=='+' ) {blockOld++;consumedOld++;}
       if(c!=='-' ) {blockNew++;consumedNew++;}
       coveredLines++;
       if(shards.length>96)deny('SEMANTIC_SHARD_TOO_MANY');
     }
     flush();
     if(consumedOld!==oldLen||consumedNew!==newLen)
       deny('SEMANTIC_SHARD_LENGTH_MISMATCH');
   }
   if(rebuilt!==file)deny('SEMANTIC_SHARD_LOSSY_RECONSTRUCTION');
   covered+=Buffer.byteLength(rebuilt,'utf8');
 }
 if(shards.length>96)deny('SEMANTIC_SHARD_TOO_MANY');
 if(covered!==original.length||!shards.length||coveredLines===0)
   deny('SEMANTIC_SHARD_LOSSY_RECONSTRUCTION');
 // Validate BOTH original/new line coordinates for every fragment before
 // launching a local Qwen request. Deleted-only chunks now remain reviewable.
 for(const shard of shards)
   deriveRemovedLinesFromDiff({diffBytes:shard.privateDiffBytes});
 const safe={originalDiffSha256:sha(original),
  originalByteCount:original.length,shardCount:shards.length,
  changedFileCount:starts.length,sourceLineCount:coveredLines,
  rawByteCoverageProven:true,inferenceExecuted:false,
  approvalAuthorized:false,independentReviewVerified:false,
  shards:Object.freeze(shards)};
 Object.defineProperties(safe,{
  toJSON:{enumerable:false,configurable:false,
    value:()=>({...Object.fromEntries(Object.entries(safe)),
      shards:shards.map(x=>x.toJSON())})},
  [inspect.custom]:{enumerable:false,configurable:false,
    value:()=> '[RealSemanticDiffPartitions: PRIVATE BYTES REDACTED]'}
 });
 return Object.freeze(safe);
}
/**
 * QUICK is a conservative performance optimization, not fewer checks:
 * identical authenticated PRIVATE bytes and full added-line coverage, with
 * fewer calls to the SAME local Qwen 7B model. All request/context/schema
 * checks are pre-proven before first inference; otherwise use existing DEEP.
 *
 * The classifier reads verified paths only. It does not parse or obey PR
 * instructions, touch network/cloud, mint merge approval, or bypass CI.
 * Sensitive runtime/security/permissions/release changes remain DEEP.
 */
const SENSITIVE_REVIEW_PATH=/(?:^\.github\/|^devfactory\/(?:autonomy\/(?:lib\/|scripts\/)|lib\/(?:quality-autonomy\/|merge|ciRun|failure-prevention\/))|(?:^|\/)(?:auth|security|secret|secrets|permission|permissions|payment|payments|billing|pricing|migration|migrations|infra|deploy|release)(?:\/|[._-]|$)|\.(?:ps1|sql|ya?ml)$)/i;

/**
 * R87: PERF ONLY on the protected CPU runner. Select the smallest number
 * of fully authenticated, context-preflighted chunks for DEEP changes.
 * Nothing is omitted: the 1,536 B plan is the immutable baseline; each
 * candidate is independently reconstructed from the FULL exact diff.
 * A candidate chunk exceeding context is itself fully verified and
 * subdivided, not skipped or accepted with truncated model input.
 *
 * The caller still invokes local Qwen sequentially for EVERY resulting
 * shard and requires every completion. No remote model, persisted private
 * data, weakened review or partial native comment.
 */
export function optimizeProtectedDeepPartitions({plan,maxOutputTokens=1024}={}){
 let original;
 try{original=partitionRealSemanticDiff({plan,maxChunkBytes:1536});}
 catch(error){
   // A large but valid diff can exceed the 96-shard SMALL-chunk cap.
   // NEVER discard source: search a larger fully reconstructed partition
   // whose every request is independently context-checked before inference.
   if(error?.message!=='SEMANTIC_SHARD_TOO_MANY')throw error;
   original=null;
 }
 const declarations=makeBoundedDiffDeclarationIndex({plan});
 const scope=original?.originalDiffSha256 ?? plan?.exactScope?.diffSha256;
 function preflight(part){
   const bytes=part.privateDiffBytes;
   const chunkPlan=prepareBoundedSemanticReview({
     snapshot:snapFor(plan,bytes),rawDiffBytes:bytes
   });
   prepareOfflineOllamaCandidate({
     plan:chunkPlan,model:MODEL,maxOutputTokens,
     protectedEphemeralKeepAlive:true,
     trustedDeclarationIndex:declarations,
     trustedOriginalDiffSha256:scope
   });
 }
 // An old plan that cannot pass its own public request budget must not
 // be silently presented as a validated faster plan.
 if(original)for(const part of original.shards)preflight(part);
 let best=original;
 for(const cap of [3072,2560,2304,2048,1792]){
   let candidate;
   try{candidate=partitionRealSemanticDiff({plan,maxChunkBytes:cap});}
   catch(error){
     if(error?.message==='SEMANTIC_SHARD_LINE_TOO_LARGE'||
        (original===null&&error?.message==='SEMANTIC_SHARD_TOO_MANY'))continue;
     throw error;
   }
   if(best&&candidate.shardCount>=best.shardCount)continue;
   const selected=[];
   let possible=true;
   for(const part of candidate.shards){
     try{
       preflight(part);
       selected.push(part);
     }catch(error){
       if(error?.message!=='OLLAMA_CONTEXT_CAPACITY_UNVERIFIED')
         throw error;
       const bytes=part.privateDiffBytes;
       const chunkPlan=prepareBoundedSemanticReview({
         snapshot:snapFor(plan,bytes),rawDiffBytes:bytes
       });
       let smaller;
       try{smaller=partitionRealSemanticDiff({
         plan:chunkPlan,maxChunkBytes:1536
       });}catch{possible=false;break;}
       if(smaller.originalDiffSha256!==part.diffSha256||
          smaller.originalByteCount!==bytes.length||
          smaller.shardCount<2||smaller.shardCount>8||
          smaller.shards.some(v=>v.path!==part.path)) {
         possible=false;break;
       }
       try{for(const child of smaller.shards)preflight(child);}
       catch{possible=false;break;}
       selected.push(...smaller.shards);
     }
     if(selected.length>96||(best&&selected.length>=best.shardCount)){
       possible=false;break;
     }
   }
   if(!possible||selected.length>96||
      (best&&selected.length>=best.shardCount))
     continue;
   // Both levels were full-source reconstructed. The parent source order
   // is preserved and every child is an exact, full coverage subdivision.
   const safe={...candidate,shardCount:selected.length,
     shards:Object.freeze(selected),optimizedFromDeep:true,
     rawByteCoverageProven:true,inferenceExecuted:false,
     independentReviewVerified:false,approvalAuthorized:false};
   Object.defineProperties(safe,{
     toJSON:{enumerable:false,configurable:false,value:()=>({
       ...Object.fromEntries(Object.entries(safe)),
       shards:selected.map(v=>v.toJSON())
     })},
     [inspect.custom]:{enumerable:false,configurable:false,
       value:()=> '[OptimizedPrivateDeepShards: REDACTED; NOT APPROVED]'}
   });
   best=Object.freeze(safe);
 }
 if(!best)deny('SEMANTIC_SHARD_TOO_MANY');
 return best;
}

export function planAdaptiveSemanticShards({plan,maxOutputTokens=1024}={}){
 let deep;
 try{deep=partitionRealSemanticDiff({plan,maxChunkBytes:1536});}
 catch(error){
   if(error?.message!=='SEMANTIC_SHARD_TOO_MANY')throw error;
   const complete=optimizeProtectedDeepPartitions({plan,maxOutputTokens});
   return Object.freeze({mode:'DEEP',geminiAdvisoryRecommended:true,
     partitions:complete,reason:'OVERSHARD_EXACT_FULL_COVERAGE'});
 }
 const paths=plan.changedPaths;
 const small=deep.originalByteCount<=12288 && paths.length<=4;
 const sensitive=paths.some(p=>SENSITIVE_REVIEW_PATH.test(p));
 if(!small||sensitive){
   const optimized=optimizeProtectedDeepPartitions({plan,maxOutputTokens});
   return Object.freeze({
     mode:'DEEP',geminiAdvisoryRecommended:sensitive,
     partitions:optimized,reason:sensitive?'SENSITIVE_CHANGE':'LARGE_OR_MANY_FILES'
   });
 }
 // Never attempt to fit a model shard optimistically; preconstruct the same
 // strict LOCAL request that executeLocalOllamaReview will require. A context
 // overflow falls back BEFORE inference. Unexpected validation errors still
 // fail closed rather than turning into a soft review.
 for(const cap of [3072,2304]){
  let parts;
  try{parts=partitionRealSemanticDiff({plan,maxChunkBytes:cap});}
  catch(e){
    if(e?.message==='SEMANTIC_SHARD_LINE_TOO_LARGE')continue;
    throw e;
  }
  if(parts.shardCount>=deep.shardCount)continue;
  let contextFits=true;
  for(const shard of parts.shards){
    const bytes=shard.privateDiffBytes;
    const single=prepareBoundedSemanticReview({
      snapshot:snapFor(plan,bytes),rawDiffBytes:bytes
    });
    try{
      prepareOfflineOllamaCandidate({
        plan:single,model:MODEL,maxOutputTokens,
        protectedEphemeralKeepAlive:true
      });
    }catch(e){
      if(e?.message==='OLLAMA_CONTEXT_CAPACITY_UNVERIFIED'){
        contextFits=false;break;
      }
      throw e;
    }
  }
  if(contextFits)return Object.freeze({
    mode:'QUICK',geminiAdvisoryRecommended:false,
    partitions:parts,reason:'BOUNDED_CONTEXT_PROVEN'
  });
 }
 return Object.freeze({
  mode:'DEEP',geminiAdvisoryRecommended:false,
  partitions:deep,reason:'CONTEXT_OR_SIZE_FALLBACK'
 });
}

/** Every shard is re-bound to the exact PR and its original private SHA.
 * No incomplete/model-error path yields a result. Global disposition is
 * provisional; model findings are NOT merge authority.
 */
export async function executeCompleteLocalSemanticReview({plan,runId,
  fetchImpl=globalThis.fetch,model=MODEL,maxOutputTokens=1024
}={}){
 if(model!==MODEL||typeof runId!=='string'||typeof fetchImpl!=='function')
   deny('SEMANTIC_BATCH_INPUT_INVALID');
 const reviewStarted=performance.now();
 const routing=planAdaptiveSemanticShards({plan,maxOutputTokens});
 const parts=routing.partitions;
 const original=Buffer.from(plan.privateDiffText,'utf8');
 if(parts.originalDiffSha256!==sha(original))
   deny('SEMANTIC_BATCH_ORIGINAL_DRIFT');
 // Trusted lexical names from the entire immutable PR diff accompany each
 // fragment; no unchanged source, remote model or new GitHub permission.
 const trustedDeclarationIndex=makeBoundedDiffDeclarationIndex({plan});
 const findings=[],responses=[],seen=new Set();
 let modelCalls=0,attempts=0,transportFallbacks=0,outputFallbacks=0,duplicateFallbacks=0;
 const MAX_TRANSPORT_RECOVERIES=3;
 const MAX_TRANSPORT_SPLIT_DEPTH=2;
 const requestDurationsMs=[];
 let coveredOriginalParts=0;
 // Each protected diff part must complete. Length exhaustion can occur on
 // MULTIPLE independent parts, so a single global fallback is insufficient.
 // Bound the entire job and never publish/aggregate a truncated response.
 async function reviewChunk(chunk,allowSplit,tokenBudget=maxOutputTokens,transportDepth=0){
   const bytes=chunk.privateDiffBytes;
   const chunkPlan=prepareBoundedSemanticReview({
     snapshot:snapFor(plan,bytes),rawDiffBytes:bytes});
   if(++attempts>128)deny('SEMANTIC_BATCH_ATTEMPT_LIMIT');
   let result;
   try{
     const start=performance.now();
     try{
       result=await executeLocalOllamaReview({
         plan:chunkPlan,trustedDiffBytes:bytes,runId,
         model,approvedLocalPrivateProcessing:true,
         protectedEphemeralKeepAlive:true,
         fetchImpl,maxOutputTokens:tokenBudget,
         trustedDeclarationIndex,
         trustedOriginalDiffSha256:parts.originalDiffSha256
       });
     }finally{
       // Timings only, no request bytes, path, model response or error string.
       requestDurationsMs.push(performance.now()-start);
     }
   }catch(error){
     const code=error?.message;
     if(code==='OLLAMA_FINDING_DUPLICATE'&&allowSplit){
       // Reject the ambiguous completion in full. Re-run the ENTIRE exact
       // authenticated shard as strictly smaller, fully covered fragments.
       // No finding is dropped, no partial response is published, and a
       // persistent duplicate on a child remains a hard failure.
       if(duplicateFallbacks>=8)throw error;
       let smaller;
       try{smaller=partitionRealSemanticDiff({
         plan:chunkPlan,maxChunkBytes:768});}
       catch{throw error;}
       if(smaller.originalDiffSha256!==sha(bytes)||
          smaller.originalByteCount!==bytes.length||
          smaller.shardCount<2||smaller.shardCount>10||
          smaller.shards.some(x=>x.byteCount>=bytes.length))
         throw error;
       duplicateFallbacks++;
       for(const part of smaller.shards)
         await reviewChunk(part,false,tokenBudget);
       return;
     }
     if(code==='OLLAMA_OUTPUT_TRUNCATED'&&allowSplit){
       // The only accepted signal is a validated local Ollama length stop.
       // Never reuse partial JSON. Review the COMPLETE original shard as
       // smaller authenticated diff parts with twice the output allowance.
       // Permit separate affected shards, but cap recoveries for the run.
       if(outputFallbacks>=16)throw error;
       outputFallbacks++;
       let smaller;
       try{smaller=partitionRealSemanticDiff({
         plan:chunkPlan,maxChunkBytes:768});}
       catch{smaller=null;}
       const splitProven=smaller&&
         smaller.originalDiffSha256===sha(bytes)&&
         smaller.originalByteCount===bytes.length&&
         smaller.shardCount>=2&&smaller.shardCount<=10&&
         smaller.shards.every(x=>x.byteCount<bytes.length);
       if(splitProven){
         for(const part of smaller.shards)
           await reviewChunk(part,false,Math.max(tokenBudget,2048));
         return;
       }
       // A valid very small shard cannot be subdivided. One bounded
       // higher-token attempt is allowed, never the same unchanged request.
       if(tokenBudget<2048){
         await reviewChunk(chunk,false,2048);
         return;
       }
       throw error;
     }
     // Allow only bounded, provably smaller exact-diff reanalysis for known
     // local transport failures. Never accept a partial response. Invalid
     // schema/model/drift errors remain nonretryable.
     if(transportFallbacks>=MAX_TRANSPORT_RECOVERIES||
        transportDepth>=MAX_TRANSPORT_SPLIT_DEPTH||
        !['LOCAL_MODEL_REQUEST_FAILED','LOCAL_MODEL_REQUEST_TIMEOUT',
          'LOCAL_MODEL_TRANSPORT_INTERRUPTED'].includes(code))throw error;
     let smaller;
     try{smaller=partitionRealSemanticDiff({
       plan:chunkPlan,maxChunkBytes:768});}
     catch{throw error;}
     if(smaller.originalDiffSha256!==sha(bytes)||
        smaller.originalByteCount!==bytes.length||
        smaller.shardCount<2||smaller.shardCount>10||
        smaller.shards.some(x=>x.byteCount>=bytes.length))
       throw error;
     transportFallbacks++;
     for(const part of smaller.shards)
       await reviewChunk(part,false,tokenBudget,transportDepth+1);
     return;
   }
   if(result.localModelExecuted!==true||
      result.approvalAuthorized!==false||
      result.independentReviewVerified!==false)
     deny('SEMANTIC_BATCH_LOCAL_NOT_VERIFIED');
   const report=JSON.parse(result.privateCanonicalReportBytes.toString('utf8'));
   if(report.run_id!==runId||!Array.isArray(report.findings)||
      report.findings.length!==result.findingCount)
     deny('SEMANTIC_BATCH_INVALID_REPORT');
   for(const f of report.findings){
     if(!f||typeof f!=='object'||Array.isArray(f)||
       typeof f.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(f.fingerprint))
       deny('SEMANTIC_BATCH_INVALID_REPORT');
     if(seen.has(f.fingerprint))deny('SEMANTIC_BATCH_DUPLICATE_FINDING');
     seen.add(f.fingerprint);
     findings.push(f);
   }
   responses.push(chunk.diffSha256+':'+result.localResponseSha256);
   modelCalls++;
 }
 for(const chunk of parts.shards){
   await reviewChunk(chunk,true);
   coveredOriginalParts++;
 }
 if(coveredOriginalParts!==parts.shardCount||modelCalls<parts.shardCount||
    attempts>128||transportFallbacks>MAX_TRANSPORT_RECOVERIES||outputFallbacks>16||
    duplicateFallbacks>8)
   deny('SEMANTIC_BATCH_INCOMPLETE');
 // Non-authorizing diagnostics MUST NOT make a valid PRIVATE review
 // fail or prevent a complete canonical report from being published.
 let safePerformance=null;
 try{
   safePerformance=summarizeSafeReviewPerformance({
     mode:routing.mode,originalParts:parts.shardCount,attempts,
     completedParts:modelCalls,transportFallbacks,outputFallbacks,
     duplicateFallbacks,wallMs:performance.now()-reviewStarted,
     requestDurationsMs,
   });
 }catch{
   // No telemetry is safer than falsely rejecting real reviewed source.
 }
 const complete=Buffer.from(canonicalJson({
   schema:'devfactory.reviewer-b.findings.v1',
   run_id:runId,
   summary:'Full immutable PRIVATE diff was processed in '+
     parts.shardCount+' bounded local Qwen parts; model context per part '+
     'is incomplete relative to the full repository, so findings remain provisional.',
   findings
 }),'utf8');
 const result={
   model,localModelExecuted:true,localResponseSha256:sha(responses.join('\n')),
   provisionalState:findings.some(f=>['critical','high'].includes(f.severity))
     ?'FAIL':'INCONCLUSIVE',
   findingCount:findings.length,processedShardCount:modelCalls,
   reviewMode:routing.mode,
   geminiAdvisoryRecommended:routing.geminiAdvisoryRecommended,
   originalDiffSha256:parts.originalDiffSha256,
   rawByteCoverageProven:true,modelContextCompletenessVerified:false,
   independentReviewVerified:false,approvalAuthorized:false,publishEvent:null
 };
 Object.defineProperties(result,{
  safePerformance:{enumerable:false,configurable:false,value:safePerformance},
  privateCanonicalReportBytes:{enumerable:false,configurable:false,
    get:()=>Buffer.from(complete)},
  toJSON:{enumerable:false,configurable:false,
    value:()=>({...Object.fromEntries(Object.entries(result)),
      privateCanonicalReportBytes:'[REDACTED]'})},
  [inspect.custom]:{enumerable:false,configurable:false,
    value:()=> '[CompleteLocalSemanticReview: PRIVATE REPORT REDACTED; NOT APPROVED]'}
 });
 return Object.freeze(result);
}
