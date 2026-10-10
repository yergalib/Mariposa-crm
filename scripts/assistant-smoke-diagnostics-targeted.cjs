const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'assistant-smoke-local.cjs'), 'utf8');
const secretMarker = 'PRIVATE_EXCEPTION_TEXT_MUST_NEVER_ESCAPE';
(async () => {
  for (const scenario of ['PRICE_EXPIRED', 'APPROVAL_OR_SCOPE', 'LEDGER_DIRECTORY_ACCESS', 'NODE_VERSION', 'DEPENDENCY_LOAD', 'READY']) {
    const output = [], loaded = { exports: {} };
    const throwPrivate = () => { throw Error(secretMarker); };
    const fakeFs = { existsSync: () => true, constants: { W_OK: 2 }, accessSync: scenario === 'LEDGER_DIRECTORY_ACCESS' ? throwPrivate : () => {} };
    const fakeRequire = name => {
      if (name === 'node:fs') return fakeFs;
      if (name === 'node:path') return path;
      if (name === './lib/assistant-smoke-once.cjs') return { POLICY: { ratesValidUntil: scenario === 'PRICE_EXPIRED' ? 0 : Date.now() + 60000 }, checkUserLocalSmoke: scenario === 'APPROVAL_OR_SCOPE' ? throwPrivate : () => {}, runUserLocalSmoke: throwPrivate, createSyntheticRun: throwPrivate };
      if (name === './assistant-smoke-local-fixture.cjs') return () => {};
      throw Error('Unexpected dependency');
    };
    fakeRequire.resolve = scenario === 'DEPENDENCY_LOAD' ? throwPrivate : () => 'synthetic-typescript';
    fakeRequire.main = loaded;
    const process = { argv: ['node', 'script', '--check'], versions: { node: scenario === 'NODE_VERSION' ? '20.0.0' : '22.0.0' }, stdin: { destroy() {} }, exit: throwPrivate };
    vm.runInNewContext(source, { require: fakeRequire, module: loaded, __dirname, process, Date, Buffer,
      console: { log: value => output.push(value) }, setTimeout: () => 0, clearTimeout() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(output.length, 1); assert.ok(!output[0].includes(secretMarker));
    if (scenario === 'READY') assert.equal(output[0], 'READY');
    else { assert.deepEqual(JSON.parse(output[0]), { status: 'STOPPED', code: scenario }); assert.equal(process.exitCode, 2); }
  }
  const ps = fs.readFileSync(path.join(__dirname, 'assistant-smoke-local.ps1'), 'utf8');
  assert.ok(ps.includes("$smokeStage = 'USER_CANCELLED'")); assert.ok(ps.includes("$smokeStage = 'KEY_LENGTH'"));
  assert.ok(ps.includes("$smokeStage = 'PRIVATE_CONSOLE'")); assert.ok(!ps.includes('$_.Exception'));
  assert.ok(ps.includes("-f $smokeStage)"));
  console.log('PASS: whitelisted preflight codes for expiry/approval/access/runtime/dependency; exception sentinel never emitted; no key, ledger or network.');
})().catch(() => { console.error('DIAGNOSTICS_TEST_FAILED'); process.exitCode = 1; });
