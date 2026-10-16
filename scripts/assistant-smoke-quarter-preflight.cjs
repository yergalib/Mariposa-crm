// Pre-key check for the 2026-10-16 approval. No credential, network or live runner
// import. Do not fall through to the older launcher with its larger allowance.
const { POLICY: previous } = require('./lib/assistant-smoke-once.cjs');
const APPROVAL = 'Sentinel_c5b1ced99a648191a5c8f3dbe62bff83';
const LIMITS = Object.freeze({ totalNano: 250000000, calls: 24, turns: 6 });
// Official model page rechecked 2026-10-16. Use the old full-window bound:
// long-context input/cache-write/output + 10% margin, not a bytes/token estimate.
const RATES = Object.freeze({ contextWindow: 1050000, writeNano: 250, outputNano: 750,
  maxOutput: 1400, validUntil: Date.parse('2026-10-17T00:00:00Z') });
const fullWindowReserve = Math.ceil((RATES.contextWindow * RATES.writeNano + RATES.maxOutput * RATES.outputNano) * 11 / 10);
function admit({ spentNano = 0, calls = 0, turns = 0, quoteNano, now = Date.now() } = {}) {
  const count = value => Number.isSafeInteger(value) && value >= 0;
  if (now >= RATES.validUntil) return 'PRICE_EXPIRED';
  if (![spentNano, calls, turns, quoteNano].every(count) || quoteNano === 0) return 'COST_UNKNOWN';
  if (calls >= LIMITS.calls || turns > LIMITS.turns || turns < 1) return 'CALL_OR_TURN_LIMIT';
  if (spentNano > LIMITS.totalNano || quoteNano > LIMITS.totalNano - spentNano) return 'TOTAL_BUDGET';
  return 'ADMIT';
}
function preflight(now = Date.now()) {
  const reason = admit({ turns: 1, quoteNano: fullWindowReserve, now });
  // This is deliberately not a paid entrypoint. No new token-count call may be
  // made until its maximum charge is established; missing price is not zero.
  return { status: 'STOPPED_BEFORE_SECRET_INPUT', approval: APPROVAL, reason,
    totalBudgetUsd: LIMITS.totalNano / 1e9, maxProviderCalls: LIMITS.calls,
    maxCustomerTurns: LIMITS.turns, legacyFullWindowReserveUsd: fullWindowReserve / 1e9,
    tokenCountEndpointMaximumCharge: null, modelCalls: 0,
    source: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
    priorBoundMatches: fullWindowReserve === previous.reserveNano };
}
module.exports = { LIMITS, RATES, fullWindowReserve, admit, preflight };
if (require.main === module) {
  if (process.argv[2] === '--offline-test') {
    const assert = require('node:assert/strict');
    const now = Date.parse('2026-10-16T15:00:00Z');
    assert.equal(fullWindowReserve, 289905000);
    assert.equal(preflight(now).reason, 'TOTAL_BUDGET');
    assert.equal(admit({turns:1,quoteNano:undefined,now}), 'COST_UNKNOWN');
    assert.equal(admit({turns:1,quoteNano:NaN,now}), 'COST_UNKNOWN');
    assert.equal(admit({turns:1,quoteNano:-1,now}), 'COST_UNKNOWN');
    assert.equal(admit({turns:1,quoteNano:0,now}), 'COST_UNKNOWN');
    assert.equal(admit({turns:1,quoteNano:250000001,now}), 'TOTAL_BUDGET');
    assert.equal(admit({turns:1,quoteNano:250000000,now}), 'ADMIT');
    assert.equal(admit({turns:6,calls:23,spentNano:249000000,quoteNano:1000000,now}), 'ADMIT');
    assert.equal(admit({turns:6,calls:23,spentNano:249000001,quoteNano:1000000,now}), 'TOTAL_BUDGET');
    assert.equal(admit({turns:6,calls:24,quoteNano:1,now}), 'CALL_OR_TURN_LIMIT');
    assert.equal(admit({turns:7,calls:0,quoteNano:1,now}), 'CALL_OR_TURN_LIMIT');
    assert.equal(admit({turns:1,quoteNano:1,now:RATES.validUntil}), 'PRICE_EXPIRED');
    console.log(JSON.stringify({status:'OFFLINE_PASS',checks:13,networkCalls:0,secretReads:0,preflight:preflight(now)}));
  } else { console.log(JSON.stringify(preflight())); process.exitCode = 2; }
}
