import type { Metadata } from "next";
import { crmPage } from "@/lib/marketing/crm-server";
import { MkSettingsGroup, MkSettingsRow } from "@/components/marketing/ui";
import { SettingsBackdrop } from "../parametres/settings-rows";
import { GeneralSection } from "./general-section";
import { HashRedirect } from "./hash-redirect";
import { reglagesSections, SECTION_GROUPS } from "./sections";
import { sectionFlags } from "./server";

export const metadata: Metadata = { title: "Réglages" };

/**
 * Entrée des Réglages.
 * - Téléphone : la liste des rubriques (groupes blancs sur fond gris-bleu, comme Paramètres) ; chacune ouvre sa page.
 * - Ordinateur : la rubrique Général, à droite du menu des rubriques (voir layout.tsx).
 */
export default async function ReglagesPage() {
  const crm = await crmPage("marketing_reglages");
  const sections = reglagesSections(sectionFlags(crm.session.profile));
  return (
    <>
      <HashRedirect />
      <div className="mx-auto w-full max-w-[640px] space-y-6 pb-4 lg:hidden">
        <SettingsBackdrop />
        <h1 className="sr-only">Réglages</h1>
        {SECTION_GROUPS.map((g) => {
          const items = sections.filter((s) => s.group === g.key);
          return items.length ? (
            <MkSettingsGroup key={g.key} title={g.title}>
              {items.map((s) => <MkSettingsRow key={s.key} href={s.href} icon={s.icon} label={s.label} sub={s.sub} />)}
            </MkSettingsGroup>
          ) : null;
        })}
      </div>
      <div className="hidden lg:block">
        <GeneralSection />
      </div>
    </>
  );
}
