"use client";
import { cn } from "@/lib/utils";

/** Choix en segments (« Clair · Sombre · Système »), comme dans les paramètres de LeadConnector. */
export function MkSegmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-mk-chip p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("h-10 rounded-lg text-[15px] font-medium transition", value === o.value ? "bg-surface text-accent-2 shadow-soft" : "text-mk-icon hover:text-mk-strong")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
