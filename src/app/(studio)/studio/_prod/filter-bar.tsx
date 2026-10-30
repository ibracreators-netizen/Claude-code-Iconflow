"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterDef { param: string; label: string; options: Array<{ value: string; label: string }> }

/** Barre de filtres pilotée par l'URL. */
export function FilterBar({ filters, className, children }: { filters: FilterDef[]; className?: string; children?: React.ReactNode }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const set = (param: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(param, value); else next.delete(param);
    router.push(`${pathname}?${next.toString()}`);
  };
  const active = filters.filter((f) => sp.get(f.param));
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((f) => (
        <NativeSelect key={f.param} aria-label={f.label} value={sp.get(f.param) ?? ""} onChange={(e) => set(f.param, e.target.value)} className={cn("h-8 w-auto min-w-[140px] text-[13px]", sp.get(f.param) && "border-accent/50")}>
          <option value="">{f.label}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
      ))}
      {children}
      {active.length ? <Button variant="ghost" size="sm" onClick={() => { const next = new URLSearchParams(sp.toString()); filters.forEach((f) => next.delete(f.param)); router.push(`${pathname}?${next.toString()}`); }}><X />Effacer</Button> : null}
    </div>
  );
}

/** Lit/écrit un paramètre d'URL (remplacement d'historique). */
export function useUrlParam(param: string) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const value = sp.get(param) ?? "";
  const setValue = (v: string, push = false) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(param, v); else next.delete(param);
    const url = `${pathname}${next.toString() ? `?${next}` : ""}`;
    if (push) router.push(url); else router.replace(url);
  };
  return [value, setValue] as const;
}

/** Ouvre/ferme un dialogue via ?new=1 sans polluer l'historique. */
export function useUrlFlag(flag = "new") {
  const [value, setValue] = useUrlParam(flag);
  return [value === "1", (o: boolean) => setValue(o ? "1" : "")] as const;
}
