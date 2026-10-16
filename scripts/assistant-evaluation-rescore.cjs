// Read only saved replies; write a separate report, never the original ledger.
const fs=require('node:fs'),path=require('node:path');
const {assessDialogue}=require('./lib/assistant-dialogue-assessment.cjs');
const root=path.resolve(process.argv[2]);
const output=path.resolve(process.argv[3]);
if(output===root||output.startsWith(root+path.sep))throw Error('Keep original evidence immutable');
const results=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isDirectory()).map(id=>{
 const old=JSON.parse(fs.readFileSync(path.join(root,id,'result.json'),'utf8'));
 const turns=[1,2].flatMap(n=>{const file=path.join(root,id,`turn-${n}.json`);return fs.existsSync(file)?[JSON.parse(fs.readFileSync(file,'utf8'))]:[]});
 return {id,originalStatus:old.status,originalFailure:old.failure??null,...assessDialogue(turns,old.checks??{},id.replace(/-recheck$/,''))};
});
const count=rows=>({total:rows.length,confirmedPass:0,fail:rows.filter(r=>r.taskStatus==='FAIL').length,reviewRequired:rows.filter(r=>r.taskStatus==='REVIEW_REQUIRED').length});
const report={source:root,networkCalls:0,originalEvidenceModified:false,main:count(results.filter(r=>!r.id.endsWith('-recheck'))),rechecks:count(results.filter(r=>r.id.endsWith('-recheck'))),results};
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({main:report.main,rechecks:report.rechecks,output}));
