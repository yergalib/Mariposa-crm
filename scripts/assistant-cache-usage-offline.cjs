// One targeted offline regression: real provider/usage code, scripted transport
// and an in-memory reservation seam. No env, credentials, database or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let result, active = false, attempts = 0, releases = 0, sends = 0;
class AssistantError extends Error { constructor(message, status) { super(message); this.status = status; } }
class ScriptedOpenAI {
  responses = { create: async () => { sends++; return structuredClone(result); } };
}
function load(file) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const requireIsolated = (name) => {
    if (name === 'server-only') return {};
    if (name === 'zod') return require('zod');
    if (name === '@/lib/tenant/pilot-preview') return { PILOT_ORGANIZATION_ID: 'synthetic' };
    if (name === '../history/contracts') return { HISTORY_OPEN: false };
    if (name === '@/lib/showroom/release') return { PUBLIC_INQUIRY_INTAKE_OPEN: false };
    if (name === './limits') return { AssistantError };
    if (name === './owner-test') return { ...load('lib/assistant/chat/owner-test.ts'), ownerTestConfig: () => ({}) };
    if (name === './owner-test-request') return load('lib/assistant/chat/owner-test-request.ts');
    if (name === 'openai') return ScriptedOpenAI;
    if (name === './provider-budget') return { reserveProviderCall: async () => {
      if (active) throw new AssistantError('Outstanding reservation', 429);
      active = true; attempts++;
      return async () => { active = false; releases++; };
    } };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    Buffer, Date, process: { env: {} },
  })(requireIsolated, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { OWNER_TEST } = load('lib/assistant/chat/owner-test.ts');
const body = {
  model: 'gpt-6-luna', store: false, service_tier: 'default',
  reasoning: { effort: 'none', mode: 'standard' }, parallel_tool_calls: false,
  tools: [], max_output_tokens: 1400, input: 'synthetic',
  text: { format: { type: 'json_schema', name: 'consultant_reply', strict: true, schema: {} } },
};
const good = () => ({
  status: 'completed', model: 'gpt-6-luna', service_tier: 'default', output: [], output_text: '',
  usage: { input_tokens: 15000, output_tokens: 10, total_tokens: 15010,
    input_tokens_details: { cached_tokens: 12000, cache_write_tokens: 3000 },
    output_tokens_details: { reasoning_tokens: 0 } },
});
const send = () => load('lib/assistant/chat/provider.ts').openAIProvider({
  organizationId: 'synthetic', membershipId: 'synthetic',
}).create(body, new AbortController().signal);
(async () => {
  let accepted = 0, rejected = 0;
  // Documented full write, mixed read/write, ordinary remainder and cap boundary.
  for (const [input, cached, written] of [[12000,0,12000],[15000,12000,3000],[15000,10000,3000],[100,0,0],[64000,0,64000]]) {
    active = false; result = good();
    result.usage.input_tokens = input; result.usage.total_tokens = input + 10;
    result.usage.input_tokens_details = { cached_tokens: cached, cache_write_tokens: written };
    const before = releases;
    assert.equal((await send()).outputTokens, 10);
    assert.equal(releases, before + 1); assert.equal(active, false); accepted++;
  }
  const invalid = [];
  for (const value of [undefined,null,-1,0.5,'3000',NaN,Infinity,15001]) {
    const r = good(); r.usage.input_tokens_details.cache_write_tokens = value; invalid.push(r);
  }
  for (const details of [{cached_tokens:12001,cache_write_tokens:3000},{cache_write_tokens:0},null]) {
    const r = good(); r.usage.input_tokens_details = details; invalid.push(r);
  }
  invalid.push({...good(), usage:null}, {...good(), model:'other'}, {...good(), service_tier:'fast'});
  const wrongTotal = good(); wrongTotal.usage.total_tokens += 3000; invalid.push(wrongTotal);
  const overCap = good(); overCap.usage.input_tokens = 64001; overCap.usage.total_tokens = 64011; invalid.push(overCap);
  for (const bad of invalid) {
    active = false; result = bad;
    const before = { releases, sends, attempts };
    await assert.rejects(send, e => e.status === 502);
    assert.equal(releases, before.releases); assert.equal(active, true);
    // A fresh provider instance still cannot send while reservation is unresolved.
    result = good(); await assert.rejects(send, e => e.status === 429);
    assert.equal(sends, before.sends + 1); assert.equal(attempts, before.attempts + 1); rejected++;
  }
  assert.equal(OWNER_TEST.calls, 160); assert.equal(OWNER_TEST.budgetNano, 1600000000);
  assert.equal(OWNER_TEST.reservationNano, 9570000);
  assert.equal(OWNER_TEST.calls * OWNER_TEST.reservationNano / 1e9, 1.5312);
  console.log(JSON.stringify({status:'PASS',accepted,rejected,modelCalls:0,networkCalls:0,
    reservationUsd:0.00957,totalReservationUsd:1.5312,budgetUsd:1.60,calls:160}));
})().catch(error => { console.error(error); process.exitCode = 1; });
