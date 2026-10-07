import { WarehouseOperationView } from "@/components/WarehouseOperationView";
export default function Page({ searchParams }: { searchParams: Promise<{ ok?: string; q?: string }> }) {
  return <WarehouseOperationView operation="transfers" searchParams={searchParams}/>;
}
