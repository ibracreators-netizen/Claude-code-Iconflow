"use client";
import * as React from "react";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { changeOnboardingLinkAction, setOnboardingLinkActiveAction } from "@/lib/actions/marketing-onboarding";
import type { AdminLink } from "@/lib/marketing/onboarding-link-server";
import { cn } from "@/lib/utils";
import { CARD, Notice, Pill } from "../reglages/kit";
import { BTN_PRIMARY, BTN_SECONDARY, useCopy } from "../paiements/parts";

/** Origine du site (comme les liens de saisie des KPI) ; vide pendant le rendu serveur, sans écart d'hydratation. */
const noop = () => () => {};
const useOrigin = () => React.useSyncExternalStore(noop, () => window.location.origin, () => "");

/**
 * Carte « Lien d'onboarding » (haut de la page Ressources), pour qui gère les ressources : UN lien pour toutes les
 * recrues. Copier, changer (l'ancien ne marche plus), couper ou rallumer. `demoEmail` : e-mail d'essai, en démo seulement.
 */
export function OnboardingLinkCard({ link, demoEmail }: { link: AdminLink; demoEmail: string | null }) {
  const { exec, pending } = useAction();
  const { copied, copy } = useCopy();
  const origin = useOrigin();
  const [confirm, setConfirm] = React.useState(false);
  const url = link.state === "ok" && origin ? `${origin}${link.path}` : "";
  const active = link.state === "ok" && link.enabled;

  return (
    <section aria-labelledby="onboarding-link-title" className={cn(CARD, "mb-4 overflow-hidden lg:mb-5")}>
      <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 id="onboarding-link-title" className="flex flex-wrap items-center gap-2 text-[16px] font-semibold leading-6 text-mk-strong">
            <Link2 className="size-[18px] text-accent-2" strokeWidth={2} aria-hidden />Lien d&apos;onboarding
            {link.state === "ok" ? (active ? <Pill tone="success">Actif</Pill> : <Pill>Désactivé</Pill>) : null}
          </h2>
          <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-mk-sub">Envoie ce lien à ta nouvelle recrue. Pour l&apos;ouvrir, elle tape l&apos;e-mail que tu as enregistré pour elle : celui de son compte (invitation dans Équipe, elle doit alors être connectée) ou celui de son lien de saisie des KPI. Elle voit l&apos;onboarding, les SOPs et les ressources de son rôle.</p>
        </div>
        {link.state === "ok" ? (
          <label className="flex min-h-10 shrink-0 items-center justify-between gap-3 rounded-[10px] border border-mk-line px-3 py-2 sm:border-0 sm:px-0 sm:py-0">
            <span className="text-[14px] font-medium text-mk-text">Lien actif</span>
            <Switch checked={link.enabled} disabled={pending} aria-label="Lien actif"
              onCheckedChange={(on) => exec(() => setOnboardingLinkActiveAction(on), { success: on ? "Le lien remarche." : "Lien désactivé : personne ne peut l'ouvrir." })} />
          </label>
        ) : null}
      </div>

      {link.state === "unavailable" ? (
        <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <Notice tone="warn" role="status">Le lien d&apos;onboarding n&apos;est pas disponible : la clé service de Supabase (SUPABASE_SERVICE_ROLE_KEY) manque chez l&apos;hébergeur, ou la base ne répond pas.</Notice>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", !active && "opacity-60")}>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-mk-input bg-bg px-3 py-2.5 lg:py-2">
              <Link2 className="size-4 shrink-0 text-mk-sub" aria-hidden />
              <input readOnly value={url || link.path} onFocus={(e) => e.currentTarget.select()} aria-label="Lien d'onboarding"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-mk-text outline-none" />
            </div>
            <button type="button" disabled={!active || !url} onClick={() => copy("onboarding", url)} className={cn(copied === "onboarding" ? BTN_SECONDARY : BTN_PRIMARY, "h-11 w-full sm:h-10 sm:w-auto")}>
              {copied === "onboarding" ? <><Check />Copié</> : <><Copy />Copier le lien</>}
            </button>
          </div>
          {!active ? <p className="mt-2 text-[13px] text-mk-sub">Le lien est désactivé : personne ne peut l&apos;ouvrir. Rallume-le pour qu&apos;il remarche.</p> : null}
          <div className="mt-3 flex flex-col gap-2 border-t border-mk-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-mk-sub">Le lien circule trop ? Change-le : l&apos;ancien ne marchera plus.{demoEmail ? <> En démo, connecte-toi avec le compte d&apos;essai Closer, puis tape <span className="font-medium text-mk-text">{demoEmail}</span>.</> : null}</p>
            <button type="button" onClick={() => setConfirm(true)} className={cn(BTN_SECONDARY, "h-11 w-full sm:h-10 sm:w-auto")}><RefreshCw />Changer le lien</button>
          </div>
        </div>
      )}

      <ConfirmDialog open={confirm} onOpenChange={setConfirm} loading={pending} confirmLabel="Changer le lien"
        title="Changer le lien d'onboarding ?" description="L'ancien lien ne marchera plus. Les recrues qui l'ont déjà ouvert devront ouvrir le nouveau et retaper leur e-mail."
        onConfirm={() => { void exec(() => changeOnboardingLinkAction(), { success: "Nouveau lien prêt. Pense à l'envoyer.", onSuccess: () => setConfirm(false) }); }} />
    </section>
  );
}
