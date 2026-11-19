import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import { salesTeam } from "@/lib/marketing/team";
import { SALES_ROLE_MODULES, STUDIO_MODULES, type SalesRole } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { BackLink, Panel } from "../kit";
import { TeamTable } from "./equipe-client";

export const metadata: Metadata = { title: "Équipe commerciale" };
const label = (key: string) => STUDIO_MODULES.find((m) => m.key === key)?.label ?? key;

export default async function EquipePage() {
  const crm = await crmPage("marketing_reglages");
  if (!isAdmin(crm.session)) redirect("/marketing/reglages");
  const team = await salesTeam();
  const roles: Array<[SalesRole, string, string]> = [
    ["setter", "Setter", "Ses tâches « À appeler », ses prospects et leurs contacts, ses rendez-vous. Rien de ce qui est attribué à un autre."],
    ["closer", "Closer", "Ses appels, ses prospects et leurs contacts, la saisie du résultat et du montant signé. Rien de ce qui est attribué à un autre."],
    ["media_buyer", "Media buyer", "L'entonnoir et la publicité, en chiffres. Aucun nom, email ni téléphone de contact."],
  ];
  return (
    <>
      <BackLink href="/marketing/reglages" label="Réglages" title="Retour aux réglages" />
      <PageHeader title="Inviter et gérer les accès" description="Setters, closers et media buyers. Ces comptes n'ouvrent que l'espace Marketing : ni Studio, ni les clients, ni la facturation. Les droits sont appliqués par la base, pas seulement par l'interface." />
      <div className="space-y-4 lg:space-y-6">
        <TeamTable team={team} me={crm.session.user.id} noDatabase={crm.demo} />
        <Panel title="Ce que voit chaque rôle" description="L'administrateur (toi) voit tout et gère l'équipe. L'export des contacts et des prospects lui est réservé.">
          <dl className="grid gap-3 md:grid-cols-3">
            {roles.map(([key, name, text]) => (
              <div key={key} className="rounded-[10px] border border-mk-line p-4">
                <dt className="text-[15px] font-semibold text-mk-strong">{name}</dt>
                <dd className="mt-1 text-[14px] text-mk-text">{text}</dd>
                <dd className="mt-2 text-[13px] text-mk-sub">Pages : {SALES_ROLE_MODULES[key].map(label).join(", ")}.</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}
