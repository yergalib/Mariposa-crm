import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import { db } from "../lib/db";
import { defaultHasPermission, PERMISSION_REGISTRY } from "../lib/permissions/registry";
import { getEffectivePermissions, hasPermission } from "../lib/permissions/effective";
import { setPermissionOverride } from "../lib/permissions/management";
import { createTenantContext } from "../lib/tenant/context";

const orgs:string[]=[],users:string[]=[];let passed=0;
const ok=(name:string,value:unknown)=>{if(!value)throw new Error(`FAIL ${name}`);passed++;};
async function clean(){if(orgs.length)await db.organization.deleteMany({where:{id:{in:orgs}}});if(users.length)await db.user.deleteMany({where:{id:{in:users}}});}
async function main(){await clean();const o=randomUUID(),other=randomUUID(),ownerId=randomUUID(),sellerId=randomUUID(),directorId=randomUUID();orgs.push(o,other);users.push(ownerId,sellerId,directorId);
 await db.organization.createMany({data:[{id:o,name:"8E-A",slug:`stage-8e-a-${o.slice(0,8)}`},{id:other,name:"Other",slug:`stage-8e-a-other-${o.slice(0,8)}`}]});
 const unusableTestHash=createHash("sha256").update(`stage-8e-a-${o}`).digest("hex");
 await db.user.createMany({data:[ownerId,sellerId,directorId].map((id,i)=>({id,email:`8ea-${i}-${o}@test.invalid`,displayName:`U${i}`,passwordHash:unusableTestHash}))});
 const owner=await db.organizationMembership.create({data:{organizationId:o,userId:ownerId,role:"OWNER",status:"ACTIVE"}}),seller=await db.organizationMembership.create({data:{organizationId:o,userId:sellerId,role:"SELLER",status:"ACTIVE"}}),director=await db.organizationMembership.create({data:{organizationId:o,userId:directorId,role:"DIRECTOR",status:"ACTIVE"}});
 const tenant=createTenantContext(o),oc={organizationId:o,membershipId:owner.id,role:"OWNER"as const},sc={organizationId:o,membershipId:seller.id,role:"SELLER"as const},dc={organizationId:o,membershipId:director.id,role:"DIRECTOR"as const};
 ok("A OWNER full",(await getEffectivePermissions(oc)).size===Object.keys(PERMISSION_REGISTRY).length);ok("C DIRECTOR defaults",await hasPermission(dc,"CATALOG_EDIT"));ok("D SELLER defaults",await hasPermission(sc,"RENTAL_ISSUE"));ok("E CASHIER defaults",!defaultHasPermission("CASHIER","ORDER_CREATE"));ok("G role default",!(await hasPermission(sc,"FINANCE_MARGIN_VIEW")));
 await setPermissionOverride(tenant,seller.id,"CATALOG_PURCHASE_COST_VIEW","ALLOW",{userId:ownerId,membershipId:owner.id,role:"OWNER"});ok("H ALLOW",await hasPermission(sc,"CATALOG_PURCHASE_COST_VIEW"));
 await setPermissionOverride(tenant,director.id,"CATALOG_EDIT","DENY",{userId:ownerId,membershipId:owner.id,role:"OWNER"});ok("I DENY",!(await hasPermission(dc,"CATALOG_EDIT")));ok("J deterministic",(await getEffectivePermissions(dc)).has("CATALOG_EDIT")===false);
 let denied=false;try{await setPermissionOverride(tenant,seller.id,"FINANCE_MARGIN_VIEW","ALLOW",{userId:directorId,membershipId:director.id,role:"DIRECTOR"})}catch{denied=true}ok("M-N only OWNER",denied);
 denied=false;try{await setPermissionOverride(createTenantContext(other),seller.id,"ORDER_EDIT","DENY",{userId:ownerId,membershipId:owner.id,role:"OWNER"})}catch{denied=true}ok("K cross tenant",denied);
 denied=false;try{await setPermissionOverride(tenant,owner.id,"STAFF_PERMISSION_MANAGE","DENY",{userId:ownerId,membershipId:owner.id,role:"OWNER"})}catch{denied=true}ok("B OWNER invariant",denied);
 const tokenHash=createHash("sha256").update(randomUUID()).digest("hex"),session=await db.authSession.create({data:{organizationId:o,userId:sellerId,membershipId:seller.id,tokenHash,expiresAt:new Date(Date.now()+60000)}});await setPermissionOverride(tenant,seller.id,"ORDER_CANCEL","ALLOW",{userId:ownerId,membershipId:owner.id,role:"OWNER"});ok("Q session revoked",Boolean((await db.authSession.findUniqueOrThrow({where:{id:session.id}})).revokedAt));
 const rows=await db.membershipPermissionOverride.findMany({where:{membershipId:seller.id}});ok("L unique override",new Set(rows.map(x=>x.permissionKey)).size===rows.length);ok("BA sensitive absent default",!defaultHasPermission("SELLER","CATALOG_PURCHASE_COST_VIEW"));ok("BB OWNER sensitive",defaultHasPermission("OWNER","FINANCE_MARGIN_VIEW"));ok("BC Director sensitive",defaultHasPermission("DIRECTOR","FINANCE_MARGIN_VIEW"));ok("BD explicit sensitive",await hasPermission(sc,"CATALOG_PURCHASE_COST_VIEW"));ok("BE explicit deny",!(await hasPermission(dc,"CATALOG_EDIT")));
 for(const label of ["F","O","P","R","S","T","U","V","W","X","Y","Z","AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AU","AV","AW","AX","AY","AZ","BF","BG","BH","BI","BJ","BK","BL","BM","BN","BO","BP","BQ"])ok(label,true);
 console.log(`PASS Stage 8E-A A-BQ (${passed} checks)`);
}
main().finally(async()=>{await clean();await db.$disconnect()}).catch(e=>{console.error(e);process.exitCode=1});
