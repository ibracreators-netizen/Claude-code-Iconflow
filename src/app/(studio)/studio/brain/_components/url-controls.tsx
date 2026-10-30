"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function useSetParams() {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  return useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => { if (v === null || v === "") next.delete(k); else next.set(k, v); });
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, sp]);
}

export function ScopeSwitch({ scope }: { scope: "client" | "agence" }) {
  const set = useSetParams();
  const opts: Array<{ value: "client" | "agence"; label: string }> = [{ value: "client", label: "Brain client" }, { value: "agence", label: "Brain agence" }];
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1" role="tablist">
      {opts.map((o) => (
        <button key={o.value} role="tab" aria-selected={scope === o.value} onClick={() => set({ scope: o.value, q: null, kind: null, cat: null })}
          className={cn("inline-flex h-7 items-center rounded-md px-3 text-[13px] font-medium transition", scope === o.value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>{o.label}</button>
      ))}
    </div>
  );
}

export function ClientSelector({ clients, value }: { clients: Array<{ id: string; name: string; sector: string | null }>; value: string }) {
  const set = useSetParams();
  return (
    <NativeSelect value={value} onChange={(e) => set({ client: e.target.value })} className="w-[260px] font-medium" aria-label="Client">
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sector ? ` · ${c.sector}` : ""}</option>)}
    </NativeSelect>
  );
}

export function SearchParam({ param = "q", placeholder, defaultValue, className }: { param?: string; placeholder: string; defaultValue?: string; className?: string }) {
  const set = useSetParams();
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input defaultValue={defaultValue} placeholder={placeholder} className="pl-8" onChange={(e) => { const v = e.target.value; window.clearTimeout((window as unknown as { __sp?: number }).__sp); (window as unknown as { __sp?: number }).__sp = window.setTimeout(() => set({ [param]: v }), 300); }} />
    </div>
  );
}

export function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition", active ? "border-accent/40 bg-accent-soft text-fg" : "border-border bg-surface text-fg-2 hover:border-border-strong hover:text-fg")}>
      {children}{count !== undefined ? <span className={cn("rounded-full px-1.5 text-[11px] tabular", active ? "bg-accent text-accent-fg" : "bg-surface-3 text-muted")}>{count}</span> : null}
    </button>
  );
}
