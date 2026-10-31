import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, LineChart } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { computeKpis, LIVRABLE_KIND, prettyMonth } from "@/lib/data/types";
import { batchSummary, itemsLabel } from "@/lib/batch";
import { fmt } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { TrendChart } from "@/components/shared/charts";
import { BatchItemsList, BatchLinkBand } from "@/components/shared/batch-items";
import { nameMap } from "../../_prod/params";
import { CommentsThread, LivrablePreview, LivrableStatusCard, EditLivrableButton } from "./livrable-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const store = await requireAgency("livrables");
  const l = await store.livrable(id);
  return { title: l ? l.title : "Livrable" };
}

export default async function LivrablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireAgency("livrables");
  const l = await store.livrable(id);
  if (!l) notFound();
  const [client, profiles, comments, validations, metrics, briefs] = await Promise.all([
    store.client(l.client_id), store.profiles(), store.livrableComments(l.id), store.validations(l.client_id), store.metrics({ clientId: l.client_id }), store.briefs({ clientId: l.client_id }),
  ]);
  const profileName = nameMap(profiles, (p) => p.display_name ?? p.email ?? "Compte");
  const brief = l.brief_id ? briefs.find((b) => b.id === l.brief_id) ?? null : null;
  const briefOptions = briefs.map((b) => ({ id: b.id, title: b.title, client_id: b.client_id }));
  const decisions = validations.filter((v) => v.item_ref === l.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const mine = metrics.filter((m) => m.livrable_id === l.id);
  const kpis = computeKpis(mine);
  const chart = mine.map((m) => ({ label: fmt.date(m.period_start), spend: m.spend, revenue: m.revenue }));
  const items = l.items ?? [];
  const summary = batchSummary(l);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Livrables", href: `/studio/livrables?month=${l.month.slice(0, 7)}` }, { label: prettyMonth(l.month) }, { label: l.title }]}
        title={<span className="flex flex-wrap items-center gap-3">{l.title}<StatusBadge kind="livrable" value={l.status} /></span>}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><Badge tone="outline">{LIVRABLE_KIND[l.kind]}</Badge>{summary ? <span className="tabular">{summary}</span> : null}<span>Ajouté {fmt.relative(l.created_at)}</span>{client ? <ClientChip name={client.name} logo={client.logo_url} href={`/studio/clients/${client.id}`} /> : null}</span>}
        actions={<><EditLivrableButton livrable={l} briefs={briefOptions} /><Link href={`/studio/livrables?month=${l.month.slice(0, 7)}&client=${l.client_id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowLeft />Tous les livrables</Link></>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Contenu du batch" description={items.length ? `${itemsLabel(l.kind, items.length)} derrière un seul lien : c'est exactement ce que le client voit.` : "Un seul lien pour toute la livraison. Liste ici les vidéos ou visuels qu'il contient : le client voit la même liste."} />
            <CardBody className="space-y-4">
              <BatchLinkBand url={l.file_url} empty="Aucun lien pour l'instant : le client n'a rien à ouvrir." action={<EditLivrableButton livrable={l} briefs={briefOptions} label="Ajouter le lien" />} />
              <BatchItemsList items={items} kind={l.kind} emptyText="Aucun élément listé. Ajoute les vidéos ou visuels du batch via « Modifier »." />
            </CardBody>
          </Card>

          <LivrablePreview url={l.file_url} title={l.title} />

          <Card>
            <CardHeader title="Échanges" description="Commentaires visibles par l'agence et le client." />
            <CardBody><CommentsThread livrableId={l.id} comments={comments.map((c) => ({ ...c, authorName: c.author ? profileName[c.author] ?? "Compte" : "Compte" }))} meId={store.session.user.id} /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Performance" description={mine.length ? `${mine.length} semaine${mine.length > 1 ? "s" : ""} de données` : "Aucune métrique saisie pour ce batch."} action={<Link href={`/studio/performance?client=${l.client_id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}><LineChart />Performance</Link>} />
            {mine.length ? (
              <CardBody>
                <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[["Dépense", fmt.eur(kpis.spend)], ["ROAS", `${kpis.roas.toFixed(2)}x`], ["CPA", fmt.eurCents(kpis.cpa)], ["Hook rate", fmt.pct(kpis.hook_rate)]].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface-2 px-3 py-2"><dt className="text-[11.5px] text-muted">{k}</dt><dd className="text-[16px] font-semibold tabular">{v}</dd></div>
                  ))}
                </dl>
                <TrendChart data={chart} series={[{ key: "spend", label: "Dépense" }, { key: "revenue", label: "CA attribué" }]} height={180} format="eurCompact" />
              </CardBody>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <LivrableStatusCard livrable={l} />

          <Card>
            <CardHeader title="Décisions client" description={decisions.length ? `${decisions.length} décision${decisions.length > 1 ? "s" : ""} sur ce batch` : "Aucune décision enregistrée."} />
            {decisions.length ? (
              <CardBody>
                <ol className="space-y-3">
                  {decisions.map((v) => (
                    <li key={v.id} className="flex items-start gap-3 text-[13px]">
                      <StatusBadge kind="livrable" value={v.decision} />
                      <div className="min-w-0 flex-1">
                        <p className="text-fg-2">{v.decided_by ? profileName[v.decided_by] ?? "Compte" : "Auteur non disponible"} · {fmt.dateTime(v.created_at)}</p>
                        {v.comment ? <p className="mt-1 rounded-md bg-surface-2 px-2.5 py-1.5 text-fg-2">« {v.comment} »</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Brief d'origine" />
            {brief ? (
              <CardBody className="pt-0">
                <Link href={`/studio/briefs/${brief.id}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-[13px] transition hover:border-border-strong hover:bg-surface-2">
                  <FileText className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate font-medium">{brief.title}</span><StatusBadge kind="brief" value={brief.status} />
                </Link>
              </CardBody>
            ) : <EmptyState compact icon={FileText} title="Aucun brief lié" description="Associe un brief via « Modifier » pour suivre le fil concept → batch." />}
          </Card>
        </div>
      </div>
    </>
  );
}
