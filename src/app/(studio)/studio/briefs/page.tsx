import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus, Trash2 } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { BRIEF_KIND, BRIEF_STATUS, MONTHS_FR, type BriefKind, type BriefStatus } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { MonthNav } from "@/components/shared/month-nav";
import { FilterBar } from "../_prod/filter-bar";
import { monthParam, nameMap, one, todayIso, type SP } from "../_prod/params";
import { KindSegments, NewBriefDialog, RestoreBriefButton, TrashToggle } from "./briefs-client";

export const metadata: Metadata = { title: "Briefs & scripts" };

export default async function BriefsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("briefs");
  const month = monthParam(sp.month);
  const clientFilter = one(sp.client), kindFilter = one(sp.kind) as BriefKind | "", statusFilter = one(sp.status) as BriefStatus | "";
  const showTrash = one(sp.trash) === "1";
  const [clients, profiles, allBriefs] = await Promise.all([store.clients(), store.profiles(), store.briefs({ includeArchived: true })]);
  const clientName = nameMap(clients, (c) => c.name);
  const profileName = nameMap(profiles, (p) => p.display_name ?? p.email ?? "—");
  const year = Number(month.slice(0, 4));
  const today = todayIso();

  const monthRows = allBriefs.filter((b) => b.month.startsWith(month) && (!clientFilter || b.client_id === clientFilter));
  const live = monthRows.filter((b) => b.status !== "archived");
  const trash = monthRows.filter((b) => b.status === "archived");
  const counts = { video: live.filter((b) => b.kind === "video").length, statique: live.filter((b) => b.kind === "statique").length, all: live.length };
  const rows = (showTrash ? trash : live).filter((b) => (!kindFilter || b.kind === kindFilter) && (!statusFilter || b.status === statusFilter));
  const perMonth = MONTHS_FR.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { key, label: label.slice(0, 3), count: allBriefs.filter((b) => b.status !== "archived" && b.month.startsWith(key) && (!clientFilter || b.client_id === clientFilter)).length };
  });
  const pending = live.filter((b) => b.status === "attente_ibra").length;
  const qs = (extra: string) => `/studio/briefs?month=${month}${clientFilter ? `&client=${clientFilter}` : ""}${extra}`;

  return (
    <>
      <PageHeader eyebrow="Production" title="Briefs & scripts" description="Un brief par concept. Contrôle Ibra avant le client, puis validation."
        actions={<><MonthNav month={month} /><Link href={qs("&new=1")} className={buttonVariants()}><Plus />Nouveau brief</Link></>} />

      <div className="card mb-5 flex items-center gap-1 overflow-x-auto p-1.5" aria-label={`Briefs par mois en ${year}`}>
        {perMonth.map((m) => (
          <Link key={m.key} href={`/studio/briefs?month=${m.key}${clientFilter ? `&client=${clientFilter}` : ""}`} className={`flex min-w-[60px] flex-1 flex-col items-center rounded-md px-2 py-1.5 text-[12px] transition ${m.key === month ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
            <span className="font-medium capitalize">{m.label}</span>
            <span className={`tabular ${m.count ? "text-fg-2" : "text-muted-2"}`}>{m.count || "·"}</span>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <KindSegments counts={counts} />
        <FilterBar filters={[
          { param: "client", label: "Tous les clients", options: clients.map((c) => ({ value: c.id, label: c.name })) },
          { param: "status", label: "Tous les statuts", options: (Object.keys(BRIEF_STATUS) as BriefStatus[]).filter((s) => s !== "archived").map((s) => ({ value: s, label: BRIEF_STATUS[s] })) },
        ]}>
          <TrashToggle active={showTrash} count={trash.length} />
        </FilterBar>
      </div>

      {pending && !showTrash ? <p className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning"><span className="size-1.5 rounded-full bg-warning" />{pending} script{pending > 1 ? "s" : ""} en attente de ton contrôle ce mois-ci.</p> : null}

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={showTrash ? Trash2 : FileText} title={showTrash ? "La corbeille est vide" : "Aucun brief ce mois-ci"} description={showTrash ? "Les briefs mis de côté apparaîtront ici, restaurables à tout moment." : "Crée le premier brief du mois : vidéo ou statique, il démarre en rédaction."} action={!showTrash ? <Link href={qs("&new=1")} className={buttonVariants({ size: "sm" })}><Plus />Créer un brief</Link> : null} /></div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <li key={b.id} className="card group relative flex flex-col gap-3 p-4 transition hover:border-border-strong">
              <div className="flex items-start justify-between gap-3">
                <ClientChip name={clientName[b.client_id] ?? "Client"} href={`/studio/clients/${b.client_id}`} className="relative z-10" />
                <StatusBadge kind="brief" value={b.status} />
              </div>
              <Link href={`/studio/briefs/${b.id}`} className="min-w-0 after:absolute after:inset-0 after:rounded-lg">
                <h3 className="truncate text-[15px] font-semibold tracking-tight transition group-hover:text-accent-2">{b.title}</h3>
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                <Badge tone="outline">{BRIEF_KIND[b.kind]}</Badge>
                {b.position ? <span className="tabular">#{String(b.position).padStart(2, "0")}</span> : null}
                <span className="font-mono text-[11px]">script-v{b.script_version}</span>
                {b.due_date ? <span className={b.due_date < today && b.status !== "valide" ? "font-medium text-danger" : ""}>Échéance {fmt.date(b.due_date)}</span> : null}
              </div>
              <div className="mt-auto flex items-center justify-between pt-1 text-[12px] text-muted">
                <span className="flex items-center gap-1.5">{b.assignee_id ? <><Avatar name={profileName[b.assignee_id] ?? "?"} size={18} />{profileName[b.assignee_id]}</> : "Non assigné"}</span>
                <span>{fmt.relative(b.updated_at)}</span>
              </div>
              {showTrash ? <div className="relative z-10"><RestoreBriefButton id={b.id} /></div> : null}
            </li>
          ))}
        </ul>
      )}

      <NewBriefDialog clients={clients.map((c) => ({ id: c.id, name: c.name }))} defaultMonth={month} defaultClient={clientFilter} />
    </>
  );
}
