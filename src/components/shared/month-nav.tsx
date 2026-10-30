"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { prettyMonth } from "@/lib/data/types";

/** Navigation mensuelle pilotée par ?month=YYYY-MM. */
export function MonthNav({ month, param = "month" }: { month: string; param?: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const go = (delta: number) => {
    const [y, m] = month.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1);
    const next = new URLSearchParams(sp.toString()); next.set(param, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    router.push(`${pathname}?${next.toString()}`);
  };
  const today = new Date(); const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-surface-2 p-1">
      <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="Mois précédent"><ChevronLeft /></Button>
      <span className="min-w-[128px] text-center text-[13px] font-medium capitalize">{prettyMonth(month)}</span>
      <Button variant="ghost" size="icon-sm" onClick={() => go(1)} aria-label="Mois suivant"><ChevronRight /></Button>
      {month !== cur ? <Button variant="ghost" size="sm" onClick={() => { const next = new URLSearchParams(sp.toString()); next.set(param, cur); router.push(`${pathname}?${next.toString()}`); }}>Aujourd&apos;hui</Button> : null}
    </div>
  );
}
