"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/input";
import { INVOICE_STATUS, INVOICE_TYPE, type InvoiceStatus, type InvoiceType } from "@/lib/data/types";

export function InvoiceFilters({ clients, status, client, type }: { clients: Array<{ id: string; name: string }>; status: string; client: string; type: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); if (v) n.set(k, v); else n.delete(k); n.delete("new"); router.push(`${pathname}?${n.toString()}`, { scroll: false }); };
  return (
    <div className="flex flex-wrap gap-2">
      <NativeSelect value={status} onChange={(e) => set("status", e.target.value)} className="w-[160px]" aria-label="Statut"><option value="">Tous les statuts</option>{(Object.keys(INVOICE_STATUS) as InvoiceStatus[]).map((s) => <option key={s} value={s}>{INVOICE_STATUS[s]}</option>)}</NativeSelect>
      <NativeSelect value={type} onChange={(e) => set("type", e.target.value)} className="w-[140px]" aria-label="Type"><option value="">Tous types</option>{(Object.keys(INVOICE_TYPE) as InvoiceType[]).map((s) => <option key={s} value={s}>{INVOICE_TYPE[s]}</option>)}</NativeSelect>
      <NativeSelect value={client} onChange={(e) => set("client", e.target.value)} className="w-[180px]" aria-label="Client"><option value="">Tous les clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
    </div>
  );
}
