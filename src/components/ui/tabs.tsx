"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.List>) {
  return <T.List className={cn("inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Trigger>) {
  return <T.Trigger className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted transition data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-soft hover:text-fg", className)} {...props} />;
}
export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Content>) {
  return <T.Content className={cn("mt-4 focus:outline-none", className)} {...props} />;
}

/** Onglets « pill » pilotés par URL ou état, sans Radix. */
export function SegmentedControl<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode; count?: number }>; className?: string }) {
  return (
    <div className={cn("inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition", value === o.value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>
          {o.label}
          {o.count !== undefined ? <span className={cn("rounded-full px-1.5 text-[11px] tabular", value === o.value ? "bg-accent-soft text-accent-2" : "bg-surface-3 text-muted")}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
