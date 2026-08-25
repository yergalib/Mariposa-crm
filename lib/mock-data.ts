export type InstanceStatus = "AVAILABLE" | "RESERVED" | "RENTED" | "CLEANING" | "REPAIR";

export type ProductInstance = {
  id: string;
  barcode: string;
  status: InstanceStatus;
  note?: string;
};

export type ProductVariant = {
  size: string;
  sku: string;
  rentalPrice: number;
  salePrice: number;
  instances: ProductInstance[];
};

export type Product = {
  id: string;
  name: string;
  supplierModel: string;
  category: string;
  color: string;
  description: string;
  variants: ProductVariant[];
};

const makeInstances = (sku: string, total: number, statuses: InstanceStatus[]): ProductInstance[] =>
  Array.from({ length: total }, (_, i) => ({
    id: `${sku}.${String(i + 1).padStart(3, "0")}`,
    barcode: `${sku}.${String(i + 1).padStart(3, "0")}`,
    status: statuses[i] ?? "AVAILABLE"
  }));

export const products: Product[] = [
  {
    id: "belosnezhka-23156",
    name: "Белоснежка",
    supplierModel: "23156",
    category: "Детские платья",
    color: "Белый",
    description: "Пышное белое платье для аренды и продажи.",
    variants: [
      { size: "110", sku: "0060.110", rentalPrice: 7000, salePrice: 80000, instances: makeInstances("0060.110", 16, ["AVAILABLE","AVAILABLE","RENTED","RESERVED","CLEANING","REPAIR"]) },
      { size: "120", sku: "0060.120", rentalPrice: 7000, salePrice: 80000, instances: makeInstances("0060.120", 12, ["AVAILABLE","AVAILABLE","AVAILABLE","RENTED","RESERVED"]) },
      { size: "130", sku: "0060.130", rentalPrice: 7000, salePrice: 80000, instances: makeInstances("0060.130", 10, ["AVAILABLE","AVAILABLE","AVAILABLE","AVAILABLE"]) },
      { size: "140", sku: "0060.140", rentalPrice: 7000, salePrice: 80000, instances: makeInstances("0060.140", 8, ["AVAILABLE","RESERVED"]) },
      { size: "150", sku: "0060.150", rentalPrice: 7000, salePrice: 80000, instances: makeInstances("0060.150", 5, ["AVAILABLE","AVAILABLE","REPAIR"]) }
    ]
  },
  {
    id: "aurora-8821",
    name: "Аврора",
    supplierModel: "8821",
    category: "Детские платья",
    color: "Розовый",
    description: "Нежно-розовое платье для мероприятий.",
    variants: [
      { size: "110", sku: "0142.110", rentalPrice: 8000, salePrice: 90000, instances: makeInstances("0142.110", 6, ["AVAILABLE","AVAILABLE","RENTED"]) },
      { size: "120", sku: "0142.120", rentalPrice: 8000, salePrice: 90000, instances: makeInstances("0142.120", 7, ["AVAILABLE","RESERVED"]) },
      { size: "130", sku: "0142.130", rentalPrice: 8000, salePrice: 90000, instances: makeInstances("0142.130", 4, ["AVAILABLE"]) }
    ]
  }
];

export function statusLabel(status: InstanceStatus) {
  return {
    AVAILABLE: "Свободно",
    RESERVED: "Бронь",
    RENTED: "В аренде",
    CLEANING: "Химчистка",
    REPAIR: "Ремонт"
  }[status];
}
