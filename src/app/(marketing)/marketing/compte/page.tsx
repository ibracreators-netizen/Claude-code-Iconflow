import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { allowedModulesIn, STUDIO_MODULES } from "@/lib/permissions";
import { MARKETING_ROLE } from "@/lib/marketing/types";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Mon compte" };

/** Compte d'un commercial : qui il est, son rôle, ce qu'il peut ouvrir. (Les membres de l'agence ont leur page dans Studio.) */
export default async function ComptePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role === "agency") redirect("/studio/parametres");
  const { profile, user } = session;
  const pages = allowedModulesIn(profile, "marketing").map((k) => STUDIO_MODULES.find((m) => m.key === k)?.label ?? k);
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Mon compte" description="Ton accès à l'espace Marketing." />
      <Card>
        <CardHeader title={profile.display_name ?? user.email} description={profile.marketing_role ? MARKETING_ROLE[profile.marketing_role] : "Rôle à définir par l'administrateur"} />
        <CardBody>
          <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
            <div><dt className="text-[11.5px] uppercase tracking-wide text-muted">Email de connexion</dt><dd>{user.email}</dd></div>
            <div><dt className="text-[11.5px] uppercase tracking-wide text-muted">Pages ouvertes</dt><dd>{pages.join(", ") || "aucune"}</dd></div>
          </dl>
          <p className="mt-4 text-[13px] text-muted">Tu ne vois que les prospects, contacts, tâches et rendez-vous qui te sont attribués. Pour connecter ton agenda Google : <Link href="/marketing/calendrier" className="text-accent-2 hover:underline">Calendrier</Link>. Pour changer de mot de passe : « Mot de passe oublié » sur la page de connexion.</p>
        </CardBody>
      </Card>
    </>
  );
}
