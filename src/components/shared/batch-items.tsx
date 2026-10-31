import type { ReactNode } from "react";
import { ExternalLink, Frame, Link2 } from "lucide-react";
import type { LivrableItem, LivrableKind } from "@/lib/data/types";
import { batchLink, fmtDuration, itemsLabel, totalDuration } from "@/lib/batch";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Affichage d'un batch, côté agence comme côté client : le lien unique (Frame) et la liste des éléments.
 * Composants sans état, utilisables dans les Server Components.
 */

/** Bandeau du lien unique du batch : service, adresse et bouton « Ouvrir dans Frame ». */
export function BatchLinkBand({ url, empty, action, className }: { url: string | null; empty?: ReactNode; action?: ReactNode; className?: string }) {
  const link = batchLink(url);
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3 hairline", className)}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface hairline", link ? "text-accent-2" : "text-muted-2")} aria-hidden>
        <Frame className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{link?.service ? `Lien ${link.service}` : "Lien du batch"}</p>
        {link ? <p className="truncate font-mono text-[12.5px] text-fg-2" title={link.href}>{link.display}</p> : <p className="text-[13px] text-muted">{empty ?? "Aucun lien renseigné."}</p>}
      </div>
      {link ? (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), "w-full sm:w-auto")}>{link.label}<ExternalLink /></a>
      ) : action ?? null}
    </div>
  );
}

/** Liste numérotée des éléments du batch, avec durées et total. */
export function BatchItemsList({ items, kind, className, emptyText }: { items: LivrableItem[]; kind: LivrableKind; className?: string; emptyText?: string }) {
  if (!items.length) return <p className={cn("text-[13px] text-muted", className)}>{emptyText ?? "Aucun élément listé pour l'instant."}</p>;
  const total = totalDuration(items);
  return (
    <div className={className}>
      <ol className="divide-y divide-border">
        {items.map((it, i) => {
          const link = batchLink(it.url);
          return (
            <li key={`${i}-${it.name}`} className="flex items-center gap-3 py-2.5 text-[13.5px]">
              <span className="w-6 shrink-0 font-mono text-[11.5px] text-muted tabular">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate font-medium" title={it.name}>{it.name}</span>
              {link ? <a href={link.href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted transition hover:text-accent-2" aria-label={`Ouvrir ${it.name}`}><Link2 className="size-3.5" /></a> : null}
              <span className="w-12 shrink-0 text-right font-mono text-[12px] text-muted tabular">{it.duration_sec ? fmtDuration(it.duration_sec) : "—"}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2.5 text-[12.5px] text-muted">
        <span>{itemsLabel(kind, items.length)}</span>
        {total ? <span className="font-mono tabular">Total {fmtDuration(total)}</span> : null}
      </div>
    </div>
  );
}

/** Petite « bande film » : un trait par élément (6 au plus), pour les cartes. */
export function BatchStrip({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cn("flex items-center gap-0.5", className)} aria-hidden>
      {Array.from({ length: Math.min(count, 6) }).map((_, i) => <span key={i} className="h-1.5 w-3.5 rounded-[2px] bg-fg/25" />)}
      {count > 6 ? <span className="ml-1 text-[10px] font-medium text-muted">+{count - 6}</span> : null}
    </span>
  );
}
