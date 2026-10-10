// Contains only whitelisted numeric/status metadata. Never receives keys or request bodies.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const STAGES = new Set(['SECRET_PIPE_INPUT', 'KEY_FORMAT', 'CLIENT_READY', 'MODEL_ADMITTED', 'HTTP_ATTEMPT', 'HTTP_RESPONSE', 'USAGE_VALIDATED', 'SCENARIO_RUN', 'COMPLETE']);
const CODES = new Set(['NONE', 'INPUT_FAILED', 'CLIENT_FAILED', 'HTTP_ERROR', 'TRANSPORT_ERROR', 'USAGE_UNVERIFIED', 'SCENARIO_FAILED', 'INTERRUPTED', 'PROCESS_EXIT', 'TIMEOUT']);
const integer = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
function createRunResult(ledgerPath) {
  const file = ledgerPath.replace(/\.json$/, '.result.json');
  // Refuse overwrite, even if called mistakenly for an existing approval.
  const claim = fs.openSync(file + '.claim', 'wx', 0o600); fs.closeSync(claim);
  if (fs.existsSync(file)) throw Error('Result already exists');
  const state = { schemaVersion: 1, status: 'RUNNING', startedAt: new Date().toISOString(), finishedAt: null,
    stage: 'SECRET_PIPE_INPUT', errorCode: 'NONE', admittedAttempts: 0, httpAttemptCount: 0,
    delivery: 'UNKNOWN', attempts: [], reservedTokenUsd: 0, verifiedUsage: null,
    verifiedUsageComplete: false, tokenCostUpperBoundUsd: null, actualBilledUsd: null, comparisons: null };
  let terminal = false, tracksHttp = false;
  function save() {
    const temporary = path.join(path.dirname(file), '.' + path.basename(file) + '.' + crypto.randomUUID() + '.tmp');
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file); // same-directory atomic replacement of this run's own result
  }
  const last = () => state.attempts[state.attempts.length - 1];
  save();
  return {
    stage(value) { if (!terminal && STAGES.has(value)) { state.stage = value; save(); } },
    transportReady() { if (terminal) throw Error('Result closed'); tracksHttp = true; state.httpAttemptCount = 0; state.stage = 'CLIENT_READY'; save(); },
    admit(index, reserveNano) {
      if (terminal) throw Error('Result closed'); if (!tracksHttp) state.httpAttemptCount = null;
      state.admittedAttempts = integer(index); state.reservedTokenUsd = reserveNano / 1e9;
      state.attempts.push({ index, httpStarted: false, httpStatus: null, providerStatus: 'UNKNOWN', usage: null, tokenCostUpperBoundUsd: null });
      state.stage = 'MODEL_ADMITTED'; save();
    },
    httpStart() { if (terminal) throw Error('Result closed'); if (tracksHttp) state.httpAttemptCount++; if (last()) last().httpStarted = true; state.stage = 'HTTP_ATTEMPT'; save(); },
    httpStatus(status) { if (terminal) return; if (last()) last().httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null; state.stage = 'HTTP_RESPONSE'; save(); },
    providerStatus(status) { if (terminal) return; if (last()) last().providerStatus = ['completed', 'incomplete', 'failed', 'cancelled', 'queued', 'in_progress'].includes(status) ? status : 'UNKNOWN'; save(); },
    error(code) { if (!terminal && CODES.has(code)) { state.errorCode = code; save(); } },
    verified(response, nano) {
      if (terminal) return;
      const u = response.usage;
      const usage = { inputTokens: integer(u.input_tokens), outputTokens: integer(u.output_tokens), totalTokens: integer(u.total_tokens),
        cachedTokens: integer(u.input_tokens_details.cached_tokens), cacheWriteTokens: integer(u.input_tokens_details.cache_write_tokens), reasoningTokens: integer(u.output_tokens_details.reasoning_tokens) };
      if (Object.values(usage).some(x => x === null) || integer(nano) === null) throw Error('Invalid verified metadata');
      last().usage = usage; last().tokenCostUpperBoundUsd = nano / 1e9;
      const verified = state.attempts.filter(x => x.usage);
      state.verifiedUsage = Object.fromEntries(Object.keys(usage).map(k => [k, verified.reduce((n, x) => n + x.usage[k], 0)]));
      state.tokenCostUpperBoundUsd = verified.reduce((n, x) => n + x.tokenCostUpperBoundUsd, 0);
      state.stage = 'USAGE_VALIDATED'; save();
    },
    finish(status, code, comparisons) {
      if (terminal) return;
      if (!['PASS', 'FAIL', 'INTERRUPTED', 'UNKNOWN'].includes(status)) throw Error('Invalid terminal status');
      if (state.errorCode === 'INTERRUPTED') status = 'INTERRUPTED';
      state.status = status; state.finishedAt = new Date().toISOString();
      if (CODES.has(code) && (state.errorCode === 'NONE' || status === 'INTERRUPTED')) state.errorCode = code;
      state.comparisons = integer(comparisons);
      state.verifiedUsageComplete = state.admittedAttempts > 0 && state.attempts.every(x => x.usage !== null);
      if (status === 'PASS') state.stage = 'COMPLETE';
      save(); terminal = true;
    }
  };
}
module.exports = { createRunResult };
