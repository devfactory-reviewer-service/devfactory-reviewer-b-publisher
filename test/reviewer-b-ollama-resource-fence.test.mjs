import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=readFileSync(new URL('../.github/workflows/reviewer-b-private-semantic.yml',
 import.meta.url),'utf8');
test('protected PRIVATE Qwen stays single-model and bounded on ephemeral runner',()=>{
 for(const [key,value] of [
  ['OLLAMA_NUM_PARALLEL','1'],['OLLAMA_MAX_LOADED_MODELS','1'],
  ['OLLAMA_FLASH_ATTENTION','1'],['OLLAMA_KV_CACHE_TYPE','q8_0']
 ])assert.ok(f.includes(key+": '"+value+"'"),key);
 assert.match(f,/MODEL: 'qwen2\.5-coder:7b'/);
 assert.match(f,/environment: reviewer-b-publish/);
 assert.match(f,/permissions: \{\}/);
 assert.match(f,/timeout-minutes: 180/);
 assert.match(f,/node scripts\/protected-real-semantic-review\.mjs/);
});
test('error diagnostics print only bounded OS health, not model/private content',()=>{
 const i=f.indexOf('      - name: Sanitized local model failure diagnostics');
 assert.ok(i>0);
 const section=f.slice(i);
 assert.ok(section.includes('if: '+String.fromCharCode(36)+'{{ failure() }}'));
 assert.match(section,/api\/tags.*> \/dev\/null 2>&1/);
 assert.match(section,/memory\.events/);
 assert.match(section,/\/proc\/meminfo/);
 assert.doesNotMatch(section,/ollama-service\.log|cat .*log|set -x|\/api\/chat/);
});
