import Link from "next/link";
import type { AuthContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";

export async function CustomerOrderActivityLink({ session, customerId }: { session: AuthContext; customerId: string }) {
  if (!await hasPermission(session, "CUSTOMER_VIEW") || !await hasPermission(session, "ORDER_VIEW")) return null;
  return <Link className="secondary button-link" href={`/customers/${customerId}/activity`}>История событий</Link>;
}
