import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "pg";
import type { AuthContext } from "@/lib/auth/session";

const root = path.resolve(process.cwd(), ".."), out = path.join(root, "template-local-evidence");
const manifest = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
assert(manifest.syntheticOnly && /^crm_template_local_\d+$/.test(manifest.database));
assert.equal(process.env.DATABASE_URL, `postgresql://import_test@127.0.0.1:62317/${manifest.database}`);
const pg = new Client({ host: "127.0.0.1", port: 62317, user: "import_test", database: manifest.database });
const org = "e376414e-4e0b-5048-8a62-eda3988bea4a", branch = "02debaff-e940-5380-bafe-b4067864b7fb", otherBranch = "6072e880-f1ae-4dc3-b99a-3979d54dbb0c";
const uuid = () => crypto.randomUUID();
const tests: string[] = [];
async function actor(name: string, keys: string[], organizationId = org, branchId = branch): Promise<AuthContext> {
  const userId=uuid(), membershipId=uuid(), roleId=uuid(), email=`template-${name}@example.invalid`;
  await pg.query("INSERT INTO users(id,email,display_name,password_hash,status,updated_at) VALUES($1,$2,$3,$4,'ACTIVE',now())", [userId,email,`Synthetic ${name}`,"synthetic-sessions-only"]);
  await pg.query("INSERT INTO permission_roles(id,organization_id,name,permission_keys,updated_at) VALUES($1,$2,$3,$4,now())", [roleId,organizationId,`Template ${name}`,keys]);
  await pg.query("INSERT INTO organization_memberships(id,organization_id,user_id,role,status,default_branch_id,permission_role_id,updated_at) VALUES($1,$2,$3,'SELLER','ACTIVE',$4,$5,now())", [membershipId,organizationId,userId,branchId,roleId]);
  await pg.query("INSERT INTO membership_branch_accesses(id,organization_id,membership_id,branch_id) VALUES($1,$2,$3,$4)", [uuid(),organizationId,membershipId,branchId]);
  return { sessionId:uuid(),userId,membershipId,organizationId,organizationName:"Synthetic org",role:"SELLER",defaultBranchId:branchId,defaultBranchName:"Synthetic branch",allowedBranchIds:[branchId],hasOrganizationWideBranchAccess:false,displayName:`Synthetic ${name}`,email,expiresAt:new Date(Date.now()+3600000) };
}
async function operationsFingerprint() {
  const result: Record<string,string> = {};
  for (const table of ["orders","order_items","inventory_movements","financial_transactions","stock_levels","product_instances"]) {
    const rows=(await pg.query(`SELECT row_to_json(t) r FROM ${table} t ORDER BY id`)).rows;
    result[table]=crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  return result;
}
async function main() {
  await pg.connect();
  const { db } = await import("@/lib/db");
  try {
    const service=await import("@/lib/document-templates/service"), catalog=await import("@/lib/document-templates/catalog"), docs=await import("@/lib/orders/documents"), snapshot=await import("@/lib/orders/document-snapshot");
    const editor=await actor("editor",["DOCUMENT_TEMPLATE_VIEW","DOCUMENT_TEMPLATE_MANAGE","ORDER_VIEW","ORDER_EDIT"]);
    const reviewer=await actor("reviewer",["DOCUMENT_TEMPLATE_VIEW","DOCUMENT_TEMPLATE_APPROVE"]);
    const viewer=await actor("viewer",["DOCUMENT_TEMPLATE_VIEW"]);
    const wrong=await actor("wrong-branch",["DOCUMENT_TEMPLATE_VIEW","DOCUMENT_TEMPLATE_MANAGE","DOCUMENT_TEMPLATE_APPROVE"],org,otherBranch);
    const globalEditor=await actor("global-editor",["DOCUMENT_TEMPLATE_VIEW","DOCUMENT_TEMPLATE_MANAGE","DOCUMENT_TEMPLATE_APPROVE","SETTINGS_GLOBAL_MANAGE"]);
    const denied=await actor("denied",[]);
    const foreignBranch=(await pg.query("SELECT id,organization_id FROM branches WHERE organization_id<>$1 AND status='ACTIVE' LIMIT 1",[org])).rows[0];
    assert(foreignBranch);
    const foreign=await actor("foreign",["DOCUMENT_TEMPLATE_VIEW","DOCUMENT_TEMPLATE_MANAGE","DOCUMENT_TEMPLATE_APPROVE"],foreignBranch.organization_id,foreignBranch.id);
    const actors={editor,reviewer,viewer,wrong,globalEditor,denied,foreign};
    const before=await operationsFingerprint();
    const order=(await pg.query("SELECT id FROM orders WHERE organization_id=$1 AND branch_id=$2 AND type='RENTAL' ORDER BY id LIMIT 1",[org,branch])).rows[0];assert(order);
    const v2id=await docs.saveRentalDocument(editor,{orderId:order.id,idempotencyKey:uuid(),baseVersion:0,reason:""});
    const v2=await docs.getRentalDocument(editor,order.id,v2id);assert(v2);assert.equal(v2.schemaVersion,2);
    const parsedV2=snapshot.readRentalSnapshot(v2.snapshot,v2.contentHash,2,2);assert.equal(parsedV2.templateVersion,2);
    const {issuer: _issuer,...legacy}=parsedV2 as Extract<typeof parsedV2,{templateVersion:2}>;
    void _issuer;
    const v1=snapshot.rentalSnapshotSchema.parse({...legacy,schemaVersion:1,templateVersion:1});
    const v1id=uuid(),v1hash=snapshot.rentalSnapshotHash(v1);
    await pg.query("INSERT INTO rental_document_versions(id,organization_id,branch_id,order_id,version,created_by_user_id,schema_version,template_version,snapshot,content_hash,idempotency_key,revision_reason) VALUES($1,$2,$3,$4,2,$5,1,1,$6,$7,$8,$9)",[v1id,org,branch,order.id,editor.userId,JSON.stringify(v1),v1hash,uuid(),"Synthetic legacy fixture"]);
    const oldDocs=(await pg.query("SELECT id,content_hash,snapshot FROM rental_document_versions WHERE id=ANY($1::uuid[]) ORDER BY id",[[v1id,v2id]])).rows;
    const noteInput={branchId:branch,kind:"RENTAL_NOTE",body:"Тестовый текст {{orderReference}}, {{branchName}}. <script>window.__templateInjected=true</script>",baseVersion:0,idempotencyKey:uuid()};
    const results=await Promise.all([service.createTextTemplate(editor,noteInput),service.createTextTemplate(editor,noteInput)]);assert.equal(results[0],results[1]);const noteId=results[0];
    assert.equal((await db.crmTextTemplateVersion.findUniqueOrThrow({where:{id:noteId}})).state,"DRAFT");
    await assert.rejects(()=>service.createTextTemplate(editor,{...noteInput,idempotencyKey:uuid()}));
    await assert.rejects(()=>service.createTextTemplate(editor,{...noteInput,body:"{{unknown}}",baseVersion:1,idempotencyKey:uuid()}));
    await assert.rejects(()=>service.createTextTemplate(editor,{...noteInput,body:"{{issuedQuantity}}",baseVersion:1,idempotencyKey:uuid()}));
    await assert.rejects(()=>service.createTextTemplate(editor,{...noteInput,body:"{{orderReference.toString}}",baseVersion:1,idempotencyKey:uuid()}));
    await assert.rejects(()=>service.createTextTemplate(editor,{...noteInput,branchId:null,idempotencyKey:uuid()}));
    await assert.rejects(()=>service.createTextTemplate(editor,{...noteInput,branchId:foreignBranch.id,idempotencyKey:uuid()}));
    await assert.rejects(()=>service.listTextTemplates(denied));
    const note=await db.crmTextTemplateVersion.findUniqueOrThrow({where:{id:noteId}}), transition={id:noteId,contentHash:note.contentHash};
    await assert.rejects(()=>service.transitionTextTemplate(editor,transition,"APPROVE"));
    await assert.rejects(()=>service.transitionTextTemplate(viewer,transition,"APPROVE"));
    await assert.rejects(()=>service.transitionTextTemplate(wrong,transition,"APPROVE"));
    await assert.rejects(()=>service.transitionTextTemplate(foreign,transition,"APPROVE"));
    assert(!(await service.listTextTemplates(foreign)).versions.some(row=>row.id===noteId));
    assert(!(await service.listTextTemplates(wrong)).versions.some(row=>row.id===noteId));
    assert.equal(reviewer.role,"SELLER");await service.transitionTextTemplate(reviewer,transition,"APPROVE");await service.transitionTextTemplate(reviewer,transition,"APPROVE");
    tests.push("Concurrent idempotent append; stale/version/placeholder rejection; tenant/branch/permission/global guards; configured SELLER explicitly approves without OWNER role gate");
    const v3id=await docs.saveRentalDocument(editor,{orderId:order.id,idempotencyKey:uuid(),baseVersion:2,reason:"Synthetic V3"});
    const v3=await docs.getRentalDocument(editor,order.id,v3id);assert(v3);assert.equal(v3.schemaVersion,3);
    const parsedV3=snapshot.readRentalSnapshot(v3.snapshot,v3.contentHash,3,3);assert.equal(parsedV3.templateVersion,3);if(parsedV3.templateVersion!==3)throw Error("V3");assert.equal(parsedV3.textBlock.templateId,noteId);assert(!parsedV3.textBlock.renderedText.includes("{{"));
    const oldV3=JSON.stringify(v3);
    await assert.rejects(()=>pg.query("UPDATE crm_text_template_versions SET body='Changed' WHERE id=$1",[noteId]));
    await assert.rejects(()=>pg.query("DELETE FROM crm_text_template_versions WHERE id=$1",[noteId]));
    await assert.rejects(()=>pg.query("TRUNCATE crm_text_template_versions"));
    await assert.rejects(()=>pg.query("UPDATE rental_document_versions SET snapshot='{}'::jsonb WHERE id=$1",[v3id]));
    await assert.rejects(()=>pg.query("DELETE FROM rental_document_versions WHERE id=$1",[v1id]));
    const note2id=await service.createTextTemplate(editor,{...noteInput,body:"Новая версия {{orderReference}}",baseVersion:1,idempotencyKey:uuid()});const note2=await db.crmTextTemplateVersion.findUniqueOrThrow({where:{id:note2id}});await service.transitionTextTemplate(reviewer,{id:note2id,contentHash:note2.contentHash},"APPROVE");assert.equal((await db.crmTextTemplateVersion.findUniqueOrThrow({where:{id:noteId}})).state,"ARCHIVED");assert.equal(JSON.stringify(await docs.getRentalDocument(editor,order.id,v3id)),oldV3);
    await service.transitionTextTemplate(editor,{id:note2id,contentHash:note2.contentHash},"ARCHIVE");await assert.rejects(()=>service.transitionTextTemplate(reviewer,{id:note2id,contentHash:note2.contentHash},"APPROVE"));
    const fallbackV2=await docs.saveRentalDocument(editor,{orderId:order.id,idempotencyKey:uuid(),baseVersion:3,reason:"Archived note"});assert.equal((await docs.getRentalDocument(editor,order.id,fallbackV2))?.schemaVersion,2);
    const globalId=await service.createTextTemplate(globalEditor,{branchId:null,kind:"RENTAL_NOTE",body:"Общий информационный текст {{orderReference}}",baseVersion:0,idempotencyKey:uuid()});const globalRow=await db.crmTextTemplateVersion.findUniqueOrThrow({where:{id:globalId}});await assert.rejects(()=>service.transitionTextTemplate(reviewer,{id:globalId,contentHash:globalRow.contentHash},"APPROVE"));await service.transitionTextTemplate(globalEditor,{id:globalId,contentHash:globalRow.contentHash},"APPROVE");const globalV3=await docs.saveRentalDocument(editor,{orderId:order.id,idempotencyKey:uuid(),baseVersion:4,reason:"Global approved note"});const globalDocument=await docs.getRentalDocument(editor,order.id,globalV3);assert(globalDocument);assert.equal((globalDocument.snapshot as {textBlock:{templateId:string}}).textBlock.templateId,globalId);
    tests.push("DB append-only content/no delete/no truncate; archive retains rows; superseding approval archives old content; V3 fixed while later text changes; archived text excluded; global checkbox guard and fallback");
    for(const kind of ["RENTAL_PERIOD","PLANNED_RETURN","SALE_HANDOVER"] as const){await service.createTextTemplate(editor,{branchId:branch,kind,body:catalog.TEMPLATE_DEFAULTS[kind],baseVersion:0,idempotencyKey:uuid()});}assert.equal(await db.crmTextTemplateVersion.count({where:{organizationId:org,kind:{in:["RENTAL_PERIOD","PLANNED_RETURN","SALE_HANDOVER"]},state:{not:"DRAFT"}}}),0);
    const revoke=uuid();await pg.query("INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,updated_at) VALUES($1,$2,$3,'DOCUMENT_TEMPLATE_APPROVE','DENY',now())",[revoke,org,reviewer.membershipId]);try{await assert.rejects(()=>service.transitionTextTemplate(reviewer,{id:globalId,contentHash:globalRow.contentHash},"APPROVE"))}finally{await pg.query("DELETE FROM membership_permission_overrides WHERE id=$1",[revoke])}
    await pg.query("UPDATE organization_memberships SET status='SUSPENDED',updated_at=now() WHERE id=$1",[editor.membershipId]);try{await assert.rejects(()=>service.listTextTemplates(editor))}finally{await pg.query("UPDATE organization_memberships SET status='ACTIVE',updated_at=now() WHERE id=$1",[editor.membershipId])}
    const baseline=JSON.parse(fs.readFileSync(path.join(out,"baseline-role-keys.json"),"utf8")), unchanged=(await pg.query("SELECT id,permission_keys FROM permission_roles WHERE id=ANY($1::uuid[]) ORDER BY id",[baseline.map((r:{id:string})=>r.id)])).rows;assert.deepEqual(unchanged,baseline);
    assert.deepEqual((await pg.query("SELECT id,content_hash,snapshot FROM rental_document_versions WHERE id=ANY($1::uuid[]) ORDER BY id",[[v1id,v2id]])).rows,oldDocs);
    const legacyBaseline=JSON.parse(fs.readFileSync(path.join(out,"baseline-snapshots.json"),"utf8"));for(const old of legacyBaseline){const row=(await pg.query("SELECT id,schema_version,template_version,content_hash,snapshot FROM rental_document_versions WHERE id=$1",[old.id])).rows[0];assert.deepEqual(row,old)}
    const after=await operationsFingerprint();assert.deepEqual(after,before);
    const audit=(await pg.query("SELECT action,entity_id,metadata FROM audit_logs WHERE entity_type='CrmTextTemplateVersion' ORDER BY occurred_at")).rows;assert(audit.length>=8);assert(audit.some(row=>row.action==='TEXT_TEMPLATE_APPROVED'));assert(audit.every(row=>!JSON.stringify(row.metadata).includes('script')&&!JSON.stringify(row.metadata).includes('body')));
    tests.push("Three customer texts remain DRAFT; fresh permission revoke and inactive membership deny; pre-existing permission bundles and V1/V2 snapshots unchanged; existing operational ledger/stock/orders unchanged; content-free audit");
    fs.writeFileSync(path.join(out,"fixture.json"),JSON.stringify({organizationId:org,branchId:branch,orderId:order.id,actors,noteId,note2id,globalId,v1id,v2id,v3id},null,2));fs.writeFileSync(path.join(out,"snapshot-fixtures.json"),JSON.stringify({v1:{snapshot:v1,hash:v1hash},v2, v3},null,2));fs.writeFileSync(path.join(out,"result.json"),JSON.stringify({status:"PASS",syntheticOnly:true,database:manifest.database,ownerSessionUsed:false,tests,operationsUnchanged:true,existingRoleKeysUnchanged:true,oldSnapshotsUnchanged:true,customerDraftsUnapproved:true,productionTouched:false},null,2));console.log(JSON.stringify({status:"PASS",tests}));
  } finally { await db.$disconnect();await pg.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
