import type {AuthContext} from "@/lib/auth/session";
import {hasPermission} from "@/lib/permissions/effective";
import {workflowOptions} from "@/lib/workspace/conversion";
import {assignOrderAction} from "@/app/workspace/actions";
export async function OrderAssignee({order,session}:{order:{id:string;branchId:string;assignedMembershipId:string|null;assignedTo:{user:{displayName:string}}|null};session:AuthContext}){
 const edit=await hasPermission(session,"ORDER_EDIT"),assign=await hasPermission(session,"ORDER_ASSIGN");
 const options=edit&&(assign||!order.assignedMembershipId)?await workflowOptions(session,"ORDER_VIEW",order.branchId):null;
 return <section className="card"><h2>Ответственный</h2><p>{order.assignedTo?.user.displayName??"Не назначен"}</p>{options&&<form action={assignOrderAction}><input type="hidden" name="orderId" value={order.id}/><label>Сотрудник<select name="assignedMembershipId" defaultValue={order.assignedMembershipId??session.membershipId}>{assign&&<option value="">Не назначен</option>}{options.members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><button className="secondary">Назначить</button></form>}</section>;
}
