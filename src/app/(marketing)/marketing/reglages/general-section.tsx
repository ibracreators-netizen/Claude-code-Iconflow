import { crmPage } from "@/lib/marketing/crm-server";
import { PageHeader } from "@/components/ui/misc";
import { ReglagesForm } from "./reglages-form";
import { SpeedCard } from "./speed-card";

/** Rubrique Général : fuseau horaire, prise de rendez-vous, vitesse de l'app. Ouverte par /marketing/reglages/general et, sur ordinateur, par /marketing/reglages. */
export async function GeneralSection() {
  const crm = await crmPage("marketing_reglages");
  const settings = await crm.store.settings();
  return (
    <>
      <PageHeader title="Général" description="Le fuseau horaire de l'équipe et la prise de rendez-vous. Rien n'est actif tant que tu ne l'as pas réglé." />
      <div className="space-y-4 lg:space-y-6">
        <ReglagesForm initial={settings} />
        <SpeedCard />
      </div>
    </>
  );
}
