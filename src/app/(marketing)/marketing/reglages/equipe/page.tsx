import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import { salesTeam } from "@/lib/marketing/team";
import { SALES_ROLE_MODULES, STUDIO_MODULES, type SalesRole } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
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
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour aux réglages"><Link href="/marketing/reglages" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/reglages" className="hover:text-fg">Réglages</Link></nav>
      <PageHeader eyebrow="IconFlow Marketing" title="Équipe commerciale" description="Setters, closers et media buyers. Ces comptes n'ouvrent que l'espace Marketing : ni Studio, ni les clients, ni la facturation. Les droits sont appliqués par la base, pas seulement par l'interface." />
      <div className="space-y-6">
        <TeamTable team={team} me={crm.session.user.id} noDatabase={crm.demo} />
        <Card>
          <CardHeader title="Ce que voit chaque rôle" description="L'administrateur (toi) voit tout et gère l'équipe. L'export des contacts et des prospects lui est réservé." />
          <CardBody>
            <dl className="grid gap-4 md:grid-cols-3">
              {roles.map(([key, name, text]) => (
                <div key={key}><dt className="text-[13.5px] font-semibold">{name}</dt><dd className="mt-1 text-[13px] text-fg-2">{text}</dd><dd className="mt-1.5 text-[12px] text-muted">Pages : {SALES_ROLE_MODULES[key].map(label).join(", ")}.</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
