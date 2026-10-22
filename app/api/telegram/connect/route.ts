import {connectTelegram} from '@/lib/assistant/telegram/connect';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=50;
export async function POST(request:Request){return connectTelegram(request);}
export async function GET(request:Request){return connectTelegram(request,fetch,true);}
