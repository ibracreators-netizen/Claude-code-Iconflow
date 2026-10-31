"use client";
import * as React from "react";
import { ExternalLink, Loader2, ShieldOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import type { EmbedStatus } from "@/lib/integrations/dashboard-url";

/**
 * Tableau de bord externe en plein cadre. Le bac à sable laisse tourner l'outil (scripts, formulaires, ouverture
 * d'un onglet) sans lui donner la main sur le studio ; la page cible ne reçoit que notre origine comme référent.
 * Quand les en-têtes de la cible refusent l'intégration (vérifié côté serveur), un message remplace le cadre.
 */
export function DashboardFrame({ url, title, provider, status }: { url: string; title: string; provider: string; status: EmbedStatus }) {
  const [loaded, setLoaded] = React.useState(false);
  if (status === "refused") {
    return (
      <EmptyState icon={ShieldOff} title={`${provider} refuse l'affichage dans le studio`}
        description="Ce site interdit son intégration dans une autre page (en-tête X-Frame-Options ou CSP). Ouvre-le dans un nouvel onglet ; pour Looker Studio, utilise le lien « Intégrer le rapport »."
        action={<a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "primary", size: "sm" })}><ExternalLink />Ouvrir dans un nouvel onglet</a>} />
    );
  }
  return (
    <div>
      <div className="relative h-[min(78vh,900px)] min-h-[420px] bg-surface-2">
        {!loaded ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px] text-muted" aria-live="polite"><Loader2 className="size-5 animate-spin" />Chargement du tableau de bord…</div> : null}
        <iframe src={url} title={title} className={`relative h-full w-full border-0 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy" allow="fullscreen" allowFullScreen onLoad={() => setLoaded(true)} />
      </div>
      {status === "unknown" ? <p className="border-t border-border px-5 py-2.5 text-[12px] text-muted">Rien ne s&apos;affiche ? Ce site refuse peut-être l&apos;intégration dans une autre page : ouvre-le dans un nouvel onglet.</p> : null}
    </div>
  );
}
