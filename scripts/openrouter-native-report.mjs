/**
 * Native GitHub COMMENTED body for OPENROUTER, never falsifies local Ollama.
 * Production Publisher guards and DevFactory owner policy MUST be updated
 * and separately reviewed before this advisory can become merge evidence.
 */
import {createHash} from 'node:crypto';
import {OPENROUTER_MODEL_IDS} from './openrouter-zdr-executor.mjs';

const SHA40=/^[0-9a-f]{40}$/;
const SHA64=/^[0-9a-f]{64}$/;
const deny=c=>{throw Error(c)};
const sha=b=>createHash('sha256').update(b).digest('hex');
function concise(v,max){
 if(typeof v!=='string'||!v.trim()||v.length>2000||
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))deny('OR_NATIVE_TEXT_UNSAFE');
 return v.replace(/(?:https?:\/\/|www\.)[^\s)]+/gi,'external_link_redacted')
  .replace(/[\r\n\t ]+/g,' ').trim()
  .replace(/[\[\]()!<>@]/g,'_').replace(/\x60/g,"'")
  .replace(/&/g,'and').slice(0,max);
}
export function prepareOpenRouterNativeComment({preflight,cloud,runId}={}){
 const target=preflight?.target;
 if(!target||target.repository!=='deenkids7-dev/deenkids'||
    target.repositoryId!==1282086207||
    !Number.isSafeInteger(target.prNumber)||target.prNumber<1||
    !SHA40.test(target.headSha)||!SHA40.test(target.baseSha)||
    !SHA64.test(target.diffSha256)||
    !/^gh-[1-9][0-9]{0,18}-[1-9][0-9]{0,18}$/.test(runId||'')||
    !['INCONCLUSIVE'].includes(preflight.staticDisposition)||
    preflight.blockingFindings!==0||
    preflight.approvalAuthorized!==false||
    preflight.independentReviewVerified!==false||
    preflight.publishEvent!==null)
    deny('OR_NATIVE_PREFLIGHT_NOT_PROVEN');
 if(!cloud||cloud.cloudModelExecuted!==true||
    cloud.localModelExecuted!==false||
    cloud.modelOrigin!=='OPENROUTER_THIRD_PARTY_ZDR'||
    !OPENROUTER_MODEL_IDS.includes(cloud.model)||
    cloud.fullOriginalDiffSha256!==target.diffSha256||
    cloud.rawByteCoverageProven!==true||
    cloud.approvalAuthorized!==false||
    cloud.independentReviewVerified!==false||
    cloud.mayPublishReview!==false||cloud.mayMerge!==false||
    !Number.isSafeInteger(cloud.processedShardCount)||
    cloud.processedShardCount<1||cloud.processedShardCount>96||
    !Number.isSafeInteger(cloud.findingCount)||cloud.findingCount<0||
    cloud.findingCount>128||
    !['FAIL','INCONCLUSIVE'].includes(cloud.provisionalState)||
    !SHA64.test(cloud.externalResponseSha256)||
    typeof cloud.apiCostReportedUsd!=='number'||
    !Number.isFinite(cloud.apiCostReportedUsd)||
    cloud.apiCostReportedUsd<0||cloud.apiCostReportedUsd>0.5||
    !Number.isSafeInteger(cloud.totalInputTokens)||
    !Number.isSafeInteger(cloud.totalOutputTokens)||
    typeof cloud.privateCanonicalReportBytes==='undefined')
    deny('OR_NATIVE_CLOUD_PROOF_INVALID');
 const buf=cloud.privateCanonicalReportBytes;
 if(!Buffer.isBuffer(buf)||buf.length>96*1024||buf.length<32)
    deny('OR_NATIVE_REPORT_INVALID');
 let report;
 try{report=JSON.parse(buf.toString('utf8'))}
 catch{deny('OR_NATIVE_REPORT_INVALID')}
 if(report?.schema!=='devfactory.reviewer-b.findings.v1'||
    report.run_id!==runId||
    !Array.isArray(report.findings)||
    report.findings.length!==cloud.findingCount||
    typeof report.summary!=='string')
    deny('OR_NATIVE_REPORT_INVALID');
 const shaReport=sha(buf);
 const marker=sha([target.prNumber,target.headSha,runId,shaReport,cloud.model].join(':')).slice(0,32);
 const front=[
  '<!-- devfactory-reviewer-b-openrouter-comment:v1:'+marker+' -->',
  'Reviewer B real OpenRouter ZDR Qwen analysis — COMMENT ONLY (not approved)',
  '',
  'Result: '+(cloud.provisionalState==='FAIL'?'PROVISIONAL_FINDINGS':'INCONCLUSIVE')+
   '; NO automated PASS or merge authority.',
  'Model: '+cloud.model,
  'Inference transport: THIRD_PARTY_OPENROUTER_ZDR',
  'Data handling: provider.zdr=true; data_collection=deny; allow_fallbacks=false',
  'Exact head: '+target.headSha,
  'Exact base: '+target.baseSha,
  'Private diff SHA-256: '+target.diffSha256,
  'Real cloud report SHA-256: '+shaReport,
  'Real OpenRouter response SHA-256: '+cloud.externalResponseSha256,
  'Protected run: '+runId,
  'Static blockers: 0',
  'Semantic findings: '+report.findings.length,
  'Full-diff third-party Qwen model parts completed: '+cloud.processedShardCount,
  'API provider-reported cost USD: '+cloud.apiCostReportedUsd.toFixed(6),
  'All observations are provisional; owner must accept risk separately.',
  '',
  'Model summary: '+concise(report.summary,1000),''
 ];
 const finish=['',
  'Manual verification required. External ZDR routing is not an independent',
  'human security PASS or local Qwen provenance. No HUMAN_GO, MERGE_GO or merge authorization.'];
 const severities=new Set(['critical','high','medium','low','informational']);
 for(const f of report.findings){
  if(!f||typeof f!=='object'||Array.isArray(f)||
     typeof f.path!=='string'||f.path.length>300||
     !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(f.path)||
     !Number.isSafeInteger(f.line)||f.line<1||f.line>1_000_000||
     typeof f.fingerprint!=='string'||!SHA64.test(f.fingerprint)||
     !severities.has(f.severity)||typeof f.message!=='string'||
     typeof f.evidence!=='string'||
     (f.side!==undefined&&!['OLD','NEW'].includes(f.side)))
    deny('OR_NATIVE_FINDING_INVALID');
 }
 let body='';
 // Preserve every finding; progressively shorten excerpts when GitHub's
 // COMMENT body limit would otherwise reject a complete, authenticated report.
 for(const max of [160,115,80,48,24,16,8]){
  const rows=report.findings.map((f,i)=>
   '- #'+(i+1)+' '+f.severity.toUpperCase()+' '+concise(f.path,120)+
   ':'+f.line+(f.side?' ['+f.side+']':'')+
   ' — '+concise(f.message,max)+
   ' | Evidence: '+concise(f.evidence,max));
  body=[...front,...rows,...finish].join('\n');
  if(body.length<=12000)break;
 }
 if(body.length>12000)deny('OR_NATIVE_BODY_TOO_LARGE');
 return Object.freeze({
  event:'COMMENT',body,prNumber:target.prNumber,headSha:target.headSha,
  evidenceClass:'NATIVE_OPENROUTER_ZDR_COMMENT_ONLY',
  approvalAuthorized:false,independentReviewVerified:false,
  mayMerge:false
 });
}
