import {telegramConfig} from '@/lib/assistant/telegram/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  const config=telegramConfig();if(!config)return new Response(null,{status:404});
  try{
    const {requireOwnerDaySession}=await import('@/lib/assistant/owner-day-access');const owner=await requireOwnerDaySession();
    const {db}=await import('@/lib/db');
    const turns=await db.$queryRaw<{id:string;state:string;envelope:unknown;history_reply:unknown;delivery_state:string}[]>`SELECT t.id,t.state,t.envelope,t.history_reply,t.delivery_state
      FROM assistant_telegram_turns t JOIN assistant_telegram_bindings b ON b.id=t.binding_id
      WHERE b.organization_id=${owner.organizationId}::uuid AND b.membership_id=${owner.membershipId}::uuid AND b.bot_id=${config.botId}
      AND b.enabled=true AND b.expires_at>clock_timestamp() AND t.expires_at>clock_timestamp()
      ORDER BY t.created_at DESC LIMIT 10`;
    return Response.json({turns},{headers:{'cache-control':'private, no-store'}});
  }catch{return new Response(null,{status:403});}
}
