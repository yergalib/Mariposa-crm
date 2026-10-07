const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),ts=require('typescript'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),baseline='273f9c00407db686f9a6f5314a7f3f8e2776c574';
const result=spawnSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',baseline+':lib/permissions/registry.ts'],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
function load(source){const m={exports:{}};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(module,exports){'+code+'\n})',{})(m,m.exports);return m.exports}
const old=load(result.stdout),current=load(fs.readFileSync(path.join(root,'lib/permissions/registry.ts'),'utf8'));
assert.deepEqual(Object.keys(current.PERMISSION_REGISTRY).filter(key=>!key.startsWith('TASK_')).sort(),Object.keys(old.PERMISSION_REGISTRY).sort());
for(const role of ['OWNER','DIRECTOR','SELLER','CASHIER'])for(const key of Object.keys(old.PERMISSION_REGISTRY))assert.equal(current.defaultHasPermission(role,key),old.defaultHasPermission(role,key),role+' '+key);
assert(current.defaultHasPermission('DIRECTOR','TASK_MANAGE'));assert(current.defaultHasPermission('SELLER','TASK_STATUS'));assert(!current.defaultHasPermission('SELLER','TASK_MANAGE'));assert(!current.defaultHasPermission('CASHIER','TASK_VIEW'));
console.log('PASS: all pre-existing role/permission defaults equal '+baseline+'; only approved TASK_* defaults added');
