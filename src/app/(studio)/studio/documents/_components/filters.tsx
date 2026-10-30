"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { DOC_KIND, type DocKind } from "@/lib/data/types";

export function DocumentFilters({ clients, client, kind, q }: { clients: Array<{ id: string; name: string }>; client: string; kind: string; q: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp.toString()); Object.entries(patch).forEach(([k, v]) => v ? n.set(k, v) : n.delete(k)); n.delete("new"); router.push(`${pathname}?${n.toString()}`, { scroll: false }); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-[240px]"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input defaultValue={q} placeholder="Rechercher un document…" className="pl-8" onChange={(e) => { const v = e.target.value; window.clearTimeout((window as unknown as { __dq?: number }).__dq); (window as unknown as { __dq?: number }).__dq = window.setTimeout(() => set({ q: v }), 300); }} /></div>
      <NativeSelect value={client} onChange={(e) => set({ client: e.target.value })} className="w-[180px]" aria-label="Client"><option value="">Tous les espaces</option><option value="interne">Interne agence</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
      <NativeSelect value={kind} onChange={(e) => set({ kind: e.target.value })} className="w-[160px]" aria-label="Type"><option value="">Tous les types</option>{(Object.keys(DOC_KIND) as DocKind[]).map((k) => <option key={k} value={k}>{DOC_KIND[k]}</option>)}</NativeSelect>
    </div>
  );
}
