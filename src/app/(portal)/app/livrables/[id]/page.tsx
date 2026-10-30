import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ShieldCheck, Wrench, Hourglass } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { LIVRABLE_KIND, prettyMonth } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { MediaPreview } from "../../_components/media-preview";
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
  const statusNote = {
    en_controle: { icon: Hourglass, text: "En contrôle chez icon-flow. Nous vous le soumettons dès qu'il est prêt." },
    correction: { icon: Wrench, text: "Correction en cours. Une nouvelle version vous sera proposée." },
    valide: { icon: ShieldCheck, text: `Validé${l.updated_at ? ` le ${fmt.dateLong(l.updated_at)}` : ""}. Prêt à diffuser.` },
  }[l.status as "en_controle" | "correction" | "valide"];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader crumbs={[{ label: "Livrables", href: `/app/livrables?month=${l.month.slice(0, 7)}` }, { label: l.title }]} title={l.title}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone="outline">{LIVRABLE_KIND[l.kind]}</Badge><StatusBadge kind="livrable" value={l.status} /><span className="text-[12.5px]">{prettyMonth(l.month)}{l.duration_sec ? ` · ${l.duration_sec} s` : ""}</span></span>} />
      <div className="space-y-5">
        <MediaPreview url={l.file_url} title={l.title} />
        {l.status === "attente_client" ? <LivrableDecision id={l.id} /> : statusNote ? <div className={`card flex items-center gap-3 p-4 ${l.status === "valide" ? "border-success/30 bg-success/5" : ""}`}><statusNote.icon className={`size-5 ${l.status === "valide" ? "text-success" : "text-muted"}`} /><p className="text-[13.5px]">{statusNote.text}</p></div> : null}
        {brief ? <Link href={`/app/briefs/${brief.id}`} className="card flex items-center gap-3 p-4 transition hover:border-border-strong"><FileText className="size-4 text-muted" /><span className="min-w-0 flex-1"><span className="block text-[12px] text-muted">Script d&apos;origine</span><span className="block truncate text-[13.5px] font-medium">{brief.title}</span></span><StatusBadge kind="brief" value={brief.status} /></Link> : null}
        <CommentThread livrableId={l.id} comments={comments} authors={authors} me={store.session.user.id} />
      </div>
    </div>
  );
}
