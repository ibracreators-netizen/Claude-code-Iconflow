import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { crmPage, salesRole } from "@/lib/marketing/crm-server";
import type { Doc } from "@/lib/marketing/resources";
import { Tooltip } from "@/components/ui/tooltip";
import { ResourceEditor } from "./resource-editor";

export const metadata: Metadata = { title: "Ressource" };

export default async function RessourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crm = await crmPage("marketing_ressources");
  const doc = await crm.db.get<Doc>("documents", id);
  // Un document de Studio n'est jamais servi ici, même à un administrateur.
  if (!doc || doc.space !== "marketing" || doc.archived_at) notFound();
  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour aux ressources"><Link href="/marketing/ressources" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/ressources" className="hover:text-fg">Ressources</Link></nav>
      <ResourceEditor doc={{ id: doc.id, title: doc.title, kind: doc.kind, content: doc.content }} canEdit={!salesRole(crm.session)} />
    </>
  );
}
