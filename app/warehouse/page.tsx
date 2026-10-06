import { InventoryView, type InventorySearchParams } from "@/components/InventoryView";

export default function WarehousePage({ searchParams }: { searchParams: InventorySearchParams }) {
  return <InventoryView searchParams={searchParams} />;
}
