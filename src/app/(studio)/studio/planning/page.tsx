import type { Metadata } from "next";
import { requireAgency } from "@/lib/auth/session";
import { canAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { MonthNav } from "@/components/shared/month-nav";
import { monthParam, nameMap, one, type SP } from "../_prod/params";
import { PlanningCalendar, type PlanItem } from "./planning-calendar";

export const metadata: Metadata = { title: "Planning" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("planning");
  const month = monthParam(sp.month);
  const [y, m] = month.split("-").map(Number);
  const gridStart = new Date(y, m - 1, 1); gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 42);
  const horizon = new Date(); horizon.setDate(horizon.getDate() + 14);
  const from = new Date(Math.min(gridStart.getTime(), new Date().getTime() - 86400000)).toISOString();
  const to = new Date(Math.max(gridEnd.getTime(), horizon.getTime())).toISOString();

  const me = store.session.profile;
  const [events, briefs, livrables, tasks, clients] = await Promise.all([
    store.events({ from, to }), canAccess(me, "briefs") ? store.briefs() : [], canAccess(me, "livrables") ? store.livrables() : [], canAccess(me, "taches") ? store.tasks() : [], store.clients(),
  ]);
  const clientName = nameMap(clients, (c) => c.name);

  // Chaque élément mène à sa page : lien de l'événement, sinon fiche client ; brief, livrable, tâche.
  const items: PlanItem[] = [
    ...events.map((e) => ({ id: e.id, date: e.starts_at.slice(0, 10), time: e.starts_at.slice(11, 16), title: e.title, kind: e.kind, source: "event" as const, clientName: e.client_id ? clientName[e.client_id] : undefined, href: e.link ?? (e.client_id && canAccess(me, "clients") ? `/studio/clients/${e.client_id}` : null), notes: e.notes, endsAt: e.ends_at })),
    ...briefs.filter((b) => b.due_date && b.status !== "valide").map((b) => ({ id: `b-${b.id}`, date: b.due_date!, title: `Script · ${b.title}`, kind: "deadline" as const, source: "brief" as const, clientName: clientName[b.client_id], href: `/studio/briefs/${b.id}`, notes: null, endsAt: null })),
    ...livrables.filter((l) => l.status !== "valide").map((l) => ({ id: `l-${l.id}`, date: l.created_at.slice(0, 10), title: `Livrable · ${l.title}`, kind: "livraison" as const, source: "livrable" as const, clientName: clientName[l.client_id], href: `/studio/livrables/${l.id}`, notes: null, endsAt: null })),
    ...tasks.filter((t) => t.due_date && t.status !== "termine").map((t) => ({ id: `t-${t.id}`, date: t.due_date!, title: `Tâche · ${t.title}`, kind: "deadline" as const, source: "task" as const, clientName: t.client_id ? clientName[t.client_id] : undefined, href: `/studio/taches?task=${t.id}`, notes: null, endsAt: null })),
  ];

  return (
    <>
      <PageHeader eyebrow="Production" title="Planning" description="Tournages, appels, livraisons, deadlines de scripts et de tâches. Un clic sur un élément ouvre sa page." actions={<MonthNav month={month} />} />
      <PlanningCalendar month={month} items={items} clients={clients.map((c) => ({ id: c.id, name: c.name }))} selected={one(sp.day)} />
    </>
  );
}
