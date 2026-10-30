import Link from "next/link";
import { ArrowRight, CheckCircle2, Clapperboard, FileText } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { LIVRABLE_KIND } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "À valider" };

export default async function ValidationsPage() {
  const store = await requireClient();
  const [briefs, livrables] = await Promise.all([store.briefs({ clientId: store.clientId }), store.livrables({ clientId: store.clientId })]);
  const items = [
    ...briefs.filter((b) => b.kind === "video" && b.status === "attente_client").map((b) => ({ id: b.id, href: `/app/briefs/${b.id}`, title: b.title, meta: `Script vidéo · version ${b.script_version}`, date: b.updated_at ?? b.created_at, icon: FileText, tone: "info" as const, type: "Script" })),
    ...livrables.filter((l) => l.status === "attente_client").map((l) => ({ id: l.id, href: `/app/livrables/${l.id}`, title: l.title, meta: `${LIVRABLE_KIND[l.kind]}${l.duration_sec ? ` · ${l.duration_sec} s` : ""}`, date: l.updated_at ?? l.created_at, icon: Clapperboard, tone: "violet" as const, type: "Livrable" })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <PageHeader eyebrow="Validations" title="À valider" description="Les scripts et livrables qui attendent votre décision. Une validation lance l'étape suivante, une demande de correction renvoie l'élément à l'équipe." />
      {items.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((i) => (
            <li key={i.id}><Link href={i.href} className="card flex items-center gap-4 p-4 transition hover:border-border-strong">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 hairline ${i.tone === "info" ? "text-info" : "text-violet"}`}><i.icon className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><Badge tone={i.tone}>{i.type}</Badge><span className="text-[11.5px] text-muted">demandé {fmt.relative(i.date)}</span></span><span className="mt-1 block truncate text-[14px] font-medium">{i.title}</span><span className="text-[12.5px] text-muted">{i.meta}</span></span>
              <ArrowRight className="size-4 shrink-0 text-muted" />
            </Link></li>
          ))}
        </ul>
      ) : <div className="card"><EmptyState icon={CheckCircle2} title="Rien à valider" description="Tout est en production. Nous vous préviendrons dès qu'un script ou un livrable attend votre regard." /></div>}
    </div>
  );
}
