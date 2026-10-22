const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
class AssistantError extends Error{constructor(m,s){super(m);this.status=s}}
const m={exports:{}};vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync('lib/assistant/chat/turn-admission.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})')(()=>({AssistantError}),m,m.exports);
const run=m.exports.assertTurnAdmission,p={reservationNano:369512000,reviewReservationNano:47300000,calls:100,budgetNano:10000000000},u={in_window:true,active:0n,calls:32n,reserved:9568900000n};
assert.throws(()=>run(u,p),e=>e.status===429&&e.message.includes('$0.431100')&&e.message.includes('$1.155836')&&!e.message.includes('предыдущий'));
assert.throws(()=>run({...u,active:1n},p),/исход не подтверждён/);
assert.throws(()=>run({...u,in_window:false},p),/Срок/);
assert.throws(()=>run({...u,calls:97n,reserved:0n},p),/числа вызовов/);
run({...u,reserved:8844164000n},p);assert.throws(()=>run({...u,reserved:8844164001n},p));run({...u,calls:96n,reserved:0n},p);
assert.throws(()=>run({...u,reserved:11000000000n},p),/0.000000/);
console.log('PASS exact observed budget, separate active/window/call reasons, unchanged exact reservation boundary. Offline only.');
