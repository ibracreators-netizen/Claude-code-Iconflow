import * as React from "react";
import { BrainVisual } from "@/components/shared/brain-visual";
import { cn } from "@/lib/utils";

export interface HeroStat { label: string; value: React.ReactNode; hint?: string; tone?: "neutral" | "accent" | "warning" }

/** En-tête du Brain : chiffres clés à gauche, cerveau en particules à droite. Composant serveur (le visuel est client). */
export function BrainHero({ stats, caption, className }: { stats: HeroStat[]; caption?: string; className?: string }) {
  return (
    <section className={cn("card relative mb-6 overflow-hidden animate-rise", className)}>
      <div className="grid md:grid-cols-[1fr_minmax(240px,38%)]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4 md:self-center">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <p className="truncate text-[12px] font-medium text-muted">{s.label}</p>
              <p className={cn("mt-1 text-[24px] font-semibold leading-none tracking-[-0.03em] tabular", s.tone === "warning" && "text-warning", s.tone === "accent" && "text-accent-2")}>{s.value}</p>
              {s.hint ? <p className="mt-1 truncate text-[11.5px] text-muted-2">{s.hint}</p> : null}
            </div>
          ))}
        </div>
        <div className="relative h-[170px] border-t border-border bg-surface-2/40 md:h-auto md:min-h-[172px] md:border-l md:border-t-0">
          <BrainVisual className="absolute inset-0 size-full" points={2200} />
          {caption ? <p className="pointer-events-none absolute bottom-2.5 right-3 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-2">{caption}</p> : null}
        </div>
      </div>
    </section>
  );
}
