import { InventoryView } from "@/components/InventoryView";

export default function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; status?: string | string[] }> }) {
  return <InventoryView searchParams={searchParams} />;
}
