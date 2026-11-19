import { redirect } from "next/navigation";

/** Ancienne adresse de la fiche contact : elle vit désormais dans Contacts. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/marketing/contacts/${encodeURIComponent((await params).id)}`);
}
