"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/tabs";

export function KindFilter<T extends string>({ value, options, param = "kind" }: { value: T; options: Array<{ value: T; label: string; count?: number }>; param?: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  return <SegmentedControl value={value} options={options} onChange={(v) => { const n = new URLSearchParams(sp.toString()); if (v === "all") n.delete(param); else n.set(param, v); router.push(`${pathname}?${n.toString()}`); }} />;
}
