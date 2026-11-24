"use client";
import * as React from "react";
import Image from "next/image";
import * as D from "@radix-ui/react-dialog";
import { Check, ChevronRight, EllipsisVertical, MonitorSmartphone, Moon, Palette, Share, Smartphone, Sun, X, type LucideIcon } from "lucide-react";
import { MkSettingsRow } from "@/components/marketing/ui";
import { useThemeMode, type ThemeMode } from "@/lib/hooks/use-local-pref";
import { cn } from "@/lib/utils";

/**
 * Feuille du bas (téléphone) ou fenêtre centrée (ordinateur), aux couleurs LeadConnector :
 * poignée, titre 19 px, croix de fermeture.
 */
function Sheet({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-fade-in" />
        <D.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-[20px] bg-surface pb-[max(env(safe-area-inset-bottom),12px)] shadow-pop focus:outline-none data-[state=open]:animate-rise lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[440px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:pb-3">
          <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-mk-input lg:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3 px-5 pt-3 lg:pt-4">
            <D.Title className="text-[19px] font-semibold text-mk-strong">{title}</D.Title>
            <D.Close aria-label="Fermer" className="-mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-mk-icon transition hover:bg-mk-chip active:bg-mk-chip"><X className="size-5" /></D.Close>
          </div>
          <D.Description className={description ? "px-5 pb-2 text-[14px] text-mk-sub" : "sr-only"}>{description ?? title}</D.Description>
          <div className="overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Téléphone : toute la zone de contenu prend le fond gris-bleu des réglages (le cadre commun la peint en blanc).
 * Feuille de style propre à la page, coupée dès que la page est quittée ou masquée par Next.js (Activity),
 * pour ne jamais déteindre sur une autre page.
 */
const toggleSheet = (el: HTMLStyleElement | null) => {
  if (!el) return;
  el.media = "all";
  return () => { el.media = "not all"; };
};
export function SettingsBackdrop() {
  return <style ref={toggleSheet}>{"@media not all and (min-width: 64rem) { #main { background-color: var(--mk-settings); } }"}</style>;
}

/** Valeur courante à droite d'une ligne de réglage, avant le chevron. */
function Value({ children }: { children: React.ReactNode }) {
  return <span className="flex shrink-0 items-center gap-1 text-[15px] text-mk-sub">{children}<ChevronRight className="size-5 text-mk-icon" aria-hidden /></span>;
}

const MODES: Array<{ key: ThemeMode; label: string; hint?: string; icon: LucideIcon }> = [
  { key: "light", label: "Clair", icon: Sun },
  { key: "dark", label: "Sombre", icon: Moon },
  { key: "system", label: "Système", hint: "Suit le réglage de ton téléphone ou de ton ordinateur", icon: MonitorSmartphone },
];

/** « Apparence » : Clair, Sombre ou Système (gardé dans ce navigateur). */
export function AppearanceRow() {
  const [mode, setMode] = useThemeMode();
  const [open, setOpen] = React.useState(false);
  const current = MODES.find((m) => m.key === mode) ?? MODES[0];
  return (
    <>
      <MkSettingsRow icon={Palette} label="Apparence" onClick={() => setOpen(true)} right={<Value>{current.label}</Value>} />
      <Sheet open={open} onOpenChange={setOpen} title="Apparence" description="Le choix vaut pour cet appareil.">
        <div role="radiogroup" aria-label="Apparence" className="pb-1">
          {MODES.map((m) => {
            const on = m.key === mode;
            return (
              <button key={m.key} type="button" role="radio" aria-checked={on} onClick={() => { setMode(m.key); setOpen(false); }}
                className="flex min-h-14 w-full items-center gap-4 px-5 py-2.5 text-left transition hover:bg-mk-chip/60 active:bg-mk-chip">
                <m.icon className="size-[22px] shrink-0 text-mk-icon" strokeWidth={1.8} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[16px]", on ? "font-semibold text-mk-strong" : "font-medium text-mk-text")}>{m.label}</span>
                  {m.hint ? <span className="block text-[13px] text-mk-sub">{m.hint}</span> : null}
                </span>
                <Check className={cn("size-5 shrink-0 text-accent-2", !on && "invisible")} strokeWidth={2.4} aria-hidden />
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

const noSubscribe = () => () => {};
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[15px] leading-snug text-mk-text">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mk-chip text-[13px] font-semibold text-mk-strong">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
const Key = ({ children }: { children: React.ReactNode }) => <span className="inline-flex items-center gap-1 rounded-md border border-mk-line bg-mk-chip px-1.5 py-px align-middle text-[14px] font-medium text-mk-strong [&_svg]:size-4">{children}</span>;

/** « Installer l'application » : comment la mettre sur l'écran d'accueil (iPhone, Android, ordinateur). */
export function InstallRow() {
  const [open, setOpen] = React.useState(false);
  const installed = React.useSyncExternalStore(noSubscribe, isStandalone, () => false);
  return (
    <>
      <MkSettingsRow icon={Smartphone} label="Installer l'application" sub={installed ? "Déjà installée sur cet appareil" : "Sur ton écran d'accueil"} onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title="Installer l'application">
        <div className="space-y-5 px-5 pb-3 pt-2">
          <div className="flex items-center gap-3 rounded-xl bg-mk-chip p-3">
            <Image src="/brand/marketing-icon-192.png" alt="" width={48} height={48} className="size-12 rounded-[12px]" />
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold text-mk-strong">IconFlow Marketing</span>
              <span className="block text-[13px] text-mk-sub">{installed ? "C'est fait : tu utilises l'application installée." : "Elle s'ouvre en plein écran, comme une app."}</span>
            </span>
          </div>
          <section className="space-y-2.5">
            <h3 className="text-[15px] font-semibold text-mk-strong">iPhone</h3>
            <ol className="space-y-2.5">
              <Step n={1}>Ouvre cette page dans Safari.</Step>
              <Step n={2}>Touche le bouton Partager <Key><Share strokeWidth={2} />Partager</Key> en bas de l&apos;écran.</Step>
              <Step n={3}>Choisis <b className="font-semibold text-mk-strong">«&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;»</b>, puis «&nbsp;Ajouter&nbsp;».</Step>
            </ol>
          </section>
          <section className="space-y-2.5">
            <h3 className="text-[15px] font-semibold text-mk-strong">Android</h3>
            <ol className="space-y-2.5">
              <Step n={1}>Ouvre cette page dans Chrome.</Step>
              <Step n={2}>Touche le menu <Key><EllipsisVertical strokeWidth={2} /></Key> en haut à droite.</Step>
              <Step n={3}>Choisis <b className="font-semibold text-mk-strong">«&nbsp;Installer l&apos;application&nbsp;»</b> (ou «&nbsp;Ajouter à l&apos;écran d&apos;accueil&nbsp;»).</Step>
            </ol>
          </section>
          <p className="text-[13px] text-mk-sub">Sur ordinateur, dans Chrome ou Edge&nbsp;: l&apos;icône d&apos;installation se trouve à droite de la barre d&apos;adresse.</p>
          <D.Close className="h-12 w-full rounded-lg border border-mk-input bg-surface text-[16px] font-semibold text-mk-strong transition hover:bg-mk-chip active:bg-mk-chip">J&apos;ai compris</D.Close>
        </div>
      </Sheet>
    </>
  );
}
