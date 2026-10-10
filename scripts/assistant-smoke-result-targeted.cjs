const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), Module = require('node:module'), { EventEmitter } = require('node:events');
const { makeTransport } = require('./assistant-smoke-local.cjs');
const { createRunResult } = require('./lib/assistant-smoke-result.cjs');
global.fetch = () => { throw Error('Network forbidden'); };
for (const name of ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls']) {
  const net = require(name); for (const key of ['request', 'get', 'connect', 'createConnection']) if (typeof net[key] === 'function') net[key] = () => { throw Error('Network forbidden'); };
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mariposa-result-offline-'));
const sentinel = 'SECRET_HEADER_PROMPT_RESPONSE_EXCEPTION_NEVER_PERSIST';
const body = { model: 'gpt-6-luna', service_tier: 'default', store: false, reasoning: { effort: 'none', mode: 'standard' }, max_output_tokens: 1400, instructions: sentinel, input: [{ role: 'user', content: sentinel }], text: { format: { type: 'text' } } };
const raw = { model: 'gpt-6-luna', service_tier: 'default', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: sentinel }] }], usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
function setup(name) {
  const dir = path.join(root, name); fs.mkdirSync(dir);
  const ledger = path.join(dir, 'approval.json');
  const filename = path.resolve(__dirname, 'lib/assistant-smoke-once.cjs');
  const proc = new EventEmitter(); proc.env = {}; proc.exit = code => { proc.emit('exit', code); throw Error(sentinel); };
  const loaded = new Module(filename); loaded.filename = filename;
  loaded.require = name => name === 'test-process' ? proc : name === 'node:path' ? { ...path, resolve: (...args) => args.some(x => String(x).includes('site-assistant-smoke-state')) ? ledger : path.resolve(...args) } : name === './assistant-smoke-result.cjs' ? { createRunResult } : require(name);
  loaded._compile("const process=require('test-process');\n" + fs.readFileSync(filename, 'utf8'), filename);
  return { harness: loaded.exports, ledger, result: ledger.replace('.json', '.result.json'), proc, dir };
}
(async () => {
  for (const mode of ['success', 'partial_usage', 'before_send', 'after_send', 'http_error', 'abort', 'unverified_usage']) {
    const test = setup(mode); let calls = 0; const controller = new AbortController();
    const request = (_options, callback) => {
      calls++; const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => req.emit('error', Error(sentinel));
      req.end = () => queueMicrotask(() => {
        if (mode === 'after_send' || mode === 'abort' || mode === 'partial_usage' && calls === 2) { if (mode === 'abort') controller.abort(); req.emit('error', Error(sentinel)); return; }
        const res = new EventEmitter(); res.statusCode = mode === 'http_error' ? 429 : 200; callback(res);
        const response = structuredClone(raw); if (mode === 'unverified_usage') delete response.usage;
        res.emit('data', Buffer.from(JSON.stringify(response))); res.emit('end');
      }); return req;
    };
    const execute = () => test.harness.runUserLocalSmoke(async report => {
      report.stage('KEY_FORMAT'); if (mode === 'before_send') throw Error(sentinel);
      return makeTransport(Buffer.from('sk-offline0000000000000000000000'), request, report);
    }, async provider => { for (let i = 0; i < (['success', 'partial_usage'].includes(mode) ? 3 : 1); i++) await provider.create(body, controller.signal); return { comparisons: [1, 2, 3, 4] }; });
    if (mode === 'success') await execute(); else await assert.rejects(execute());
    const text = fs.readFileSync(test.result, 'utf8'), result = JSON.parse(text), ledger = fs.readFileSync(test.ledger);
    assert.ok(!text.includes(sentinel)); assert.ok(!text.includes('sk-offline')); assert.equal(result.httpAttemptCount, calls);
    assert.equal(result.status, mode === 'success' ? 'PASS' : mode === 'abort' ? 'INTERRUPTED' : 'FAIL');
    assert.equal(result.actualBilledUsd, null);
    if (mode === 'success') { assert.equal(calls, 3); assert.equal(result.verifiedUsage.inputTokens, 30); assert.equal(result.verifiedUsageComplete, true); assert.ok(result.tokenCostUpperBoundUsd > 0); assert.equal(result.comparisons, 4); }
    else if (mode === 'partial_usage') { assert.equal(calls, 2); assert.equal(result.verifiedUsage.inputTokens, 10); assert.equal(result.verifiedUsageComplete, false); assert.ok(result.tokenCostUpperBoundUsd > 0); }
    else { assert.equal(result.verifiedUsage, null); assert.equal(result.tokenCostUpperBoundUsd, null); }
    if (mode === 'http_error') { assert.equal(result.errorCode, 'HTTP_ERROR'); assert.equal(result.attempts[0].httpStatus, 429); }
    if (mode === 'unverified_usage') assert.equal(result.errorCode, 'USAGE_UNVERIFIED');
    await assert.rejects(execute()); assert.deepEqual(fs.readFileSync(test.ledger), ledger); assert.equal(fs.readFileSync(test.result, 'utf8'), text);
    assert.equal(fs.readdirSync(test.dir).filter(x => x.endsWith('.tmp')).length, 0);
  }
  // Existing ledger with no result: never fabricate PASS/zero or invoke a client.
  { const test = setup('old_unknown'); fs.writeFileSync(test.ledger, '{"existing":true}'); let touched = false; await assert.rejects(test.harness.runUserLocalSmoke(() => { touched = true; }, () => {})); assert.equal(touched, false); assert.equal(fs.existsSync(test.result), false); }
  // Simulated termination of an active run retains status UNKNOWN plus observed attempts.
  { const test = setup('exit'); await assert.rejects(test.harness.runUserLocalSmoke(() => { test.proc.emit('exit', 1); throw Error(sentinel); }, () => {})); const result = JSON.parse(fs.readFileSync(test.result)); assert.equal(result.status, 'UNKNOWN'); assert.equal(result.errorCode, 'PROCESS_EXIT'); }
  { const test = setup('signal'); await assert.rejects(test.harness.runUserLocalSmoke(() => { test.proc.emit('SIGINT'); }, () => {})); assert.equal(JSON.parse(fs.readFileSync(test.result)).status, 'INTERRUPTED'); }
  // Initial RUNNING snapshot is not a final outcome after an uncatchable kill.
  { const test = setup('hard_kill'); createRunResult(test.ledger); assert.equal(JSON.parse(fs.readFileSync(test.result)).status, 'RUNNING'); assert.throws(() => createRunResult(test.ledger)); }
  console.log(JSON.stringify({ status: 'PASS', realHttpCalls: 0, evidence: root, coverage: 'success; before/after send; HTTP 429; abort/signal/exit; unverified usage; replay immutable; old missing result unknown; atomic snapshots; secret sentinel absent' }));
})().catch(() => { console.error('RESULT_TEST_FAILED'); process.exitCode = 1; });
