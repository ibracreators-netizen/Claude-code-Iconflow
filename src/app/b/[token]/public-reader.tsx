"use client";
import * as React from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export interface ReaderItem { id: string; title: string }

/**
 * Lecture publique d'un brief façon document ClickUp : volet gauche avec la marque, le titre et la liste des
 * concepts (pages) ; à droite, le concept sélectionné. Navigation sans rechargement ; volet repliable sur mobile.
 * Les panneaux sont rendus côté serveur (contenu de chaque concept) et passés ici en tableau de nœuds.
 */
export function PublicBriefReader({ title, kindLabel, scriptVersion, client, items, panels }: {
  title: string; kindLabel: string; scriptVersion: number;
  client: { name: string; logo: string | null } | null;
  items: ReaderItem[]; panels: React.ReactNode[];
}) {
  const [active, setActive] = React.useState(0);
  const [navOpen, setNavOpen] = React.useState(false);
  const multi = items.length > 1;
  const current = items[active] ?? items[0];

  const pageList = (
    <nav aria-label="Concepts du brief" className="flex flex-col gap-0.5">
      {items.map((c, i) => {
        const on = i === active;
        return (
          <button key={c.id} type="button" onClick={() => { setActive(i); setNavOpen(false); }} aria-current={on ? "page" : undefined}
            className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition ${on ? "bg-accent-soft font-semibold text-fg" : "text-fg-2 hover:bg-surface-2"}`}>
            <span className={`mt-0.5 font-mono text-[11px] ${on ? "text-accent-2" : "text-muted-2"}`}>{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 leading-snug">{c.title}</span>
          </button>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        {client ? <><Avatar name={client.name} src={client.logo} size={22} square /><span className="min-w-0 truncate font-medium text-fg-2">{client.name}</span></> : <FileText className="size-4 text-muted" />}
      </div>
      <h1 className="text-[17px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
        <Badge tone="outline">{kindLabel}</Badge>
        <span>v{scriptVersion}</span>
        {multi ? <span>· {items.length} concepts</span> : null}
      </div>
    </div>
  );

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto grid w-full max-w-6xl gap-0 lg:grid-cols-[288px_minmax(0,1fr)]">
        {/* Volet (grand écran) */}
        <aside className="hidden border-r border-border px-4 py-8 lg:block">
          <div className="sticky top-8 flex flex-col gap-5">
            {brand}
            <div>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Concepts</p>
              {pageList}
            </div>
            <a href="https://icon-flow.fr" target="_blank" rel="noopener noreferrer" className="px-2.5 text-[11.5px] text-muted-2 transition hover:text-accent-2">Préparé par icon-flow ↗</a>
          </div>
        </aside>

        <div className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
          {/* En-tête mobile : marque + sélecteur de concept */}
          <div className="mb-6 lg:hidden">
            <div className="mb-3">{brand}</div>
            {multi ? (
              <>
                <button type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] font-medium">
                  <span className="font-mono text-[11px] text-accent-2">{String(active + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-left">{current?.title}</span>
                  <ChevronDown className={`size-4 text-muted transition ${navOpen ? "rotate-180" : ""}`} />
                </button>
                {navOpen ? <div className="mt-2 rounded-xl border border-border bg-surface p-1.5">{pageList}</div> : null}
              </>
            ) : null}
          </div>

          <article className="mx-auto max-w-3xl">
            {multi ? (
              <header className="mb-5 flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[13px] font-semibold text-accent-fg" aria-hidden>{active + 1}</span>
                <h2 className="min-w-0 flex-1 text-[22px] font-semibold tracking-tight">{current?.title}</h2>
                <span className="hidden shrink-0 text-[12px] tabular text-muted sm:block">Concept {active + 1} / {items.length}</span>
              </header>
            ) : null}
            <div className="space-y-5">{panels[active]}</div>

            <footer className="mt-12 flex items-center justify-between gap-3 border-t border-border pt-6 text-[12px] text-muted lg:hidden">
              <span>Partagé via Iconflow Studio</span>
              <a href="https://icon-flow.fr" className="font-medium text-fg-2 transition hover:text-accent-2" target="_blank" rel="noopener noreferrer">icon-flow.fr</a>
            </footer>
          </article>
        </div>
      </div>
    </main>
  );
}
