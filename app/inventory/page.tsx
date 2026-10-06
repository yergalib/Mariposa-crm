import { InventoryView, type InventorySearchParams } from "@/components/InventoryView";

export default function InventoryPage({ searchParams }: { searchParams: InventorySearchParams }) {
  return <InventoryView searchParams={searchParams} />;
}
