"use client";
import { Printer } from "lucide-react";
export function PrintButton() {
  return <button onClick={() => window.print()} className="no-print inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b0f14] px-4 text-sm font-medium text-white shadow hover:bg-black"><Printer className="size-4" />Imprimer / Enregistrer en PDF</button>;
}
