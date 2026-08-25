"use client";
import Barcode from "react-barcode";

export function BarcodeClient({ value }: { value: string }) {
  return <div className="barcode-wrap"><Barcode value={value} height={38} width={1.2} fontSize={11} margin={0} /></div>;
}
