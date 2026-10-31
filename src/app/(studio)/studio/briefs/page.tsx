import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { BRIEF_STATUS, MONTHS_FR, type BriefKind, type BriefStatus } from "@/lib/data/types";
import { nameMap, monthParam, one, todayIso, type SP } from "../_prod/params";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { MonthNav } from "@/components/shared/month-nav";
import { FilterBar } from "../_prod/filter-bar";
import { KindSegments, NewBriefDialog, TrashToggle } from "./briefs-client";
import { BriefsFolders, type ClientFolder } from "./briefs-folders";
import { BriefsGrid, type BriefCardVM } from "./briefs-grid";

export const metadata: Metadata = { title: "Briefs & scripts" };

export default async function BriefsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("briefs");
  const month = monthParam(sp.month);
  const clientFilter = one(sp.client), kindFilter = one(sp.kind) as BriefKind | "", statusFilter = one(sp.status) as BriefStatus | "";
  const showTrash = one(sp.trash) === "1";
  const [clients, profiles, allBriefs] = await Promise.all([store.clients(), store.profiles(), store.briefs({ includeArchived: true })]);
  const clientName = nameMap(clients, (c) => c.name);
  const clientLogo: Record<string, string | null> = Object.fromEntries(clients.map((c) => [c.id, c.logo_url]));
  const profileName = nameMap(profiles, (p) => p.display_name ?? p.email ?? "—");
  const year = Number(month.slice(0, 4));
  const today = todayIso();

  const monthRows = allBriefs.filter((b) => b.month.startsWith(month) && (!clientFilter || b.client_id === clientFilter));
  const live = monthRows.filter((b) => b.status !== "archived");
  const trash = monthRows.filter((b) => b.status === "archived");
  const counts = { video: live.filter((b) => b.kind === "video").length, statique: live.filter((b) => b.kind === "statique").length, all: live.length };
  const rows = (showTrash ? trash : live).filter((b) => (!kindFilter || b.kind === kindFilter) && (!statusFilter || b.status === statusFilter));
  const conceptCount = await store.conceptCounts(rows.map((b) => b.id));

  // Dossiers par client : chaque client est un dossier, compté sur ses briefs vivants (tous mois confondus).
  const liveAll = allBriefs.filter((b) => b.status !== "archived");
  const base = (clientId: string | null) => {
    const p = new URLSearchParams({ month });
    if (clientId) p.set("client", clientId);
    if (kindFilter) p.set("kind", kindFilter);
    if (statusFilter) p.set("status", statusFilter);
    if (showTrash) p.set("trash", "1");
    return `/studio/briefs?${p.toString()}`;
  };
  const folders: ClientFolder[] = clients
    .map((c) => ({ id: c.id, name: c.name, logo: c.logo_url, count: liveAll.filter((b) => b.client_id === c.id).length, href: base(c.id) }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));

  const perMonth = MONTHS_FR.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { key, label: label.slice(0, 3), count: allBriefs.filter((b) => b.status !== "archived" && b.month.startsWith(key) && (!clientFilter || b.client_id === clientFilter)).length };
  });
  const pending = live.filter((b) => b.status === "attente_ibra").length;
  const newHref = `${base(clientFilter || null)}&new=1`;

  const vms: BriefCardVM[] = rows.map((b) => ({
    id: b.id, title: b.title, href: `/studio/briefs/${b.id}`, clientId: b.client_id, clientName: clientName[b.client_id] ?? "Client", clientLogo: clientLogo[b.client_id] ?? null,
    kind: b.kind, status: b.status, position: b.position, scriptVersion: b.script_version, conceptCount: conceptCount[b.id] ?? 0,
    dueDate: b.due_date, overdue: !!b.due_date && b.due_date < today && b.status !== "valide", assigneeId: b.assignee_id, assigneeName: b.assignee_id ? profileName[b.assignee_id] ?? "?" : null, updatedAt: b.updated_at,
  }));

  return (
    <>
      <PageHeader eyebrow="Production" title="Briefs & scripts" description="Classés par client. Un brief, un ou plusieurs concepts. Contrôle Ibra avant le client, puis validation."
        actions={<><MonthNav month={month} /><Link href={newHref} className={buttonVariants()}><Plus />Nouveau brief</Link></>} />

      <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <BriefsFolders folders={folders} allHref={base(null)} allCount={liveAll.filter((b) => !clientFilter || b.client_id === clientFilter).length} active={clientFilter || null} />

        <div className="min-w-0">
          <div className="card mb-5 flex items-center gap-1 overflow-x-auto p-1.5" aria-label={`Briefs par mois en ${year}`}>
            {perMonth.map((m) => (
              <Link key={m.key} href={base(clientFilter || null).replace(`month=${month}`, `month=${m.key}`)} className={`flex min-w-[56px] flex-1 flex-col items-center rounded-md px-2 py-1.5 text-[12px] transition ${m.key === month ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
                <span className="font-medium capitalize">{m.label}</span>
                <span className={`tabular ${m.count ? "text-fg-2" : "text-muted-2"}`}>{m.count || "·"}</span>
              </Link>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <KindSegments counts={counts} />
            <FilterBar filters={[
              { param: "status", label: "Tous les statuts", options: (Object.keys(BRIEF_STATUS) as BriefStatus[]).filter((s) => s !== "archived").map((s) => ({ value: s, label: BRIEF_STATUS[s] })) },
            ]}>
              <TrashToggle active={showTrash} count={trash.length} />
            </FilterBar>
          </div>

          {pending && !showTrash ? <p className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning"><span className="size-1.5 rounded-full bg-warning" />{pending} script{pending > 1 ? "s" : ""} en attente de ton contrôle ce mois-ci.</p> : null}

          {vms.length === 0 ? (
            <div className="card"><EmptyState icon={showTrash ? Trash2 : FileText} title={showTrash ? "La corbeille est vide" : "Aucun brief ici"} description={showTrash ? "Les briefs mis à la corbeille apparaissent ici, restaurables ou supprimables définitivement." : "Crée le premier brief : vidéo ou statique, il démarre en rédaction."} action={!showTrash ? <Link href={newHref} className={buttonVariants({ size: "sm" })}><Plus />Créer un brief</Link> : null} /></div>
          ) : (
            <BriefsGrid briefs={vms} trash={showTrash} />
          )}
        </div>
      </div>

      <NewBriefDialog clients={clients.map((c) => ({ id: c.id, name: c.name }))} defaultMonth={month} defaultClient={clientFilter} />
    </>
  );
}
