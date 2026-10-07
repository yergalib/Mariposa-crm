import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { carryOrderContext } from "./navigation";

// Only presentation context is carried. This never changes command inputs or access.
export async function redirectWithOrderContext(destination: string): Promise<never> {
  const referer = (await headers()).get("referer");
  redirect(carryOrderContext(destination, referer));
}
