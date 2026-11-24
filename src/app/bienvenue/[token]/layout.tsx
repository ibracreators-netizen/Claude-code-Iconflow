import type { Metadata, Viewport } from "next";
import { MarketingLook } from "./welcome-client";

// Lien partagé : jamais indexé, jamais transmis à un autre site (en-tête Referer), jamais mis en cache.
// Description propre au lien : c'est elle que montrent WhatsApp, iMessage ou Slack quand on colle le lien.
const DESCRIPTION = "Ton onboarding, tes SOPs et tes ressources.";
export const metadata: Metadata = {
  title: { absolute: "Bienvenue · IconFlow" }, description: DESCRIPTION, applicationName: "IconFlow",
  openGraph: { title: "Bienvenue · IconFlow", description: DESCRIPTION, siteName: "IconFlow", type: "website" },
  robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer",
};
export const viewport: Viewport = { themeColor: "#00695c" };

/**
 * Cadre des pages du lien d'onboarding (/bienvenue/<jeton>) : pensé pour le téléphone, sans compte. Le style de
 * l'espace Marketing est posé avant le premier affichage par le script du layout racine (qui reconnaît /bienvenue/),
 * et reposé par MarketingLook après une navigation depuis une autre page de l'app.
 */
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg text-mk-text">
      <MarketingLook />
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[max(env(safe-area-inset-bottom),28px)] pt-[max(env(safe-area-inset-top),12px)] lg:max-w-[760px]">
        <header className="flex h-14 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- petit logo statique, déjà à la bonne taille */}
          <img src="/brand/marketing-logo-96.png" alt="" width={32} height={32} className="size-8 rounded-[8px]" />
          <p className="text-[15px] font-semibold text-mk-strong">IconFlow <span className="font-normal text-mk-sub">·</span> Bienvenue</p>
        </header>
        {children}
      </div>
    </main>
  );
}
