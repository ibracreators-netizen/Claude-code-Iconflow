import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandSplash } from "@/components/layout/brand-splash";
import { BootAttrs } from "@/components/layout/boot-attrs";
import { ThemeSync } from "@/lib/hooks/use-local-pref";
import "./globals.css";

/* Police de l'espace Marketing (celle de LeadConnector). Fichier libre (SIL OFL, voir src/fonts/Inter-OFL.txt), servi par l'app. */
const inter = localFont({ src: "../fonts/InterVariable-latin.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Iconflow Studio", template: "%s · Iconflow Studio" },
  description: "Le studio icon-flow : clients, Brain, briefs, livrables, documents, fichiers et facturation au même endroit.",
  applicationName: "Iconflow Studio",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#090b0e" }, { media: "(prefers-color-scheme: light)", color: "#f6f7f9" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/*
 * Avant le premier affichage (évite tout flash) :
 * - thème clair / sombre / système ;
 * - application courante (Marketing a son propre style) ;
 * - barre latérale repliée ou non ;
 * - écran de démarrage déjà vu sur cet appareil (il n'est joué qu'une fois).
 */
const bootScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('iconflow-theme');d.dataset.theme=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';d.dataset.app=location.pathname.indexOf('/marketing')===0?'marketing':'studio';if(localStorage.getItem('iconflow-nav')==='collapsed')d.dataset.nav='collapsed';if(localStorage.getItem('iconflow-splash')||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches))d.dataset.splash='off'}catch(e){d.dataset.theme='light'}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <BootAttrs />
        <ThemeSync />
        <BrandSplash />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: "!rounded-xl !border-border !bg-surface !text-fg !shadow-pop" }} />
      </body>
    </html>
  );
}
