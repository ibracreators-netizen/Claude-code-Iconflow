import Link from "next/link";
import { BookOpenText, ArrowRight } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { DOC_KIND } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const store = await requireClient();
  const docs = await store.documents({ clientId: store.clientId });
  return (
    <div>
      <PageHeader eyebrow="Espace" title="Documents" description="Stratégies, comptes-rendus et briefs partagés par l'équipe. Toujours à jour, au même endroit." />
      {docs.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <li key={d.id}><Link href={`/app/documents/${d.id}`} className="card group flex h-full items-start gap-3 p-4 transition hover:border-border-strong">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xl hairline">{d.icon}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{d.title}</span><span className="mt-1 flex items-center gap-2 text-[12px] text-muted"><Badge tone="outline">{DOC_KIND[d.kind]}</Badge>Mis à jour {fmt.relative(d.updated_at)}</span></span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
            </Link></li>
          ))}
        </ul>
      ) : <div className="card"><EmptyState icon={BookOpenText} title="Aucun document partagé" description="Les documents de travail apparaîtront ici dès que l'équipe les partagera avec vous." /></div>}
    </div>
  );
}
