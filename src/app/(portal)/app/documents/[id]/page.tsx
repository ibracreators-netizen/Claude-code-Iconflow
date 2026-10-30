import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth/session";
import { DOC_KIND } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "../../_components/print-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const store = await requireClient(); const d = await store.document(id);
  return { title: d?.title ?? "Document" };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireClient();
  const d = await store.document(id);
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print"><PageHeader crumbs={[{ label: "Documents", href: "/app/documents" }, { label: d.title }]} title={<span className="flex items-center gap-3"><span>{d.icon}</span>{d.title}</span>}
        description={<span className="flex items-center gap-2"><Badge tone="outline">{DOC_KIND[d.kind]}</Badge>Mis à jour le {fmt.dateLong(d.updated_at)}</span>} actions={<PrintButton />} /></div>
      <article className="card p-6 sm:p-10">
        {/* Contenu rédigé par l'agence (éditeur interne). */}
        <div className="prose-editor !min-h-0" dangerouslySetInnerHTML={{ __html: d.content }} />
      </article>
    </div>
  );
}
