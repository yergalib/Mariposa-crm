// User-run entry only. Agent verification uses --self-test, which cannot load HTTPS.
const fs = require('node:fs');
const { POLICY, checkUserLocalSmoke, runUserLocalSmoke, createSyntheticRun } = require('./lib/assistant-smoke-once.cjs');
let safeStage = 'INVOCATION';
const FAKE = 'MARIPOSA_FAKE_KEY_NO_NETWORK';
function readKey() {
  return new Promise((resolve, reject) => {
    const bytes = Buffer.alloc(1024); let length = 0;
    const timer = setTimeout(() => finish(false), 10000);
    function finish(ok) {
      clearTimeout(timer); process.stdin.removeAllListeners('data'); process.stdin.removeAllListeners('end'); process.stdin.removeAllListeners('error'); process.stdin.pause();
      if (ok) { const result = Buffer.from(bytes.subarray(0, length)); bytes.fill(0); resolve(result); }
      else { bytes.fill(0); reject(Error('Input refused')); }
    }
    process.stdin.on('data', chunk => {
      if (length + chunk.length > bytes.length) { chunk.fill(0); finish(false); return; }
      chunk.copy(bytes, length); length += chunk.length; chunk.fill(0);
    });
    process.stdin.once('end', () => finish(length >= 20 && length <= 512));
    process.stdin.once('error', () => finish(false));
  });
}
function makeTransport(keyBytes, request, report) {
  let key = keyBytes.toString('ascii'); keyBytes.fill(0);
  if (!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key)) { key = ''; throw Error('Invalid key format'); }
  report?.transportReady();
  return {
    maxRetries: 0, baseURL: 'https://api.openai.com/v1', dispose() { key = ''; },
    responses: { create(body, options) {
      if (!key || options.maxRetries !== 0) throw Error('Transport closed');
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        // Direct single HTTPS request: no SDK, redirects, preflight or automatic retries.
        report?.httpStart();
        const req = request({ hostname: 'api.openai.com', port: 443, path: '/v1/responses', method: 'POST',
          agent: false, signal: options.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
          report?.httpStatus(res.statusCode);
          let length = 0; const chunks = [];
          res.on('data', chunk => { length += chunk.length; if (length > 262144) { req.destroy(); reject(Error('Response too large')); } else chunks.push(chunk); });
          res.on('error', () => reject(Error('Response failed')));
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) { report?.error('HTTP_ERROR'); throw Error('HTTP failure'); }
              const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              value.output_text = (value.output ?? []).filter(x => x.type === 'message').flatMap(x => x.content ?? []).filter(x => x.type === 'output_text').map(x => x.text).join('');
              resolve(value);
            } catch { reject(Error('Response refused')); }
          });
        });
        req.setTimeout(25000, () => req.destroy());
        req.on('error', () => { report?.error(options.signal.aborted ? 'INTERRUPTED' : 'TRANSPORT_ERROR'); reject(Error('Request failed')); });
        req.end(payload);
      });
    } }
  };
}
async function selfTest(keyBytes) {
  const assert = require('node:assert/strict');
  assert.equal(keyBytes.toString('ascii'), FAKE); keyBytes.fill(0);
  for (const name of ['OPENAI_API_KEY', 'DATABASE_URL', 'NODE_OPTIONS', 'HTTP_PROXY', 'HTTPS_PROXY']) assert.equal(process.env[name], undefined);
  // Fail closed for every common network transport during offline verification.
  global.fetch = () => { throw Error('NETWORK FORBIDDEN'); };
  for (const name of ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls']) {
    const network = require(name); for (const method of ['request', 'get', 'connect', 'createConnection']) if (typeof network[method] === 'function') network[method] = () => { throw Error('NETWORK FORBIDDEN'); };
  }
  const runScenario = require('./assistant-smoke-local-fixture.cjs');
  const id = n => String(n).padStart(8, '0') + '-1111-4111-8111-111111111111';
  const refs = Array.from({ length: 4 }, (_, i) => ({ productId: id(100 + i), executionId: null }));
  const tool = (call_id, requests) => ({ type: 'function_call', call_id, name: 'read_batch', arguments: JSON.stringify({ requests }) });
  const result = (output, output_text = '') => ({ model: POLICY.model, service_tier: 'default', status: 'completed', output, output_text,
    usage: { input_tokens: 24000, output_tokens: 1400, total_tokens: 25400, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } });
  const steps = [
    { type: 'create', value: result([tool('one', refs.map(p => ({ name: 'get_product', productId: p.productId, executionId: '' })))]) },
    { type: 'create', value: result([tool('two', refs.map((_, i) => ({ name: 'read_variant', variantId: id(200 + i) })))]) },
    { type: 'create', value: result([], JSON.stringify({ message: 'Синтетическое сравнение.', cardIds: [], productRefs: refs })) }
  ];
  const run = createSyntheticRun({ steps });
  const value = await runScenario(run.provider);
  assert.equal(run.calls.length, 3); assert.equal(value.comparisons.length, 4);
  await assert.rejects(run.provider.create(run.calls[0].body, new AbortController().signal));
  assert.equal(run.calls.length, 3);
  return { status: 'OFFLINE_PASS', realHttpAttempts: 0, syntheticAttempts: 3, comparisons: 4 };
}
async function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['--check', '--self-test', '--live'].includes(mode)) throw Error('Invalid invocation');
  if (mode === '--check') {
    safeStage = 'PRICE_EXPIRED';
    if (Date.now() >= POLICY.ratesValidUntil) throw Error('Stale');
    safeStage = 'APPROVAL_OR_SCOPE';
    checkUserLocalSmoke();
    safeStage = 'LEDGER_DIRECTORY_ACCESS';
    const path = require('node:path');
    let parent = path.resolve(__dirname, '../../site-assistant-smoke-state');
    while (!fs.existsSync(parent)) { const next = path.dirname(parent); if (next === parent) throw Error('Missing parent'); parent = next; }
    fs.accessSync(parent, fs.constants.W_OK);
    safeStage = 'NODE_VERSION';
    if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node 22 required');
    safeStage = 'DEPENDENCY_LOAD';
    if (!fs.existsSync(require.resolve('typescript'))) throw Error('Missing dependency');
    require('./assistant-smoke-local-fixture.cjs');
    console.log('READY'); return;
  }
  let keyBytes;
  try {
    if (mode === '--self-test') { keyBytes = await readKey(); console.log(JSON.stringify(await selfTest(keyBytes))); return; }
    checkUserLocalSmoke();
    // The one-shot ledger is reserved before requesting secret bytes or making a client.
    const scenario = require('./assistant-smoke-local-fixture.cjs');
    safeStage = 'LEDGER_RESERVE';
    const outcome = await runUserLocalSmoke(async report => {
      safeStage = 'SECRET_PIPE_INPUT'; report.stage('SECRET_PIPE_INPUT');
      keyBytes = await readKey();
      safeStage = 'KEY_FORMAT'; report.stage('KEY_FORMAT');
      return makeTransport(keyBytes, require('node:https').request, report);
    }, async provider => { safeStage = 'SCENARIO_RUN'; return scenario(provider); });
    // No provider text, diagnostic, headers, request or secret is printed or persisted.
    console.log(JSON.stringify({ status: 'LIVE_COMPLETED', attempts: outcome.attempts,
      reservedTokenUsd: outcome.reservedNano / 1e9, comparisons: outcome.result.comparisons?.length ?? 0 }));
  } finally { keyBytes?.fill(0); }
}
if (require.main === module) {
  const watchdog = setTimeout(() => process.exit(3), 110000);
  main().catch(() => { console.log(JSON.stringify({ status: 'STOPPED', code: safeStage })); process.exitCode = 2; }).finally(() => { clearTimeout(watchdog); process.stdin.destroy(); });
}
module.exports = { makeTransport, FAKE };
