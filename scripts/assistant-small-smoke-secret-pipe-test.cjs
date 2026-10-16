// Tests only hard-coded synthetic keys. No key discovery, ledger access or network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'mariposa-fake-pipe-'));
const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
try{
 const source=fs.readFileSync(path.join(__dirname,'assistant-small-smoke.ps1'),'utf8');
 assert(source.includes("Read-Host 'Paste API key (hidden)' -AsSecureString"));
 let start=source.slice(source.indexOf('    function New-PrivateStart'),source.indexOf("    $stage = 'READINESS_START'"));
 const child=path.join(temp,'fake-child.cjs');
 start=start.replace("Split-Path -Parent $PSScriptRoot",psQuote(repo)).replace("(Join-Path $PSScriptRoot 'assistant-small-smoke.cjs')",psQuote(child));
 const pipeStart=source.indexOf('        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)');
 const pipeEnd=source.indexOf('$secret.Dispose(); $secret = $null; $code = 0',pipeStart)+'$secret.Dispose(); $secret = $null; $code = 0'.length;
 assert(pipeStart>0&&pipeEnd>pipeStart);const pipe=source.slice(pipeStart,pipeEnd);
 fs.writeFileSync(child,`
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const load=Module._load;Module._load=function(k,...a){if(['https','http','net','tls','node:https','node:http','node:net','node:tls','undici'].includes(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...a)};global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const filename=${JSON.stringify(path.join(__dirname,'assistant-small-smoke.cjs'))};
const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(fs.readFileSync(filename,'utf8')+';module.exports.testReadKey=readKey;',filename);
const {makeTransport}=require(${JSON.stringify(path.join(__dirname,'assistant-smoke-local.cjs'))});
(async()=>{const bytes=await m.exports.testReadKey();const expected=['sk-'+ 'A'.repeat(20),'sk-proj-'+ 'Ab9_-'.repeat(30),'sk-'+ 'Z'.repeat(500)];const value=bytes.toString('ascii');assert(expected.includes(value));let calls=0;
const transport=makeTransport(bytes,(options,callback)=>{calls++;assert.equal(options.hostname,'api.openai.com');assert.equal(options.path,'/v1/responses');assert.equal(options.headers.Authorization,'Bearer '+value);assert(!/["\\r\\n ]/.test(options.headers.Authorization.slice(7)));const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=()=>{};req.end=()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from('{"status":"completed","output":[]}'));res.emit('end')};return req});
assert(bytes.every(v=>v===0));await transport.responses.create({synthetic:true},{signal:new AbortController().signal,maxRetries:0});assert.equal(calls,1);transport.dispose();assert.throws(()=>transport.responses.create({}, {maxRetries:0}));
for(const invalid of ['Mariposa test-1','********','secret','$secret','"'+value+'"',value+' ',value+'\\n'])assert.throws(()=>makeTransport(Buffer.from(invalid),()=>{throw Error('MUST_NOT_SEND')}));
console.log(JSON.stringify({status:'FAKE_PIPE_PASS',networkCalls:0,exactHeader:true,length:bytes.length,bufferZeroed:true}));})().catch(()=>{console.log('{"status":"FAKE_PIPE_FAIL"}');process.exitCode=2});
`);
 const script=path.join(temp,'test.ps1');
 fs.writeFileSync(script,`$ErrorActionPreference='Stop'
$Resume=$false
${start}
foreach ($fakeValue in @(('sk-' + ('A' * 20)), ('sk-proj-' + ('Ab9_-' * 30)), ('sk-' + ('Z' * 500)))) {
 $secret=ConvertTo-SecureString $fakeValue -AsPlainText -Force
 $child=$null; $bstr=[IntPtr]::Zero
 try {
 ${pipe}
 if (!$child.WaitForExit(15000)) { throw 'Fake child timeout' }
 if ($err.Result.Length -ne 0 -or $out.Result -notmatch 'FAKE_PIPE_PASS') { throw ('Fake pipe failed: ' + $out.Result + ' ' + $err.Result) }
 Write-Output $out.Result.Trim()
 } finally { if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }; if ($null -ne $secret) {$secret.Dispose()}; if ($null -ne $child) {if (!$child.HasExited) {$child.Kill($true)}; $child.Dispose()} }
}
`);
 const exe=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe');
 const r=spawnSync(exe,['-NoProfile','-File',script],{cwd:temp,encoding:'utf8',windowsHide:true,timeout:60000});
 assert(!r.error);assert.equal(r.stderr,'');const results=r.stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s));assert.equal(results.length,3);assert(results.every(r=>r.status==='FAKE_PIPE_PASS'&&r.exactHeader&&r.bufferZeroed&&r.networkCalls===0));
 console.log(JSON.stringify({status:'OFFLINE_PASS',cases:results,checks:['actual-SecureString-BSTR-pipe-code','actual-stdin-reader','actual-Authorization-construction','quotes-spaces-mask-variable-name-rejected','no-network-module','buffer-zeroed-and-transport-disposed'],limitations:'SecureString constructed from fixed test strings; does not inspect or reproduce the human clipboard or real key validity.'}));
}finally{fs.rmSync(temp,{recursive:true,force:true})}
