import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, Clapperboard, History, ShieldCheck } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { BRIEF_KIND, prettyMonth, type BriefConcept } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { BriefContent } from "../../_components/brief-content";
import { BriefDecision } from "./decision";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const store = await requireClient(); const b = await store.brief(id);
  return { title: b?.title ?? "Brief" };
}

type ConceptPage = Pick<BriefConcept, "id" | "title" | "content">;

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireClient();
  const brief = await store.brief(id);
  if (!brief) notFound();
  const [validations, profiles, livrables, concepts] = await Promise.all([store.validations(store.clientId), store.profiles(), store.livrables({ clientId: store.clientId }), store.concepts(brief.id)]);
  const history = validations.filter((v) => v.brief_id === brief.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const roleOf = (uid: string | null) => { if (!uid) return null; if (uid === store.session.user.id) return "Vous"; const p = profiles.find((x) => x.id === uid); return p ? (p.role === "agency" ? `Agence · ${p.display_name ?? "icon-flow"}` : "Client") : "Équipe icon-flow"; };
  const linked = livrables.filter((l) => l.brief_id === brief.id);
  const awaiting = brief.kind === "video" && brief.status === "attente_client";
  // Les concepts sont la référence ; un brief sans concept (données antérieures) affiche son contenu historique.
  const pages: ConceptPage[] = concepts.length ? concepts : [{ id: "contenu", title: brief.title, content: brief.content }];
  const multi = pages.length > 1;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader crumbs={[{ label: "Briefs", href: `/app/briefs?month=${brief.month.slice(0, 7)}` }, { label: brief.title }]} title={brief.title}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone="outline">{BRIEF_KIND[brief.kind]}</Badge><StatusBadge kind="brief" value={brief.status} /><span className="text-[12.5px]">{prettyMonth(brief.month)} · version {brief.script_version}{multi ? ` · ${pages.length} concepts` : ""}</span></span>} />
      <div className="space-y-5">
        {awaiting ? (
          <div className="card flex flex-col gap-3 border-accent/30 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-2"><span className="size-1.5 rounded-full bg-accent animate-pulse-soft" />Votre décision est attendue</div>
            <p className="min-w-0 flex-1 text-[13px] text-muted">{multi ? `Relisez les ${pages.length} concepts de ce brief, puis validez ou demandez une correction en bas de page.` : "Relisez le script, puis validez ou demandez une correction en bas de page."}</p>
            <a href="#decision" className={buttonVariants({ variant: "secondary", size: "sm" })}>Aller à la décision<ArrowDown /></a>
          </div>
        ) : null}
        {brief.status === "valide" ? <div className="card flex items-center gap-3 border-success/30 bg-success/5 p-4"><ShieldCheck className="size-5 text-success" /><div><p className="text-[14px] font-medium">Script validé</p><p className="text-[12.5px] text-muted">{brief.validated_at ? `Le ${fmt.dateLong(brief.validated_at)}. ` : ""}La production peut démarrer.</p></div></div> : null}
        {brief.kind === "statique" && brief.status !== "valide" ? <p className="rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-muted">Les briefs statiques sont validés directement par Ibra. Vous les consultez ici à titre d&apos;information.</p> : null}
        {brief.kind === "video" && brief.status === "attente_ibra" ? <p className="rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-muted">Ce script est en cours de contrôle chez icon-flow. Il vous sera soumis dès qu&apos;il est prêt.</p> : null}

        {multi ? (
          <nav aria-label="Concepts du brief" className="-mx-4 px-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
            <ol className="flex items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {pages.map((c, i) => (
                <li key={c.id} className="shrink-0">
                  <a href={`#concept-${i + 1}`} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-fg-2 transition hover:border-border-strong hover:text-fg">
                    <span className="font-mono text-[11px] text-accent-2">{String(i + 1).padStart(2, "0")}</span><span className="max-w-[220px] truncate">{c.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        {pages.map((c, i) => (
          <section key={c.id} id={`concept-${i + 1}`} className="scroll-mt-6 space-y-4" aria-labelledby={multi ? `concept-${i + 1}-title` : undefined}>
            {multi ? (
              <header className="flex items-center gap-3 pt-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[12px] font-semibold text-accent-fg" aria-hidden>{i + 1}</span>
                <h2 id={`concept-${i + 1}-title`} className="min-w-0 flex-1 truncate text-[18px] font-semibold tracking-tight">{c.title}</h2>
                <span className="shrink-0 text-[12px] tabular text-muted">Concept {i + 1} / {pages.length}</span>
              </header>
            ) : null}
            <BriefContent brief={{ ...brief, content: c.content }} />
          </section>
        ))}

        {awaiting ? <div id="decision" className="scroll-mt-6"><BriefDecision id={brief.id} /></div> : null}

        {linked.length ? (
          <section className="card p-5"><h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight"><Clapperboard className="size-4 text-muted" />Livrables issus de ce script</h3>
            <ul className="space-y-2">{linked.map((l) => <li key={l.id}><Link href={`/app/livrables/${l.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-[13.5px] transition hover:bg-surface-3"><span className="truncate font-medium">{l.title}</span><StatusBadge kind="livrable" value={l.status} /></Link></li>)}</ul>
          </section>
        ) : null}
        <section className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight"><History className="size-4 text-muted" />Historique des décisions</h3>
          {history.length ? (
            <ol className="space-y-2">{history.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                <span className="font-mono text-[11.5px] text-muted">{v.item_ref}</span>
                <Badge tone={v.decision === "valide" ? "success" : v.decision === "correction" ? "danger" : "neutral"}>{v.decision === "valide" ? "Validé" : v.decision === "correction" ? "Correction demandée" : v.decision}</Badge>
                <span className="text-muted">{roleOf(v.decided_by) ?? "Équipe icon-flow"}</span>
                <time className="ml-auto text-[12px] text-muted" dateTime={v.created_at}>{fmt.dateTime(v.created_at)}</time>
                {v.comment ? <p className="w-full text-[12.5px] text-fg-2">« {v.comment} »</p> : null}
              </li>
            ))}</ol>
          ) : <p className="text-[13px] text-muted">Aucune décision enregistrée pour l&apos;instant.</p>}
        </section>
      </div>
    </div>
  );
}
