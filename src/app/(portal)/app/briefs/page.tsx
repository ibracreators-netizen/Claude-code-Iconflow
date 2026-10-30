import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { BRIEF_KIND, monthKey, type BriefKind } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { MonthNav } from "@/components/shared/month-nav";
import { KindFilter } from "../_components/kind-filter";

export const metadata = { title: "Briefs & scripts" };

export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ month?: string; kind?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : monthKey();
  const kind = (sp.kind === "statique" ? "statique" : sp.kind === "video" ? "video" : "all") as BriefKind | "all";
  const store = await requireClient();
  const all = await store.briefs({ clientId: store.clientId, month });
  const rows = all.filter((b) => kind === "all" || b.kind === kind);
  return (
    <div>
      <PageHeader eyebrow="Création" title="Briefs & scripts" description="Les concepts et scripts du mois. Les scripts vidéo passent par votre validation avant tournage." actions={<MonthNav month={month} />} />
      <div className="mb-4"><KindFilter value={kind} options={[{ value: "all", label: "Tous", count: all.length }, { value: "video", label: "Vidéo", count: all.filter((b) => b.kind === "video").length }, { value: "statique", label: "Statique", count: all.filter((b) => b.kind === "statique").length }]} /></div>
      {rows.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <li key={b.id}><Link href={`/app/briefs/${b.id}`} className={`card group flex h-full flex-col p-4 transition hover:border-border-strong ${b.status === "attente_client" && b.kind === "video" ? "ring-1 ring-accent/40" : ""}`}>
              <div className="mb-3 flex items-center justify-between gap-2"><Badge tone="outline">{BRIEF_KIND[b.kind]}</Badge><StatusBadge kind="brief" value={b.status} /></div>
              <h3 className="text-[14.5px] font-medium leading-snug">{b.title}</h3>
              <div className="mt-auto flex items-center justify-between pt-4 text-[12px] text-muted">
                <span>Version {b.script_version} · {fmt.date(b.created_at)}</span>
                {b.status === "attente_client" && b.kind === "video" ? <span className="inline-flex items-center gap-1 font-medium text-accent-2">Décision attendue<ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span> : <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />}
              </div>
            </Link></li>
          ))}
        </ul>
      ) : <div className="card"><EmptyState icon={FileText} title="Aucun brief ce mois-ci" description="Les scripts apparaissent ici dès qu'ils sont prêts à être partagés par l'équipe." /></div>}
    </div>
  );
}
