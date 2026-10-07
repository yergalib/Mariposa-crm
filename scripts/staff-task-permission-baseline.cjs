const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),ts=require('typescript'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),baseline='273f9c00407db686f9a6f5314a7f3f8e2776c574';
const result=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',baseline+':lib/permissions/registry.ts'],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
function load(source){const m={exports:{}};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(module,exports){'+code+'\n})',{})(m,m.exports);return m.exports}
const old=load(result.stdout),current=load(fs.readFileSync(path.join(root,'lib/permissions/registry.ts'),'utf8'));
assert.deepEqual(Object.keys(current.PERMISSION_REGISTRY).filter(key=>!key.startsWith('TASK_')&&!key.startsWith('SHIFT_')).sort(),Object.keys(old.PERMISSION_REGISTRY).sort());
for(const role of ['OWNER','DIRECTOR','SELLER','CASHIER'])for(const key of Object.keys(old.PERMISSION_REGISTRY))assert.equal(current.defaultHasPermission(role,key),key==='PAYMENT_CREATE'?true:old.defaultHasPermission(role,key),role+' '+key);
assert(current.defaultHasPermission('DIRECTOR','TASK_MANAGE'));assert(current.defaultHasPermission('SELLER','TASK_STATUS'));assert(!current.defaultHasPermission('SELLER','TASK_MANAGE'));assert(!current.defaultHasPermission('CASHIER','TASK_VIEW'));
for(const role of ['OWNER','DIRECTOR','SELLER','CASHIER']){assert(current.defaultHasPermission(role,'SHIFT_VIEW'));assert.equal(current.defaultHasPermission(role,'SHIFT_MANAGE'),['OWNER','DIRECTOR'].includes(role))}
console.log('PASS: baseline '+baseline+' preserved except approved TASK_*, SHIFT_* and ordinary PAYMENT_CREATE for staff; financial visibility/refund/reversal defaults unchanged');
