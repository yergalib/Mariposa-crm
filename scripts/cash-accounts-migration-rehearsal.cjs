const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const app=path.resolve(__dirname,'..'),{Client}=require(path.join(app,'node_modules/pg')),out=path.resolve(__dirname,'../../p1-cash-accounts-evidence'),config={host:'127.0.0.1',port:62317,user:'import_test'},org='e376414e-4e0b-5048-8a62-eda3988bea4a';
(async()=>{const admin=new Client({...config,database:'postgres'});await admin.connect();const database='crm_cash_migration_'+Date.now();await admin.query('CREATE DATABASE "'+database+'" TEMPLATE "crm_p0_closure_1791301267257"');await admin.end();const db=new Client({...config,database});await db.connect();try{
assert.equal((await db.query("SELECT count(*)::int n FROM organizations WHERE id='2157bde1-1994-465b-9f80-e1b740ee3cb1'")).rows[0].n,0);
for(const name of ['20261007050000_staff_tasks','20261007063000_staff_shifts','20261007090000_payroll_operational','20261007123000_configurable_permission_roles'])await db.query(fs.readFileSync(path.join(app,'prisma/migrations',name,'migration.sql'),'utf8'));
const director=(await db.query('SELECT id FROM organization_memberships WHERE organization_id=$1 AND role=\'DIRECTOR\' LIMIT 1',[org])).rows[0].id;
for(const key of ['FINANCE_DASHBOARD_VIEW','PAYMENT_CREATE','PAYMENT_REVERSE','SETTINGS_MANAGE'])await db.query('INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at) VALUES($1,$2,$3,$4,\'DENY\',now(),now()) ON CONFLICT(membership_id,permission_key) DO UPDATE SET effect=\'DENY\'',[crypto.randomUUID(),org,director,key]);
const before=(await db.query('SELECT permission_key,effect FROM membership_permission_overrides WHERE membership_id=$1 ORDER BY permission_key',[director])).rows;

const edited=(await db.query("UPDATE permission_roles SET version=2 WHERE organization_id=$1 AND system_role='SELLER' RETURNING id,permission_keys",[org])).rows[0];
const ledgerBefore=(await db.query('SELECT id,cash_effect_minor,revenue_effect_minor FROM financial_transactions ORDER BY id')).rows;
const hashes=[];for(const name of ['20261007150000_cash_accounts','20261007150100_cash_permission_defaults']){const sql=fs.readFileSync(path.join(app,'prisma/migrations',name,'migration.sql'),'utf8');await db.query('BEGIN');await db.query(sql);await db.query('COMMIT');hashes.push({name,sha256:crypto.createHash('sha256').update(sql).digest('hex')})}
const after=(await db.query('SELECT permission_key,effect FROM membership_permission_overrides WHERE membership_id=$1',[director])).rows;
for(const old of before)assert(after.some(row=>row.permission_key===old.permission_key&&row.effect===old.effect));
for(const key of ['CASH_ACCOUNT_VIEW','CASH_EXPENSE_CREATE','CASH_TRANSFER_CREATE','CASH_CORRECT','CASH_CATEGORY_MANAGE'])assert(after.some(row=>row.permission_key===key&&row.effect==='DENY'),key);
assert.deepEqual((await db.query('SELECT permission_keys FROM permission_roles WHERE id=$1',[edited.id])).rows[0].permission_keys,edited.permission_keys);
assert.deepEqual((await db.query('SELECT id,cash_effect_minor,revenue_effect_minor FROM financial_transactions ORDER BY id')).rows,ledgerBefore);
assert.equal((await db.query('SELECT count(*)::int n FROM financial_transactions WHERE cash_account_id IS NOT NULL OR account_effect_minor<>0')).rows[0].n,0);
fs.writeFileSync(path.join(out,'migration-rehearsal.json'),JSON.stringify({status:'PASS',database,syntheticOnly:true,hashes,checks:['Existing individual denials preserved for new cash template rights','Edited bundle untouched','Original ledger dimensions unchanged','No historical account assignment or guessed opening balance']},null,2));console.log('PASS cash migration preserves existing denials and historical ledger');

}finally{await db.end()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
