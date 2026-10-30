import Link from "next/link";
import { ArrowRight, CheckSquare, Clapperboard, FileText, Inbox, Receipt } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { allowedModules, type ModuleKey } from "@/lib/permissions";
import { fmt } from "@/lib/utils";
import { BRIEF_KIND, LIVRABLE_KIND, invoiceTotals } from "@/lib/data/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { toTreat } from "../_lib/insights";

export const metadata = { title: "À traiter" };

function Row({ href, title, meta, right }: { href: string; title: string; meta: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-4 border-t border-border px-5 py-3 transition hover:bg-surface-2/60 first:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">{meta}</div>
      </div>
      {right}
      <ArrowRight className="size-4 text-muted-2 transition group-hover:translate-x-0.5 group-hover:text-fg" />
    </Link>
  );
}

export default async function InboxPage() {
  const store = await requireAgency("inbox");
  const allowed = allowedModules(store.session.profile);
  const can = (m: ModuleKey) => allowed.includes(m);
  const only = <T,>(ok: boolean, load: () => Promise<T[]>) => (ok ? load() : Promise.resolve([] as T[]));
  const [clients, briefs, livrables, tasks, invoices, profiles] = await Promise.all([
    store.clients({ includeArchived: true }), only(can("briefs"), () => store.briefs()), only(can("livrables"), () => store.livrables()),
    only(can("taches"), () => store.tasks()), only(can("factures"), () => store.invoices()), store.profiles(),
  ]);
  const todo = toTreat(briefs, livrables, tasks, invoices);
  const name = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "—";
  const who = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? null;

  // Seules les files des modules attribués apparaissent : la file d'un membre est la sienne.
  const sections = [
    { module: "briefs" as const, icon: FileText, title: "Scripts à contrôler", hint: "Contrôle Ibra avant présentation au client", items: todo.briefs, render: (b: typeof todo.briefs[number]) => <Row key={b.id} href={`/studio/briefs/${b.id}`} title={b.title} meta={<><ClientChip name={name(b.client_id)} size={16} /><span>{BRIEF_KIND[b.kind]}</span>{b.due_date ? <span>Échéance {fmt.date(b.due_date)}</span> : null}</>} right={<StatusBadge kind="brief" value={b.status} />} /> },
    { module: "livrables" as const, icon: Clapperboard, title: "Livrables à contrôler", hint: "En contrôle agence ou correction demandée", items: todo.livrables, render: (l: typeof todo.livrables[number]) => <Row key={l.id} href={`/studio/livrables/${l.id}`} title={l.title} meta={<><ClientChip name={name(l.client_id)} size={16} /><span>{LIVRABLE_KIND[l.kind]}</span><span>{fmt.relative(l.updated_at)}</span></>} right={<StatusBadge kind="livrable" value={l.status} />} /> },
    { module: "taches" as const, icon: CheckSquare, title: "Tâches en retard", hint: "Échéance dépassée ou aujourd'hui", items: todo.tasks, render: (t: typeof todo.tasks[number]) => <Row key={t.id} href="/studio/taches" title={t.title} meta={<>{t.client_id ? <ClientChip name={name(t.client_id)} size={16} /> : <span>Interne</span>}{who(t.assignee_id) ? <span>{who(t.assignee_id)}</span> : null}<span className="text-danger">Échéance {fmt.date(t.due_date!)}</span></>} right={<StatusBadge kind="priority" value={t.priority} />} /> },
    { module: "factures" as const, icon: Receipt, title: "Factures en retard", hint: "Échéance dépassée, paiement non reçu", items: todo.invoices, render: (i: typeof todo.invoices[number]) => <Row key={i.id} href={`/studio/factures/${i.id}`} title={`${i.number} · ${fmt.eurCents(invoiceTotals(i).ttc)} TTC`} meta={<><ClientChip name={name(i.client_id)} size={16} /><span className="text-danger">Échue le {fmt.date(i.due_date)}</span></>} right={<StatusBadge kind="invoice" value={i.status === "envoyee" ? "en_retard" : i.status} />} /> },
  ].filter((s) => can(s.module));
  const total = sections.reduce((a, s) => a + s.items.length, 0);

  return (
    <>
      <PageHeader eyebrow="File de traitement" title="À traiter" description={total ? `${total} élément${total > 1 ? "s" : ""} attendent une décision ou une action de l'agence.` : "File vide. Rien n'attend ton intervention."} />
      {!total ? <Card><EmptyState icon={Inbox} title="Tout est à jour" description={sections.length ? "Les éléments de tes modules sont sous contrôle." : "Aucun module de production n'est attribué à ton compte."} /></Card> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        {sections.filter((s) => s.items.length).map((s) => (
          <Card key={s.title} className="overflow-hidden">
            <CardHeader title={<span className="inline-flex items-center gap-2"><s.icon className="size-4 text-muted" />{s.title}<Badge tone="accent">{s.items.length}</Badge></span>} description={s.hint} />
            <div>{(s.items as never[]).map((it) => (s.render as (x: never) => React.ReactNode)(it))}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
