/**
 * Deterministic synthetic-only comparison for protected QUICK/DEEP planning.
 * No private repository or Ollama access, no model/latency claims.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareBoundedSemanticReview} from '../candidate/semantic-review-request.mjs';
import {partitionRealSemanticDiff,planAdaptiveSemanticShards}
 from '../candidate/semantic-bounded-shards.mjs';
import {deriveAddedLinesFromDiff} from '../candidate/diff-added-lines.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');

function fixture({files,lines,sensitive=false}){
 const all=[];
 for(let k=0;k<files;k++){
  const path=sensitive&&k===0
   ?'devfactory/autonomy/lib/synthetic-critical-guard.mjs'
   :'src/synthetic-'+k+'.mjs';
  const added=Array.from({length:lines},(_,i)=>
    '+const synthetic_'+i+' = 1234567890123456789012345;\n').join('');
  all.push('diff --git a/'+path+' b/'+path+'\n'+
    'index 1234567..abcdef0 100644\n--- a/'+path+
    '\n+++ b/'+path+'\n@@ -1 +1,'+(lines+1)+' @@\n old line\n'+added);
 }
 const bytes=Buffer.from(all.join(''),'utf8');
 return prepareBoundedSemanticReview({
  snapshot:{repository:'deenkids7-dev/deenkids',
    repository_id:1282086207,pr_number:899,head_sha:'a'.repeat(40),
    base_sha:'b'.repeat(40),diff_sha256:sha(bytes)},
  rawDiffBytes:bytes
 });
}
function coverage(partitions,plan){
 const observed={};
 for(const shard of partitions.shards){
  const added=deriveAddedLinesFromDiff({diffBytes:shard.privateDiffBytes});
  for(const [path,lines] of Object.entries(added))
   (observed[path]??=[]).push(...lines);
 }
 const expected=deriveAddedLinesFromDiff({
  diffBytes:Buffer.from(plan.privateDiffText)});
 return Object.keys(observed).length===Object.keys(expected).length&&
  Object.keys(expected).every(k=>JSON.stringify(observed[k])===
   JSON.stringify(expected[k]));
}
for(const f of [
 {label:'small',files:1,lines:12,sensitive:false},
 {label:'medium',files:3,lines:45,sensitive:false},
 {label:'sensitive',files:3,lines:45,sensitive:true},
 {label:'many_files',files:6,lines:65,sensitive:false}
]){
 const p=fixture(f);
 const baseline=partitionRealSemanticDiff({plan:p,maxChunkBytes:1536});
 const chosen=planAdaptiveSemanticShards({plan:p}).partitions;
 assert.equal(chosen.rawByteCoverageProven,true);
 assert.equal(chosen.originalDiffSha256,baseline.originalDiffSha256);
 assert.equal(chosen.originalByteCount,baseline.originalByteCount);
 assert.ok(chosen.shardCount<=baseline.shardCount);
 assert.equal(coverage(chosen,p),true);
 const publicOnly={
  fixture:f.label,
  baseline_shards:baseline.shardCount,
  planned_shards:chosen.shardCount,
  full_coverage:true,
  inference_benchmark:false
 };
 console.log('SYNTHETIC_SHARD_PLAN '+JSON.stringify(publicOnly));
}
