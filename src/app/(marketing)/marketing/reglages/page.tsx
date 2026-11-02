import type { Metadata } from "next";
import { requireMarketing } from "@/lib/marketing/session";
import { PageHeader } from "@/components/ui/misc";
import { ReglagesForm } from "./reglages-form";

export const metadata: Metadata = { title: "Réglages marketing" };

export default async function ReglagesPage() {
  const store = await requireMarketing("marketing_reglages");
  const settings = await store.settings();
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Réglages" description="Disponibilités, réservation en ligne, rappels et relances. Aucune valeur n'est active tant que tu ne l'as pas réglée." />
      <ReglagesForm initial={settings} />
    </>
  );
}
