import type { Metadata, Viewport } from "next";
import { MarketingLook } from "./welcome-client";

// Lien partagé : jamais indexé, jamais transmis à un autre site (en-tête Referer), jamais mis en cache.
export const metadata: Metadata = { title: { absolute: "Bienvenue · IconFlow" }, robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: "#00695c" };

/*
 * Style de l'espace Marketing posé avant le premier affichage : le script du layout racine ne connaît que /marketing et
 * /kpi/. Ce petit script n'est rendu qu'au chargement de la page (ce layout reste monté d'une page à l'autre du lien).
 */
const LOOK = "document.documentElement.dataset.app='marketing';";

/** Cadre des pages du lien d'onboarding (/bienvenue/<jeton>) : pensé pour le téléphone, sans compte. */
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg text-mk-text">
      <script dangerouslySetInnerHTML={{ __html: LOOK }} />
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
