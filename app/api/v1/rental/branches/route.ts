import { rentalReadApi } from "@/lib/api/rental-read";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return rentalReadApi(request,"branches"); }
