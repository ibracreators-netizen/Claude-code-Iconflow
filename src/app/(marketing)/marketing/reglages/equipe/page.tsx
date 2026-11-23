import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import { teamForPages } from "@/lib/marketing/team-view";
import { INVITE_ROLES, INVITE_ROLE_HINT, INVITE_ROLE_LABEL, pagesForRole, responsableOpensStudio } from "@/lib/marketing/invite-errors";
import { moduleLabel } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { BackLink, Panel } from "../kit";
import { TeamTable } from "./equipe-client";

export const metadata: Metadata = { title: "Équipe et accès" };

export default async function EquipeAccesPage() {
  const crm = await crmPage("marketing_reglages");
  if (!isAdmin(crm.session)) redirect("/marketing/reglages");
  const team = await teamForPages();
  const studio = responsableOpensStudio();
  return (
    <>
      <BackLink href="/marketing/reglages" label="Réglages" title="Retour aux réglages" />
      <PageHeader title="Équipe et accès" description="Invite les membres de ton équipe Marketing et choisis ce que chacun peut ouvrir. Toi seul invites, changes un rôle ou retires un accès." />
      <div className="space-y-4 lg:space-y-6">
        <TeamTable team={team} me={crm.session.user.id} demo={crm.demo} />
        <Panel title="Ce que voit chaque rôle" description="Toi (administrateur), tu vois tout et tu gères l'équipe. L'export des contacts et des prospects t'est réservé. À l'invitation, tu coches les pages de chacun ; celles du rôle sont cochées d'avance.">
          <dl className="grid gap-3 md:grid-cols-2">
            {INVITE_ROLES.map((r) => (
              <div key={r} className="rounded-[10px] border border-mk-line p-4">
                <dt className="text-[15px] font-semibold text-mk-strong">{INVITE_ROLE_LABEL[r]}</dt>
                <dd className="mt-1 text-[14px] text-mk-text">{INVITE_ROLE_HINT[r]}</dd>
                <dd className="mt-2 text-[13px] text-mk-sub">{r === "responsable" ? "Pages : tout l'espace Marketing." : `Pages cochées par défaut : ${pagesForRole(r).map(moduleLabel).join(", ")}.`}</dd>
                {r === "responsable" && studio ? <dd className="mt-1 text-[13px] text-mk-warn">Pour l&apos;instant, ce compte ouvre aussi l&apos;accueil de Studio.</dd> : null}
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}
