import {inspectTelegram} from '@/lib/telegram-inspect';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=25;
export async function POST(request:Request){return inspectTelegram(request);}
