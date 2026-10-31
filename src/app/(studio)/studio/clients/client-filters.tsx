"use client";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { HEALTH, SEGMENTS, type PipelineStage } from "@/lib/data/types";

/** Filtres de la liste des clients. Les étapes proposées sont celles du pipeline (personnalisables). */
export function ClientFilters({ stages }: { stages: PipelineStage[] }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); if (v) n.set(k, v); else n.delete(k); n.delete("new"); router.replace(`${pathname}?${n.toString()}`); };
  const hasFilters = ["q", "segment", "stage", "health", "archived"].some((k) => sp.get(k));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input defaultValue={sp.get("q") ?? ""} placeholder="Rechercher un client…" className="pl-8" onChange={(e) => { if (timer.current) clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => set("q", v), 250); }} />
      </div>
      <NativeSelect value={sp.get("segment") ?? ""} onChange={(e) => set("segment", e.target.value)} className="w-auto min-w-[150px]" aria-label="Segment"><option value="">Tous segments</option>{Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
      <NativeSelect value={sp.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)} className="w-auto min-w-[150px]" aria-label="Étape"><option value="">Toutes étapes</option>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</NativeSelect>
      <NativeSelect value={sp.get("health") ?? ""} onChange={(e) => set("health", e.target.value)} className="w-auto min-w-[140px]" aria-label="Santé"><option value="">Toute santé</option>{Object.entries(HEALTH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
      <label className="ml-1 inline-flex items-center gap-2 text-[13px] text-fg-2"><Switch checked={sp.get("archived") === "1"} onCheckedChange={(v) => set("archived", v ? "1" : "")} />Archivés</label>
      {hasFilters ? <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}><X />Réinitialiser</Button> : null}
    </div>
  );
}
