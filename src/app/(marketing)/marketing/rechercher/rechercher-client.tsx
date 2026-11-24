"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MK_GROUPS, type MkApp } from "@/lib/marketing/apps";
import type { SearchHit, SearchResults } from "@/lib/marketing/home-server";
import { MK_ICONS } from "@/components/marketing/mk-icon";
import { MkCard, MkEmpty, MkInitials, MkList, MkRoundGrid, MkRoundLink, MkRow, MkSearchField } from "@/components/marketing/ui";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GROUP = Object.fromEntries(MK_GROUPS.map((g) => [g.key, g.title]));

/** Applications dont le nom ou les mots-clés contiennent tous les mots tapés ; celles dont le nom commence par le premier mot d'abord. */
function matchApps(apps: MkApp[], term: string): MkApp[] {
  const words = norm(term).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const starts = (a: MkApp) => (norm(a.label).split(/\s+/).some((w) => w.startsWith(words[0])) ? 0 : 1);
  return apps.filter((a) => { const hay = norm(`${a.label} ${a.words ?? ""}`); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => starts(a) - starts(b)).slice(0, 8);
}

export function SearchView({ q, apps, recommended, results, canSearch }: { q: string; apps: MkApp[]; recommended: MkApp[]; results: SearchResults | null; canSearch: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState(q);
  const [pending, start] = React.useTransition();
  const term = value.trim();
  const go = React.useCallback((t: string) => start(() => router.replace(t ? `/marketing/rechercher?q=${encodeURIComponent(t)}` : "/marketing/rechercher", { scroll: false })), [router]);
  // Anti-rebond : la recherche serveur part 250 ms après la dernière frappe.
  React.useEffect(() => {
    if (term === q) return;
    const t = window.setTimeout(() => go(term), 250);
    return () => window.clearTimeout(t);
  }, [term, q, go]);

  const appHits = React.useMemo(() => matchApps(apps, term), [apps, term]);
  const stale = term !== q || pending;
  const people = (results?.prospects?.length ?? 0) + (results?.contacts?.length ?? 0);
  const total = appHits.length + (stale ? 0 : people);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form role="search" onSubmit={(e) => { e.preventDefault(); if (term !== q) go(term); (document.activeElement as HTMLElement | null)?.blur(); }}
        className="sticky top-16 z-20 -mx-4 -mt-2 bg-surface px-4 pb-3 pt-2 lg:static lg:mx-0 lg:mt-0 lg:bg-transparent lg:px-0 lg:pb-5 lg:pt-0">
        <MkSearchField icon={Search} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Rechercher dans toutes les applications…"
          aria-label="Rechercher dans toutes les applications" autoFocus maxLength={80} enterKeyHint="search" autoComplete="off" spellCheck={false} />
      </form>

      {!term ? (
        <MkCard title="Applications recommandées">
          <MkRoundGrid>{recommended.map((a) => <MkRoundLink key={a.key} href={a.href} icon={MK_ICONS[a.icon]} label={a.label} />)}</MkRoundGrid>
        </MkCard>
      ) : (
        <div className="space-y-5" aria-busy={stale}>
          <p className="sr-only" aria-live="polite">{stale ? "Recherche en cours" : `${total} résultat${total > 1 ? "s" : ""}`}</p>
          {appHits.length ? (
            <Section title="Applications">
              {appHits.map((a) => {
                const Icon = MK_ICONS[a.icon];
                return <MkRow key={a.key} href={a.href} title={a.label} subtitle={GROUP[a.group]}
                  leading={<span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-mk-input bg-surface text-mk-icon"><Icon className="size-5" strokeWidth={1.7} /></span>} />;
              })}
            </Section>
          ) : null}
          {canSearch && term.length < 2 ? <p className="px-1 text-[14px] text-mk-sub">Tape au moins 2 caractères pour chercher aussi dans les prospects et les contacts.</p> : null}
          {term.length >= 2 ? (
            <div className={cn("space-y-5 transition-opacity", stale && "opacity-50")}>
              {results?.prospects?.length ? <People title="Prospects" hits={results.prospects} /> : null}
              {results?.contacts?.length ? <People title="Contacts" hits={results.contacts} /> : null}
            </div>
          ) : null}
          {!stale && !total && term.length >= 1 ? <MkEmpty>Aucun résultat pour « {term} ».</MkEmpty> : null}
          {stale && !appHits.length && !people && term.length >= 2 ? <p className="px-1 text-[14px] text-mk-sub">Recherche…</p> : null}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[15px] font-semibold text-mk-strong">{title}</h2>
      <MkList label={title}>{children}</MkList>
    </section>
  );
}

function People({ title, hits }: { title: string; hits: SearchHit[] }) {
  return (
    <Section title={title}>
      {hits.map((h) => <MkRow key={h.id} href={h.href} title={h.name} subtitle={h.sub || undefined} meta={h.meta} leading={<MkInitials name={h.name} size={44} />} />)}
    </Section>
  );
}
