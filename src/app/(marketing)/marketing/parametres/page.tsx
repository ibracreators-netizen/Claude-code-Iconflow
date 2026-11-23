import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, BellRing, ChevronRight, Globe, LogOut, Settings2 } from "lucide-react";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { canAccess } from "@/lib/permissions";
import { MARKETING_ROLE } from "@/lib/marketing/types";
import { MkSettingsGroup, MkSettingsRow } from "@/components/marketing/ui";
import { ProfilePhoto } from "../compte/profile-photo";
import { AppearanceRow, InstallRow, SettingsBackdrop } from "./settings-rows";
import pkg from "../../../../../package.json";

export const metadata: Metadata = { title: "Paramètres" };

/**
 * Paramètres de l'app (écran de l'engrenage), comme LeadConnector : le profil en tête, les préférences de cet
 * appareil, l'application, puis la déconnexion. Fond gris-bleu sur téléphone, groupes blancs arrondis.
 */
export default async function ParametresPage() {
  const store = await requireMarketingSpace();
  const { profile, user } = store.session;
  const name = profile.display_name?.trim() || user.email;
  const role = profile.role === "marketing" && profile.marketing_role ? MARKETING_ROLE[profile.marketing_role] : null;
  return (
    // Ordinateur : sur le fond clair de l'app, les groupes blancs prennent un filet et une ombre légère.
    <div className="mx-auto w-full max-w-[640px] space-y-6 pb-4 lg:[&>section>div]:rounded-xl lg:[&>section>div]:border lg:[&>section>div]:border-mk-line lg:[&>section>div]:shadow-[var(--shadow-soft)]">
      <SettingsBackdrop />
      <h1 className="sr-only">Paramètres</h1>

      <MkSettingsGroup>
        <Link href="/marketing/compte" className="flex min-h-[84px] w-full items-center gap-4 px-4 py-3.5 transition hover:bg-mk-chip/60 active:bg-mk-chip">
          <ProfilePhoto name={name} src={profile.avatar_url} size={56} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[18px] font-semibold text-mk-strong">{name}</span>
            <span className="block truncate text-[14px] text-mk-sub">{user.email}</span>
            {role ? <span className="block truncate text-[14px] text-mk-sub">{role}</span> : null}
          </span>
          <ChevronRight className="size-5 shrink-0 text-mk-icon" aria-hidden />
          <span className="sr-only">Mon profil</span>
        </Link>
      </MkSettingsGroup>

      <MkSettingsGroup title="Préférences">
        <AppearanceRow />
        <MkSettingsRow icon={Globe} label="Langue" right={<span className="shrink-0 text-[15px] text-mk-sub">Français</span>} />
        <MkSettingsRow icon={BellRing} label="Notifications" href="/marketing/notifications" />
      </MkSettingsGroup>

      <MkSettingsGroup title="Application">
        <InstallRow />
        {canAccess(profile, "marketing_reglages") ? <MkSettingsRow icon={Settings2} label="Réglages de l'espace" sub="Pipeline, équipe, intégrations" href="/marketing/reglages" /> : null}
        {/* Lien classique (et non navigation interne) : Studio a son propre cadre, la page se recharge. */}
        {profile.role === "agency" ? <MkSettingsRow icon={ArrowLeftRight} label="Aller dans Studio" href="/studio" external /> : null}
      </MkSettingsGroup>

      <MkSettingsGroup>
        <form action="/auth/signout" method="post">
          <button type="submit" className="flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-mk-chip/60 active:bg-mk-chip">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mk-icon-bg text-mk-logout"><LogOut className="size-5" strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1 truncate text-[17px] font-medium text-mk-logout">Se déconnecter</span>
          </button>
        </form>
      </MkSettingsGroup>

      <p className="pt-2 text-center text-[13px] leading-relaxed text-mk-sub">
        <span className="block font-medium text-mk-text">IconFlow Marketing</span>
        Version {pkg.version}
      </p>
    </div>
  );
}
