import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crmPage, salesRole } from "@/lib/marketing/crm-server";
import type { Doc } from "@/lib/marketing/resources";
import { BackLink } from "../../reglages/kit";
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
      <div className="mx-auto max-w-4xl"><BackLink href="/marketing/ressources" label="Ressources" title="Retour aux ressources" /></div>
      <ResourceEditor doc={{ id: doc.id, title: doc.title, kind: doc.kind, content: doc.content }} canEdit={!salesRole(crm.session)} />
    </>
  );
}
