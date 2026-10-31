import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Hourglass, ShieldCheck, Wrench } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { LIVRABLE_KIND, prettyMonth } from "@/lib/data/types";
import { batchLink, batchSummary, itemsLabel } from "@/lib/batch";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { BatchItemsList, BatchLinkBand } from "@/components/shared/batch-items";
import { LivrableDecision, CommentThread } from "./client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const store = await requireClient(); const l = await store.livrable(id);
  return { title: l?.title ?? "Livrable" };
}

export default async function LivrablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireClient();
  const l = await store.livrable(id);
  if (!l) notFound();
  const [comments, profiles, brief] = await Promise.all([store.livrableComments(l.id), store.profiles(), l.brief_id ? store.brief(l.brief_id) : null]);
  const authors = Object.fromEntries(profiles.map((p) => [p.id, { name: p.display_name ?? "icon-flow", role: p.role, avatar: p.avatar_url }]));
  const items = l.items ?? [];
  const summary = batchSummary(l);
  const link = batchLink(l.file_url);
  const statusNote = {
    en_controle: { icon: Hourglass, text: "Ce batch est en contrôle chez icon-flow. Nous vous le soumettons dès qu'il est prêt." },
    correction: { icon: Wrench, text: "Corrections en cours. Une nouvelle version du batch vous sera proposée." },
    valide: { icon: ShieldCheck, text: `Batch validé${l.updated_at ? ` le ${fmt.dateLong(l.updated_at)}` : ""}. Prêt à diffuser.` },
  }[l.status as "en_controle" | "correction" | "valide"];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader crumbs={[{ label: "Livrables", href: `/app/livrables?month=${l.month.slice(0, 7)}` }, { label: l.title }]} title={l.title}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone="outline">{LIVRABLE_KIND[l.kind]}</Badge><StatusBadge kind="livrable" value={l.status} /><span className="text-[12.5px]">{prettyMonth(l.month)}{summary ? ` · ${summary}` : ""}</span></span>} />
      <div className="space-y-5">
        <section className="card p-5">
          <h3 className="text-[15px] font-semibold tracking-tight">Contenu du batch</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">{items.length ? `${itemsLabel(l.kind, items.length)} · un seul lien pour tout visionner.` : "Toutes les créations de cette livraison sont réunies derrière un seul lien."}</p>
          <BatchLinkBand className="mt-4" url={l.file_url} empty="Le lien vous sera communiqué dès la mise en ligne." />
          {link?.video ? (
            <div className="mt-4 overflow-hidden rounded-xl bg-black hairline"><video controls playsInline preload="metadata" className="aspect-video w-full" src={link.href} title={l.title} /></div>
          ) : link?.embeddable ? (
            <div className="mt-4 overflow-hidden rounded-xl bg-black hairline"><iframe src={link.href} title={l.title} className="aspect-video w-full" allow="fullscreen" referrerPolicy="no-referrer" /></div>
          ) : null}
          <BatchItemsList className="mt-4" items={items} kind={l.kind} emptyText="La liste détaillée des éléments arrive bientôt." />
        </section>

        {l.status === "attente_client" ? (
          <LivrableDecision id={l.id} count={items.length} kind={l.kind} service={link?.service ?? null} />
        ) : statusNote ? (
          <div className={`card flex items-center gap-3 p-4 ${l.status === "valide" ? "border-success/30 bg-success/5" : ""}`}><statusNote.icon className={`size-5 shrink-0 ${l.status === "valide" ? "text-success" : "text-muted"}`} /><p className="text-[13.5px]">{statusNote.text}</p></div>
        ) : null}

        {brief ? <Link href={`/app/briefs/${brief.id}`} className="card flex items-center gap-3 p-4 transition hover:border-border-strong"><FileText className="size-4 text-muted" /><span className="min-w-0 flex-1"><span className="block text-[12px] text-muted">Script d&apos;origine</span><span className="block truncate text-[13.5px] font-medium">{brief.title}</span></span><StatusBadge kind="brief" value={brief.status} /></Link> : null}
        <CommentThread livrableId={l.id} comments={comments} authors={authors} me={store.session.user.id} />
      </div>
    </div>
  );
}
