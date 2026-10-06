import { InventoryView } from "@/components/InventoryView";

export default function WarehousePage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; status?: string | string[]; bulkStock?: string | string[]; bulkPage?: string | string[] }> }) {
  return <InventoryView searchParams={searchParams} />;
}
