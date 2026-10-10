const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), { EventEmitter } = require('node:events');
const { makeTransport } = require('./assistant-smoke-local.cjs');
global.fetch = () => { throw Error('Network forbidden'); };
for (const name of ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls']) {
  const network = require(name); for (const method of ['request', 'get', 'connect', 'createConnection']) if (typeof network[method] === 'function') network[method] = () => { throw Error('Network forbidden'); };
}
function isolatedHarness() {
  const filename = path.resolve(__dirname, 'lib/assistant-smoke-once.cjs');
  const claims = new Map(); let factoryCalls = 0;
  const memoryFs = {
    existsSync: file => claims.has(file), mkdirSync() {},
    openSync(file, mode) { assert.equal(mode, 'wx'); if (claims.has(file)) throw Error('Already claimed'); claims.set(file, null); return file; },
    writeFileSync(file, text) { claims.set(file, JSON.parse(text)); }, fsyncSync() {}, closeSync() {}
  };
  const loaded = new Module(filename); loaded.filename = filename;
  loaded.require = name => name === 'node:fs' ? memoryFs : name === './assistant-smoke-result.cjs' ? { createRunResult: () => ({ stage() {}, admit() {}, providerStatus() {}, verified() {}, error() {}, finish() {} }) } : require(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  const harness = loaded.exports;
  return { harness, claims, factory: response => async () => { factoryCalls++; return response; }, count: () => factoryCalls };
}
const signal = () => new AbortController().signal;
const body = { model: 'gpt-6-luna', service_tier: 'default', store: false, reasoning: { effort: 'none', mode: 'standard' }, max_output_tokens: 1400, instructions: 'Synthetic', input: [{ role: 'user', content: 'Synthetic' }], text: { format: { type: 'text' } } };
const response = { model: 'gpt-6-luna', service_tier: 'default', status: 'completed', output: [], output_text: 'Synthetic', usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
(async () => {
  for (const failure of [-1, 0, 1, 2]) {
    const test = isolatedHarness(); let attempts = 0, disposed = 0;
    const client = { maxRetries: 0, baseURL: 'https://api.openai.com/v1', dispose() { disposed++; }, responses: { async create() { const n = attempts++; if (n === failure) throw Error('Synthetic error'); return response; } } };
    const execute = () => test.harness.runUserLocalSmoke(test.factory(client), async provider => {
      for (let i = 0; i < 3; i++) await provider.create(body, signal());
      await assert.rejects(provider.create(body, signal())); return 'checked';
    });
    if (failure < 0) { const result = await execute(); assert.equal(result.attempts, 3); assert.equal(result.reservedNano, 869715000); }
    else await assert.rejects(execute());
    assert.equal(attempts, failure < 0 ? 3 : failure + 1); assert.equal(disposed, 1);
    await assert.rejects(execute()); assert.equal(test.count(), 1); assert.equal(test.claims.size, 1);
    const [ledgerPath, ledger] = [...test.claims][0]; assert.ok(ledgerPath.endsWith(test.harness.APPROVAL + '.json')); assert.equal(ledger.maxCalls, 3); assert.equal(ledger.reservedUsd, 1);
  }
  { const test = isolatedHarness(); await assert.rejects(test.harness.runUserLocalSmoke(async () => { throw Error('Synthetic input cancelled'); }, () => {})); assert.equal(test.claims.size, 1); assert.throws(test.harness.checkUserLocalSmoke); }
  // Real transport function exercised against an in-memory EventEmitter, never a socket.
  for (const status of [200, 301, 401, 429, 500]) {
    const bytes = Buffer.from('sk-offline0000000000000000000000'); let calls = 0;
    const request = (options, callback) => {
      calls++; assert.equal(options.hostname, 'api.openai.com'); assert.equal(options.path, '/v1/responses'); assert.equal(options.method, 'POST'); assert.equal(options.agent, false);
      assert.equal(options.headers.Authorization, 'Bearer sk-offline0000000000000000000000');
      const req = new EventEmitter(); req.setTimeout = ms => { assert.equal(ms, 25000); }; req.destroy = () => req.emit('error', Error('fake'));
      req.end = data => { assert.deepEqual(JSON.parse(data), body); queueMicrotask(() => { const res = new EventEmitter(); res.statusCode = status; callback(res); res.emit('data', Buffer.from(JSON.stringify({ ...response, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic' }] }] }))); res.emit('end'); }); }; return req;
    };
    const client = makeTransport(bytes, request); assert.ok(bytes.every(x => x === 0));
    if (status === 200) assert.equal((await client.responses.create(body, { signal: signal(), maxRetries: 0 })).output_text, 'Synthetic');
    else await assert.rejects(client.responses.create(body, { signal: signal(), maxRetries: 0 }));
    assert.equal(calls, 1); client.dispose(); assert.throws(() => client.responses.create(body, { signal: signal(), maxRetries: 0 })); assert.equal(calls, 1);
  }
  console.log('PASS: local entry uses same exclusive ledger; 3 attempts including each failure position; cancelled input cannot replay; disposal; transport target, redirects/errors/no retries; secret buffers zeroed; zero sockets.');
})().catch(() => { console.error('OFFLINE_TEST_FAILED'); process.exitCode = 1; });
