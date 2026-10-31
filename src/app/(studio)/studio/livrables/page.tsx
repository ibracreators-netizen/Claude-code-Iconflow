import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, Clock, ExternalLink, FileText, Film, Image as ImageIcon, Plus } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { LIVRABLE_KIND, LIVRABLE_STATUS, type LivrableKind, type LivrableStatus } from "@/lib/data/types";
import { batchLink, batchSummary } from "@/lib/batch";
import { cn, fmt } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { MonthNav } from "@/components/shared/month-nav";
import { BatchStrip } from "@/components/shared/batch-items";
import { FilterBar } from "../_prod/filter-bar";
import { monthParam, nameMap, one, type SP } from "../_prod/params";
import { NewLivrableDialog } from "./livrables-client";

export const metadata: Metadata = { title: "Livrables" };

const KIND_ICON = { video: Film, static: ImageIcon, rush: Clapperboard } as const;

export default async function LivrablesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("livrables");
  const month = monthParam(sp.month);
  const clientFilter = one(sp.client), kindFilter = one(sp.kind) as LivrableKind | "", statusFilter = one(sp.status) as LivrableStatus | "";
  const [clients, livrables, briefs] = await Promise.all([store.clients(), store.livrables({ month }), store.briefs()]);
  const clientName = nameMap(clients, (c) => c.name);
  const briefTitle = nameMap(briefs, (b) => b.title);
  const rows = livrables.filter((l) => (!clientFilter || l.client_id === clientFilter) && (!kindFilter || l.kind === kindFilter) && (!statusFilter || l.status === statusFilter));
  const toReview = livrables.filter((l) => l.status === "en_controle" || l.status === "correction").length;
  const waiting = livrables.filter((l) => l.status === "attente_client").length;
  const newHref = `/studio/livrables?month=${month}&new=1${clientFilter ? `&client=${clientFilter}` : ""}`;

  return (
    <>
      <PageHeader eyebrow="Production" title="Livrables" description="Un livrable = un batch : toutes les vidéos ou visuels d'une livraison derrière un seul lien Frame. Contrôle agence, puis validation client."
        actions={<><MonthNav month={month} /><Link href={newHref} className={buttonVariants()}><Plus />Nouveau batch</Link></>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-2 tabular">{livrables.length} batch{livrables.length > 1 ? "s" : ""} ce mois-ci</span>
          {toReview ? <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning tabular">{toReview} à contrôler</span> : null}
          {waiting ? <span className="rounded-full bg-info/15 px-2.5 py-1 text-info tabular">{waiting} chez le client</span> : null}
        </div>
        <FilterBar filters={[
          { param: "client", label: "Tous les clients", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { param: "kind", label: "Tous les types", options: (Object.keys(LIVRABLE_KIND) as LivrableKind[]).map((k) => ({ value: k, label: LIVRABLE_KIND[k] })) },
          { param: "status", label: "Tous les statuts", options: (Object.keys(LIVRABLE_STATUS) as LivrableStatus[]).map((s) => ({ value: s, label: LIVRABLE_STATUS[s] })) },
        ]} />
      </div>

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Clapperboard} title={livrables.length ? "Aucun batch ne correspond à ces filtres" : "Aucun batch ce mois-ci"} description="Crée un batch : un lien Frame et la liste des vidéos ou visuels livrés. Il passe en contrôle agence avant d'être proposé au client." action={<Link href={newHref} className={buttonVariants({ size: "sm" })}><Plus />Nouveau batch</Link>} /></div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((l) => {
            const Icon = KIND_ICON[l.kind] ?? Clapperboard;
            const items = l.items ?? [];
            const summary = batchSummary(l);
            const link = batchLink(l.file_url);
            const briefName = l.brief_id ? briefTitle[l.brief_id] : undefined;
            return (
              <li key={l.id} className="card group relative flex flex-col overflow-hidden transition hover:border-border-strong">
                <Link href={`/studio/livrables/${l.id}`} className="block after:absolute after:inset-0" aria-label={`Ouvrir ${l.title}`}>
                  <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3">
                    {l.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover" />
                    ) : <Icon className="size-8 text-muted-2 transition group-hover:scale-110 group-hover:text-accent-2" />}
                    <span className="absolute left-2.5 top-2.5 rounded-md bg-bg/70 px-1.5 py-0.5 text-[11px] font-medium text-fg backdrop-blur">{LIVRABLE_KIND[l.kind]}</span>
                    <BatchStrip count={items.length} className="absolute bottom-[17px] left-2.5" />
                    {summary ? <span className="absolute bottom-2.5 right-2.5 rounded-md bg-bg/70 px-1.5 py-0.5 text-[11px] font-medium text-fg backdrop-blur tabular">{summary}</span> : null}
                  </div>
                </Link>
                <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 truncate text-[14px] font-semibold tracking-tight">{l.title}</h3>
                    <StatusBadge kind="livrable" value={l.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
                    <ClientChip name={clientName[l.client_id] ?? "Client"} href={`/studio/clients/${l.client_id}`} className="relative z-10" />
                    <span className="flex shrink-0 items-center gap-1"><Clock className="size-3" />{fmt.relative(l.created_at)}</span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
                    {briefName ? (
                      <Link href={`/studio/briefs/${l.brief_id}`} className="relative z-10 flex min-w-0 items-center gap-1.5 text-[12px] text-muted transition hover:text-accent-2"><FileText className="size-3 shrink-0" /><span className="truncate">{briefName}</span></Link>
                    ) : <span />}
                    {link ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "relative z-10 shrink-0")} title={link.label}>{link.service ?? "Lien"}<ExternalLink /></a>
                    ) : <span className="shrink-0 text-[11.5px] text-muted-2">Pas de lien</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NewLivrableDialog clients={clients.map((c) => ({ id: c.id, name: c.name }))} briefs={briefs.map((b) => ({ id: b.id, title: b.title, client_id: b.client_id }))} defaultMonth={month} defaultClient={clientFilter} defaultBrief={one(sp.brief)} />
    </>
  );
}
