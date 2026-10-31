import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Brain, ChevronRight, Clapperboard, ExternalLink } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { BRIEF_KIND, LIVRABLE_KIND, prettyMonth } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { nameMap, one, type SP } from "../../_prod/params";
import { BriefWorkspace } from "./brief-workspace";
import { BriefStatusRail } from "./brief-status-rail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const store = await requireAgency("briefs");
  const brief = await store.brief(id);
  return { title: brief ? brief.title : "Brief" };
}

export default async function BriefPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const store = await requireAgency("briefs");
  const brief = await store.brief(id);
  if (!brief) notFound();
  const [client, profiles, validations, livrables, siblings, concepts] = await Promise.all([
    store.client(brief.client_id), store.profiles(), store.validations(brief.client_id), store.livrables({ clientId: brief.client_id }),
    store.briefs({ clientId: brief.client_id, month: brief.month.slice(0, 7) }), store.concepts(brief.id),
  ]);
  const profileName = nameMap(profiles, (p) => p.display_name ?? p.email ?? "Compte");
  const history = validations.filter((v) => v.brief_id === brief.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const linked = livrables.filter((l) => l.brief_id === brief.id);
  const ordered = siblings.filter((b) => b.kind === brief.kind).map((b) => b.id);
  const wanted = one(sp.concept);
  const selectedId = concepts.find((c) => c.id === wanted)?.id ?? concepts[0]?.id ?? null;
  const monthKey = brief.month.slice(0, 7);
  const backHref = `/studio/briefs?month=${monthKey}`;

  const rail = (
    <>
      <BriefStatusRail brief={brief} />

      <Card>
        <CardHeader title="Historique des décisions" description={history.length ? `${history.length} décision${history.length > 1 ? "s" : ""}` : "Aucune décision enregistrée."} />
        {history.length ? (
          <CardBody>
            <ol className="space-y-3">
              {history.map((v) => (
                <li key={v.id} className="flex items-start gap-3 text-[13px]">
                  <StatusBadge kind="livrable" value={v.decision} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11.5px] text-muted">{v.item_ref}</p>
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
        <CardHeader title="Livrables liés" action={<Link href={`/studio/livrables?new=1&client=${brief.client_id}&brief=${brief.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Ajouter</Link>} />
        {linked.length ? (
          <ul className="divide-y divide-border px-5 pb-3">
            {linked.map((l) => (
              <li key={l.id}>
                <Link href={`/studio/livrables/${l.id}`} className="flex items-center gap-3 py-2.5 text-[13px] transition hover:text-accent-2">
                  <Clapperboard className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate">{l.title}</span><span className="text-muted">{LIVRABLE_KIND[l.kind]}</span><StatusBadge kind="livrable" value={l.status} /><ExternalLink className="size-3.5 text-muted-2" />
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact icon={Clapperboard} title="Aucun livrable" description="Les vidéos montées issues de ce script apparaîtront ici." />}
      </Card>
    </>
  );

  return (
    <>
      <nav className="mb-3 flex min-w-0 items-center gap-1 text-[12.5px] text-muted animate-rise" aria-label="Fil d'Ariane">
        <Tooltip label="Retour aux briefs">
          <Link href={backHref} className="mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg" aria-label="Retour aux briefs"><ArrowLeft className="size-4" /></Link>
        </Tooltip>
        <Link href={backHref} className="shrink-0 transition hover:text-fg">Briefs</Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-60" />
        <Link href={`${backHref}&client=${brief.client_id}`} className="shrink-0 transition hover:text-fg">{prettyMonth(brief.month)}</Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-60" />
        <span className="truncate text-fg-2">{brief.title}</span>
      </nav>

      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{brief.title}<StatusBadge kind="brief" value={brief.status} /></span>}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><Badge tone="outline">{BRIEF_KIND[brief.kind]}</Badge><span className="font-mono text-[12px]">script-v{brief.script_version}</span><span>{concepts.length} concept{concepts.length > 1 ? "s" : ""}</span><span>Créé {fmt.relative(brief.created_at)}</span>{client ? <ClientChip name={client.name} logo={client.logo_url} href={`/studio/clients/${client.id}`} /> : null}</span>}
        actions={<Link href={`/studio/brain?client=${brief.client_id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}><Brain />Brain {client?.name}</Link>}
      />

      <BriefWorkspace brief={brief} concepts={concepts} selectedId={selectedId} profiles={profiles.map((p) => ({ id: p.id, name: p.display_name ?? p.email ?? "Compte" }))} siblings={ordered} rail={rail} />
    </>
  );
}
