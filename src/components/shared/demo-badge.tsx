import { Sparkles } from "lucide-react";

/**
 * Badge « Démo » : signale qu'un écran est alimenté par des données fictives
 * (magasin de démonstration), jamais mélangées à des métriques réelles.
 */
export function DemoBadge({ label = "Démo", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-accent-2/30 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-2 ${className}`}
      title="Données de démonstration (fictives) — rien n'est enregistré en production."
    >
      <Sparkles className="size-3" />{label}
    </span>
  );
}
