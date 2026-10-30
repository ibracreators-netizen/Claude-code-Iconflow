import Link from "next/link";
import { Clapperboard, Image as ImageIcon, Film, ArrowRight } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { LIVRABLE_KIND, monthKey, type LivrableKind } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { MonthNav } from "@/components/shared/month-nav";
import { KindFilter } from "../_components/kind-filter";

export const metadata = { title: "Livrables" };
const ICON = { video: Clapperboard, static: ImageIcon, rush: Film } as const;

export default async function LivrablesPage({ searchParams }: { searchParams: Promise<{ month?: string; kind?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : monthKey();
  const kind = (["video", "static", "rush"].includes(sp.kind ?? "") ? sp.kind : "all") as LivrableKind | "all";
  const store = await requireClient();
  const all = await store.livrables({ clientId: store.clientId, month });
  const rows = all.filter((l) => kind === "all" || l.kind === kind);
  return (
    <div>
      <PageHeader eyebrow="Création" title="Livrables" description="Vos rushs, vidéos montées et visuels, mois par mois. Validez-les ou demandez une correction." actions={<MonthNav month={month} />} />
      <div className="mb-4"><KindFilter value={kind} options={[{ value: "all", label: "Tous", count: all.length }, ...(["video", "static", "rush"] as const).map((k) => ({ value: k, label: LIVRABLE_KIND[k], count: all.filter((l) => l.kind === k).length }))]} /></div>
      {rows.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((l) => { const Icon = ICON[l.kind] ?? Clapperboard; return (
            <li key={l.id}><Link href={`/app/livrables/${l.id}`} className={`card group block overflow-hidden transition hover:border-border-strong ${l.status === "attente_client" ? "ring-1 ring-accent/40" : ""}`}>
              <div className="relative flex aspect-video items-center justify-center bg-surface-2 text-muted"><Icon className="size-7" />{l.status === "attente_client" ? <span className="absolute left-3 top-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">À valider</span> : null}{l.duration_sec ? <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px] text-white">{l.duration_sec} s</span> : null}</div>
              <div className="p-4"><div className="mb-2 flex items-center justify-between gap-2"><Badge tone="outline">{LIVRABLE_KIND[l.kind]}</Badge><StatusBadge kind="livrable" value={l.status} /></div><h3 className="truncate text-[14.5px] font-medium">{l.title}</h3><div className="mt-2 flex items-center justify-between text-[12px] text-muted"><span>{fmt.date(l.created_at)}</span><ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></div></div>
            </Link></li>
          ); })}
        </ul>
      ) : <div className="card"><EmptyState icon={Clapperboard} title="Aucun livrable ce mois-ci" description="Vos créations apparaîtront ici dès leur livraison par l'équipe." /></div>}
    </div>
  );
}
