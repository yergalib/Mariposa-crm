// Read-only real-ledger check. Never runs --live or supplies stdin.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..','assistant-smoke-approval-20261016-144953');
const files=['started.json','attempt-1.json','result.json','resume-started.json','attempt-2.json','failure-2.json','resume-evidence/result.json','resume-evidence/transport.json'];
const before=files.map(f=>fs.readFileSync(path.join(root,f),'utf8'));
const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:path.join(process.env.SystemRoot,'System32')};
for(const cwd of [__dirname,path.join(process.env.SystemRoot,'System32')]){
 const r=spawnSync(path.join(process.env.SystemRoot,'System32','cmd.exe'),['/d','/c',path.join(__dirname,'START-RESUME-SMOKE.cmd'),'--check'],{cwd,env,encoding:'utf8',timeout:20000,windowsHide:true});
 assert(!r.error);assert(r.stdout.includes('"status":"STOPPED"'));assert(r.stdout.includes('"stage":"READINESS_CHECK"'));assert(r.stdout.includes('"code":"RESUME_ALREADY_USED_OR_UNEXPECTED_HISTORY"'));assert(!r.stdout.includes('Paste API key (hidden)'));
}
files.forEach((f,i)=>assert.equal(fs.readFileSync(path.join(root,f),'utf8'),before[i]));
console.log(JSON.stringify({status:'OFFLINE_PASS',checks:['cmd-from-scripts-directory','cmd-from-system32','no-pwsh-on-path','structured-exact-reason','stops-before-secret','ledger-unchanged'],networkCalls:0}));
