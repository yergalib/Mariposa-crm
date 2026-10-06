'use strict';
// Offline guard tests only. No pg client, credentials, or database connections.
const assert=require('node:assert/strict'),fs=require('node:fs');
const r=require('./catalog-main-import.cjs');
const ca=fs.readFileSync(process.argv[2]);
const database={host:r.SESSION_HOST,port:5432,name:'postgres',user:r.SESSION_USER};
const url=`postgresql://${r.SESSION_USER}:synthetic@${r.SESSION_HOST}:5432/postgres`;
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('exact session profile pins CA and preserves TLS hostname verification',()=>{
 const c=r.connectionConfig({database},url,ca);
 assert.equal(c.host,r.SESSION_HOST);assert.equal(c.user,r.SESSION_USER);assert.equal(c.port,5432);
 assert.equal(c.ssl.rejectUnauthorized,true);assert.deepEqual(c.ssl.ca,ca);
 assert.equal(c.ssl.checkServerIdentity,undefined);assert.equal(c.ssl.servername,undefined);
});
test('foreign hosts, tenants, ports, database names, extra fields rejected',()=>{
 for(const change of [{host:'aws-1-ap-south-1.pooler.supabase.com'},{host:'localhost'},{user:'postgres.foreign'},{user:'postgres'},{port:6543},{name:'other'},{sslmode:'disable'}])
  assert.throws(()=>r.connectionConfig({database:{...database,...change}},url,ca));
 for(const changed of [url.replace(r.SESSION_HOST,'foreign.invalid'),url.replace(r.SESSION_USER,'postgres.foreign'),url.replace(':5432',':6543'),url+'?sslmode=disable',url+'#fragment'])
  assert.throws(()=>r.connectionConfig({database},changed,ca));
});
test('missing, malformed, multiple or private-key CA material rejected',()=>{
 for(const bad of [undefined,Buffer.from('bad'),Buffer.concat([ca,ca]),Buffer.concat([ca,Buffer.from('\n-----BEGIN PRIVATE KEY-----')])])
  assert.throws(()=>r.connectionConfig({database},url,bad));
 const changed=Buffer.from(ca.toString().replace('MIID','MIIC'));
 assert.throws(()=>r.connectionConfig({database},url,changed));
});
test('explicit direct profile retains strict TLS and cannot accept pooler URL',()=>{
 const direct={host:r.HOST,port:5432,name:'postgres',user:'postgres'};
 assert.equal(r.connectionConfig({database:direct},`postgresql://postgres:synthetic@${r.HOST}/postgres`).ssl.rejectUnauthorized,true);
 assert.throws(()=>r.connectionConfig({database:direct},url,ca));
});
test('session request still pins tenant, manifest, release, code and schema',()=>{
 const at='2026-10-06T04:42:00.000Z';
 const request={version:1,projectId:r.PROJECT,tenantId:r.TENANT,manifestSha:r.MANIFEST,releaseSha:r.RELEASE,codeSha:r.codeSha(),schemaSha:'a'.repeat(64),applicationTimestamp:at,database,authorization:{},backup:{},barrier:{}};
 r.validateRequest(request,{approvedAt:at});
 for(const key of ['tenantId','manifestSha','releaseSha','codeSha','schemaSha'])assert.throws(()=>r.validateRequest({...request,[key]:'wrong'},{approvedAt:at}));
 assert.throws(()=>r.verifyApplyGate(request,r.ACK));
});
console.log(JSON.stringify({status:'PASS',checks,connections:0,codeSha:r.codeSha()}));
