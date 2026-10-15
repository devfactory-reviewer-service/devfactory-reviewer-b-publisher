import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSafeReviewPerformance,summarizeSafeReviewPerformance}
 from '../candidate/review-performance.mjs';

const valid={
  mode:'DEEP',originalParts:2,attempts:3,completedParts:2,
  transportFallbacks:1,outputFallbacks:0,duplicateFallbacks:0,
  wallMs:4800,requestDurationsMs:[1000,1500,2200]
};
test('quantized review timings contain only whitelisted aggregate numerics',()=>{
  const safe=summarizeSafeReviewPerformance(valid);
  assert.equal(safe.wall_seconds,5);
  assert.equal(safe.model_seconds,5);
  assert.equal(safe.p50_request_seconds,2);
  assert.equal(safe.p95_request_seconds,2);
  assert.equal(safe.transport_fallbacks,1);
  const line=formatSafeReviewPerformance(safe);
  assert.match(line,/^REVIEWER_B_PERF_V1 \{/);
  const payload=JSON.parse(line.slice('REVIEWER_B_PERF_V1 '.length));
  assert.deepEqual(payload,safe);
  assert.ok(Object.isFrozen(safe));
  assert.doesNotMatch(line,/src\/|private|token|prompt|diff|sha|\.mjs/i);
});
test('legitimate reviews longer than 3h never fail due to optional telemetry',()=>{
 const safe=summarizeSafeReviewPerformance({...valid,
   wallMs:5*60*60*1000,
   requestDurationsMs:[4*60*60*1000,1500,2200]});
 assert.equal(safe.wall_seconds,10800);
 assert.equal(safe.max_request_seconds,10800);
 assert.ok(formatSafeReviewPerformance(safe)?.startsWith('REVIEWER_B_PERF_V1 '));
});
test('malformed or potentially private-shaped telemetry never gets logged',()=>{
  const safe=summarizeSafeReviewPerformance(valid);
  assert.equal(formatSafeReviewPerformance({...safe,privateDiff:'TOP SECRET'}),null);
  assert.equal(formatSafeReviewPerformance({...safe,mode:'private-secret'}),null);
  assert.equal(formatSafeReviewPerformance({...safe,wall_seconds:'40\nTOP SECRET'}),null);
  assert.equal(formatSafeReviewPerformance(Object.assign(Object.create(null),safe)),formatSafeReviewPerformance(safe));
  assert.throws(()=>summarizeSafeReviewPerformance({...valid,requestDurationsMs:[123]}),/REVIEW_PERFORMANCE_METRICS_INVALID/);
  assert.throws(()=>summarizeSafeReviewPerformance({...valid,attempts:129}),/REVIEW_PERFORMANCE_METRICS_INVALID/);
  assert.throws(()=>summarizeSafeReviewPerformance({...valid,wallMs:Infinity}),/REVIEW_PERFORMANCE_METRICS_INVALID/);
});
