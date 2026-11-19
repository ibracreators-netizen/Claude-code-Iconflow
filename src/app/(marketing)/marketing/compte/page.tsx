import type { Metadata } from "next";
import Link from "next/link";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { allowedModulesIn, canAccess, hasFullAccess, moduleLabel } from "@/lib/permissions";
import { MARKETING_ROLE } from "@/lib/marketing/types";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Mon profil" };

/**
 * « Mon profil » (depuis Paramètres), pour tout membre de l'espace Marketing, agence comme commercial :
 * photo, nom affiché et fonction modifiables ; e-mail et rôle commercial en lecture seule.
 */
export default async function ComptePage() {
  const store = await requireMarketingSpace();
  const { profile, user } = store.session;
  const sales = profile.role === "marketing";
  const role = sales && profile.marketing_role ? MARKETING_ROLE[profile.marketing_role] : null;
  const pages = hasFullAccess(profile) ? "toutes (accès complet)" : allowedModulesIn(profile, "marketing").map(moduleLabel).join(", ") || "aucune";
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <h1 className="sr-only">Mon profil</h1>
      <ProfileForm userId={user.id} email={user.email} displayName={profile.display_name ?? ""} title={profile.title ?? ""} avatarUrl={profile.avatar_url} role={role} />
      <div className="mt-8 space-y-1.5 border-t border-mk-line pt-5 text-[13px] leading-relaxed text-mk-sub lg:mt-6 lg:border-0 lg:px-1 lg:pt-0">
        <p><span className="font-medium text-mk-text">Pages ouvertes&nbsp;:</span> {pages}.</p>
        {sales ? <p>Tu ne vois que les prospects, contacts, tâches et rendez-vous qui te sont attribués.</p> : <p>Ton nom et ta photo sont aussi ceux de ton compte Studio.</p>}
        {canAccess(profile, "marketing_calendrier") ? <p>Pour relier ton agenda Google&nbsp;: <Link href="/marketing/calendrier" className="font-medium text-accent-2 hover:underline">Calendrier</Link>.</p> : null}
        <p>Pour changer de mot de passe&nbsp;: «&nbsp;Mot de passe oublié&nbsp;» sur la page de connexion.</p>
      </div>
    </div>
  );
}
