import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

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

/* Applique le thème avant le premier rendu pour éviter le flash. */
const themeScript = `(function(){try{var t=localStorage.getItem('iconflow-theme');if(!t){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: "!rounded-xl !border-border !bg-surface !text-fg !shadow-pop" }} />
      </body>
    </html>
  );
}
