import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpenText, Clapperboard, ExternalLink, FileText, FolderOpen, MessageSquare, Plus, Receipt } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { allowedModules, type ModuleKey } from "@/lib/permissions";
import { fmt } from "@/lib/utils";
import { BRIEF_KIND, DOC_KIND, LIVRABLE_KIND, SEGMENTS, computeKpis, invoiceTotals } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat, Td, Th, Tr } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { ClientHeaderActions } from "./header-actions";
import { ManagementPanel } from "./management-panel";
import { ContactsPanel } from "./contacts-panel";
import { ClientChart } from "./client-chart";
import { daysAgoIso, weeklySeries } from "../../_lib/insights";

// Chaque onglet dépend d'un module : un membre ne voit que ceux qu'il a.
const TABS = [["apercu", "Aperçu", null], ["contacts", "Contacts", null], ["briefs", "Briefs", "briefs"], ["livrables", "Livrables", "livrables"], ["documents", "Documents", "documents"], ["fichiers", "Fichiers", "fichiers"], ["factures", "Factures", "factures"], ["activite", "Activité", null]] as const;
type Tab = (typeof TABS)[number][0];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const store = await requireAgency("clients"); const c = await store.client(id);
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params; const { tab: rawTab } = await searchParams;
  const store = await requireAgency("clients");
  const allowed = allowedModules(store.session.profile);
  const can = (m: ModuleKey) => allowed.includes(m);
  const tabs = TABS.filter(([, , m]) => !m || can(m));
  const tab: Tab = (tabs.some(([k]) => k === rawTab) ? rawTab : "apercu") as Tab;
  const client = await store.client(id);
  if (!client) notFound();
  const only = <T,>(ok: boolean, load: () => Promise<T[]>) => (ok ? load() : Promise.resolve([] as T[]));
  const [management, contacts, briefs, livrables, documents, files, invoices, activity, messages, metrics, profiles] = await Promise.all([
    store.management(), store.contacts(id), only(can("briefs"), () => store.briefs({ clientId: id, includeArchived: true })), only(can("livrables"), () => store.livrables({ clientId: id })),
    only(can("documents"), () => store.documents({ clientId: id })), only(can("fichiers"), () => store.files({ clientId: id })), only(can("factures"), () => store.invoices({ clientId: id })),
    store.activity({ clientId: id, limit: 30 }), only(can("messages"), () => store.messages(id, 5)), only(can("performance"), () => store.metrics({ clientId: id, from: daysAgoIso(90) })), store.profiles(),
  ]);
  const mgmt = management.find((m) => m.client_id === id) ?? { client_id: id, stage: "onboarding" as const, notes: "", revision: 0, updated_at: client.created_at, updated_by: null };
  const kpi = computeKpis(metrics.filter((m) => m.period_start >= daysAgoIso(35)));
  const owner = profiles.find((p) => p.id === client.owner_id);
  const who = (pid: string | null) => profiles.find((p) => p.id === pid)?.display_name ?? "—";
  const counts: Record<Tab, number | null> = { apercu: null, contacts: contacts.length, briefs: briefs.filter((b) => b.status !== "archived").length, livrables: livrables.length, documents: documents.length, fichiers: files.length, factures: invoices.length, activite: null };
  const href = (t: Tab) => `/studio/clients/${id}${t === "apercu" ? "" : `?tab=${t}`}`;
  const site = client.website ? client.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;

  return (
    <>
      <PageHeader crumbs={[{ label: "Clients", href: "/studio/clients" }, { label: client.name }]}
        title={<span className="flex items-center gap-3"><Avatar name={client.name} src={client.logo_url} size={44} square className="text-[15px]" />{client.name}</span>}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge kind="stage" value={mgmt.stage} /><StatusBadge kind="health" value={client.health} /><Badge tone="outline">{SEGMENTS[client.segment]}</Badge>
          {client.status === "archived" ? <Badge tone="danger">Archivé</Badge> : null}
          <span className="text-muted">{client.sector ?? "Secteur non renseigné"}{client.city ? ` · ${client.city}` : ""}</span>
          {site ? <a href={client.website!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-2 hover:underline">{site}<ExternalLink className="size-3" /></a> : null}
          {owner ? <span className="text-muted">Account : {owner.display_name}</span> : null}
        </span>}
        actions={<ClientHeaderActions client={client} />} />

      <nav className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Sections du client">
        <div className="inline-flex min-w-full items-center gap-1 border-b border-border">
          {tabs.map(([k, label]) => (
            <Link key={k} href={href(k)} aria-current={tab === k ? "page" : undefined} className={`relative flex h-10 shrink-0 items-center gap-1.5 px-3 text-[13.5px] font-medium transition ${tab === k ? "text-fg" : "text-muted hover:text-fg"}`}>
              {label}{counts[k] ? <span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular text-fg-2">{counts[k]}</span> : null}
              {tab === k ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
            </Link>
          ))}
        </div>
      </nav>

      {tab === "apercu" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {can("performance") ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Spend · 30 j" value={fmt.eur(kpi.spend)} hint={`Budget ${fmt.eur(client.monthly_budget)} / mois`} />
              <Stat label="CPA · 30 j" value={kpi.cpa ? fmt.eurCents(kpi.cpa) : "—"} hint={`${fmt.num(kpi.purchases)} achats`} />
              <Stat label="ROAS · 30 j" value={kpi.roas ? `${kpi.roas.toFixed(2).replace(".", ",")}x` : "—"} tone="accent" hint={`Revenu ${fmt.eur(kpi.revenue)}`} />
              <Stat label="Hook rate · 30 j" value={fmt.pct(kpi.hook_rate)} hint={`CTR ${fmt.pct(kpi.ctr)} · CPM ${fmt.eurCents(kpi.cpm)}`} />
            </div> : null}
            {can("performance") ? <Card><CardHeader title="Spend vs revenu attribué" description="12 dernières semaines" action={<Link href={`/studio/performance?client=${id}`} className="text-[13px] font-medium text-accent-2 hover:underline">Performance</Link>} /><CardBody><ClientChart data={weeklySeries(metrics)} /></CardBody></Card> : null}
            {can("briefs") || can("livrables") ? <div className="grid gap-6 lg:grid-cols-2">
              {can("briefs") ? <Card>
                <CardHeader title="Production en cours" action={<Link href={`/studio/briefs?client=${id}`} className="text-[13px] font-medium text-accent-2 hover:underline">Tous les briefs</Link>} />
                <CardBody className="space-y-1">
                  {briefs.filter((b) => b.status !== "archived" && b.status !== "valide").slice(0, 5).map((b) => (
                    <Link key={b.id} href={`/studio/briefs/${b.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-2"><FileText className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate text-[13.5px]">{b.title}</span><StatusBadge kind="brief" value={b.status} /></Link>
                  ))}
                  {!briefs.some((b) => b.status !== "archived" && b.status !== "valide") ? <EmptyState compact title="Aucun brief en cours" action={<Link href={`/studio/briefs?new=1&client=${id}`} className="text-[13px] font-medium text-accent-2 hover:underline">Créer un brief</Link>} /> : null}
                </CardBody>
              </Card> : null}
              {can("livrables") ? <Card>
                <CardHeader title="Derniers livrables" action={<Link href={`/studio/livrables?client=${id}`} className="text-[13px] font-medium text-accent-2 hover:underline">Tous</Link>} />
                <CardBody className="space-y-1">
                  {livrables.slice(0, 5).map((l) => (
                    <Link key={l.id} href={`/studio/livrables/${l.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-2"><Clapperboard className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate text-[13.5px]">{l.title}</span><StatusBadge kind="livrable" value={l.status} /></Link>
                  ))}
                  {!livrables.length ? <EmptyState compact title="Aucun livrable" /> : null}
                </CardBody>
              </Card> : null}
            </div> : null}
          </div>
          <div className="space-y-6">
            <ManagementPanel clientId={id} management={mgmt} updatedBy={mgmt.updated_by ? who(mgmt.updated_by) : null} />
            <Card>
              <CardHeader title="Contrat" description="Modèle payé aux résultats" />
              <CardBody>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13.5px]">
                  <dt className="text-muted">Budget ads / mois</dt><dd className="text-right tabular font-medium">{fmt.eur(client.monthly_budget)}</dd>
                  <dt className="text-muted">Retainer</dt><dd className="text-right tabular font-medium">{fmt.eur(client.retainer)}</dd>
                  <dt className="text-muted">Fee performance</dt><dd className="text-right tabular font-medium">{client.performance_fee_pct} %</dd>
                  <dt className="text-muted">Client depuis</dt><dd className="text-right">{fmt.dateLong(client.created_at)}</dd>
                  <dt className="text-muted">Étape onboarding</dt><dd className="text-right">{client.current_step} / 5</dd>
                </dl>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Contacts" action={<Link href={href("contacts")} className="text-[13px] font-medium text-accent-2 hover:underline">Gérer</Link>} />
              <CardBody className="space-y-2">
                {contacts.slice(0, 3).map((c) => <div key={c.id} className="flex items-center gap-2.5"><Avatar name={c.full_name} size={28} /><div className="min-w-0"><p className="truncate text-[13.5px] font-medium">{c.full_name}{c.is_primary ? <span className="ml-1.5 text-[11px] font-normal text-accent-2">principal</span> : null}</p><p className="truncate text-[12px] text-muted">{c.job_title ?? c.email ?? ""}</p></div></div>)}
                {!contacts.length ? <p className="text-[13px] text-muted">Aucun contact. {client.contact_email ? `Email : ${client.contact_email}` : ""}</p> : null}
              </CardBody>
            </Card>
            {can("messages") ? <Card>
              <CardHeader title="Messagerie" action={<Link href={`/studio/messages?client=${id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-2 hover:underline">Ouvrir<ArrowRight className="size-3.5" /></Link>} />
              <CardBody className="space-y-2">
                {messages.slice(-3).map((m) => <p key={m.id} className="text-[13px]"><span className="font-medium">{who(m.author_id)}</span> <span className="text-muted">· {fmt.relative(m.created_at)}</span><br /><span className="text-fg-2 line-clamp-2">{m.body}</span></p>)}
                {!messages.length ? <p className="text-[13px] text-muted">Aucun message échangé.</p> : null}
              </CardBody>
            </Card> : null}
          </div>
        </div>
      ) : null}

      {tab === "contacts" ? <ContactsPanel clientId={id} contacts={contacts} /> : null}

      {tab === "briefs" ? (
        <Card className="overflow-hidden">
          <CardHeader title="Briefs & scripts" description="Un brief par page, validés par Ibra puis par le client" action={<Link href={`/studio/briefs?new=1&client=${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[13px] font-medium text-accent-fg"><Plus className="size-3.5" />Brief</Link>} />
          {briefs.length ? <table className="w-full text-[13.5px]"><thead><tr><Th>Titre</Th><Th>Type</Th><Th>Mois</Th><Th>Statut</Th><Th>Version</Th><Th>Assigné</Th></tr></thead><tbody>
            {briefs.map((b) => <Tr key={b.id}><Td><Link href={`/studio/briefs/${b.id}`} className="font-medium hover:text-accent-2">{b.title}</Link></Td><Td className="text-fg-2">{BRIEF_KIND[b.kind]}</Td><Td className="text-fg-2 capitalize">{fmt.date(b.month, { month: "long", year: "numeric" })}</Td><Td><StatusBadge kind="brief" value={b.status} /></Td><Td className="tabular text-fg-2">v{b.script_version}</Td><Td className="text-fg-2">{who(b.assignee_id)}</Td></Tr>)}
          </tbody></table> : <EmptyState icon={FileText} title="Aucun brief" description="Crée la première page du mois pour ce client." />}
        </Card>
      ) : null}

      {tab === "livrables" ? (
        <Card className="overflow-hidden">
          <CardHeader title="Livrables" description="Rushs, vidéos montées et statiques" action={<Link href={`/studio/livrables?new=1&client=${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[13px] font-medium text-accent-fg"><Plus className="size-3.5" />Livrable</Link>} />
          {livrables.length ? <table className="w-full text-[13.5px]"><thead><tr><Th>Titre</Th><Th>Type</Th><Th>Mois</Th><Th>Durée</Th><Th>Statut</Th><Th>Ajouté</Th></tr></thead><tbody>
            {livrables.map((l) => <Tr key={l.id}><Td><Link href={`/studio/livrables/${l.id}`} className="font-medium hover:text-accent-2">{l.title}</Link></Td><Td className="text-fg-2">{LIVRABLE_KIND[l.kind]}</Td><Td className="text-fg-2 capitalize">{fmt.date(l.month, { month: "long", year: "numeric" })}</Td><Td className="tabular text-fg-2">{l.duration_sec ? `${l.duration_sec} s` : "—"}</Td><Td><StatusBadge kind="livrable" value={l.status} /></Td><Td className="text-fg-2">{fmt.relative(l.created_at)}</Td></Tr>)}
          </tbody></table> : <EmptyState icon={Clapperboard} title="Aucun livrable" description="Les livrables apparaîtront ici après le premier tournage." />}
        </Card>
      ) : null}

      {tab === "documents" ? (
        <Card className="overflow-hidden">
          <CardHeader title="Documents" description="Stratégie, comptes-rendus, briefs de tournage" action={<Link href={`/studio/documents?new=1&client=${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[13px] font-medium text-accent-fg"><Plus className="size-3.5" />Document</Link>} />
          {documents.length ? <div>{documents.map((d) => <Link key={d.id} href={`/studio/documents/${d.id}`} className="flex items-center gap-3 border-t border-border px-5 py-3 transition first:border-0 hover:bg-surface-2/60"><span className="text-lg leading-none">{d.icon}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{d.title}</span><span className="text-[12px] text-muted">{DOC_KIND[d.kind]} · modifié {fmt.relative(d.updated_at)} · {who(d.author_id)}</span></span>{d.shared_with_client ? <Badge tone="accent">Partagé client</Badge> : <Badge>Interne</Badge>}</Link>)}</div> : <EmptyState icon={BookOpenText} title="Aucun document" description="Rédige la stratégie ou un compte-rendu d'appel." />}
        </Card>
      ) : null}

      {tab === "fichiers" ? (
        <Card className="overflow-hidden">
          <CardHeader title="Fichiers" description={`${files.length} fichiers · ${fmt.compact(files.reduce((a, f) => a + f.size, 0) / 1048576)} Mo`} action={<Link href={`/studio/fichiers?client=${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-surface-2 px-3 text-[13px] font-medium hairline"><FolderOpen className="size-3.5" />Ouvrir l&apos;explorateur</Link>} />
          {files.length ? <table className="w-full text-[13.5px]"><thead><tr><Th>Nom</Th><Th>Dossier</Th><Th className="text-right">Taille</Th><Th>Partage</Th><Th>Ajouté</Th></tr></thead><tbody>
            {files.map((f) => <Tr key={f.id}><Td className="font-medium"><span className="line-clamp-1 font-mono text-[12.5px]">{f.name}</span></Td><Td className="text-fg-2">{f.folder}</Td><Td className="text-right tabular text-fg-2">{f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} Mo` : `${Math.round(f.size / 1024)} Ko`}</Td><Td>{f.shared_with_client ? <Badge tone="accent">Client</Badge> : <Badge>Interne</Badge>}</Td><Td className="text-fg-2">{fmt.relative(f.created_at)}</Td></Tr>)}
          </tbody></table> : <EmptyState icon={FolderOpen} title="Aucun fichier" />}
        </Card>
      ) : null}

      {tab === "factures" ? (
        <Card className="overflow-hidden">
          <CardHeader title="Facturation" description={`Encaissé : ${fmt.eur(invoices.filter((i) => i.status === "payee").reduce((a, i) => a + invoiceTotals(i).ttc, 0))} TTC`} action={<Link href={`/studio/factures?new=1&client=${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[13px] font-medium text-accent-fg"><Plus className="size-3.5" />Facture</Link>} />
          {invoices.length ? <table className="w-full text-[13.5px]"><thead><tr><Th>Numéro</Th><Th>Type</Th><Th>Émise</Th><Th>Échéance</Th><Th className="text-right">TTC</Th><Th>Statut</Th></tr></thead><tbody>
            {invoices.map((i) => <Tr key={i.id}><Td><Link href={`/studio/factures/${i.id}`} className="font-mono text-[12.5px] font-medium hover:text-accent-2">{i.number}</Link></Td><Td className="capitalize text-fg-2">{i.type}</Td><Td className="text-fg-2">{fmt.date(i.issue_date)}</Td><Td className="text-fg-2">{fmt.date(i.due_date)}</Td><Td className="text-right tabular font-medium">{fmt.eurCents(invoiceTotals(i).ttc)}</Td><Td><StatusBadge kind="invoice" value={i.status} /></Td></Tr>)}
          </tbody></table> : <EmptyState icon={Receipt} title="Aucune facture" />}
        </Card>
      ) : null}

      {tab === "activite" ? (
        <div className={can("messages") ? "grid gap-6 lg:grid-cols-[1fr_380px]" : "grid gap-6"}>
          <Card><CardHeader title="Journal d'activité" /><CardBody><Timeline items={activity} /></CardBody></Card>
          {can("messages") ? <Card>
            <CardHeader title="Derniers messages" action={<Link href={`/studio/messages?client=${id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-2 hover:underline"><MessageSquare className="size-3.5" />Ouvrir</Link>} />
            <CardBody className="space-y-3">{messages.map((m) => <div key={m.id} className="flex gap-2.5"><Avatar name={who(m.author_id)} size={26} /><div className="min-w-0"><p className="text-[12px] text-muted"><span className="font-medium text-fg">{who(m.author_id)}</span> · {fmt.relative(m.created_at)}</p><p className="text-[13px] text-fg-2">{m.body}</p></div></div>)}{!messages.length ? <p className="text-[13px] text-muted">Aucun message.</p> : null}</CardBody>
          </Card> : null}
        </div>
      ) : null}
    </>
  );
}
