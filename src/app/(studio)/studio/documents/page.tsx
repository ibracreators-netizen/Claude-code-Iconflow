import Link from "next/link";
import { BookOpenText, Share2 } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ClientChip } from "@/components/shared/client-chip";
import { DOC_KIND } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { CreateDocumentDialog } from "./_components/create-document-dialog";
import { DocumentFilters } from "./_components/filters";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await requireAgency();
  const [clients, docs] = await Promise.all([store.clients(), store.documents()]);
  const q = (sp.q ?? "").toLowerCase();
  const filtered = docs.filter((d) => (!sp.client || (sp.client === "interne" ? d.client_id === null : d.client_id === sp.client)) && (!sp.kind || d.kind === sp.kind) && (!q || d.title.toLowerCase().includes(q)));
  const name = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "Client archivé";
  const templates = docs.filter((d) => d.kind === "template").map((d) => ({ id: d.id, title: d.title, icon: d.icon, content: d.content }));
  const recent = docs.slice(0, 4);

  return (
    <>
      <PageHeader eyebrow="Connaissance" title="Documents" description="Stratégies, comptes-rendus, briefs, SOP et templates. Rédigés ici, partagés au client en un clic."
        actions={<CreateDocumentDialog clients={clients.map((c) => ({ id: c.id, name: c.name }))} templates={templates} defaultClient={sp.client} autoOpen={sp.new === "1"} />} />
      {!sp.q && !sp.client && !sp.kind && recent.length ? (
        <section className="mb-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Récents</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((d) => (
              <Link key={d.id} href={`/studio/documents/${d.id}`} className="card group p-4 transition hover:border-border-strong hover:shadow-pop">
                <div className="text-2xl">{d.icon}</div>
                <h3 className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight group-hover:text-accent-2">{d.title}</h3>
                <p className="mt-1 text-[12px] text-muted">{d.client_id ? name(d.client_id) : "Interne"} · {fmt.relative(d.updated_at)}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <div className="mb-4"><DocumentFilters clients={clients.map((c) => ({ id: c.id, name: c.name }))} client={sp.client ?? ""} kind={sp.kind ?? ""} q={sp.q ?? ""} /></div>
      {!filtered.length ? <EmptyState icon={BookOpenText} title="Aucun document" description={docs.length ? "Aucun document ne correspond à ces filtres." : "Crée ton premier document : une stratégie, un compte-rendu, une SOP."} /> : (
        <div className="card divide-y divide-border">
          {filtered.map((d) => (
            <Link key={d.id} href={`/studio/documents/${d.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/60 sm:px-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-lg">{d.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{d.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted"><span>Modifié {fmt.relative(d.updated_at)}</span>{d.shared_with_client ? <span className="inline-flex items-center gap-1 text-accent-2"><Share2 className="size-3" />Partagé</span> : null}</p>
              </div>
              <Badge tone={d.kind === "template" ? "violet" : d.kind === "strategie" ? "accent" : "neutral"} className="hidden sm:inline-flex">{DOC_KIND[d.kind]}</Badge>
              <span className="hidden w-[160px] justify-end sm:flex">{d.client_id ? <ClientChip name={name(d.client_id)} /> : <span className="text-[12.5px] text-muted">Interne</span>}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
