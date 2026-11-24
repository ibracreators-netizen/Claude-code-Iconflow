"use client";
import * as React from "react";
import { CalendarSync, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { googleDisconnect, googleSetCalendars, googleSyncNow } from "@/lib/actions/marketing";
import type { GoogleAccountView } from "@/lib/marketing/google/sync";
import { cn } from "@/lib/utils";

export interface GoogleProps { account: GoogleAccountView; ready: boolean; env: Array<{ name: string; read: boolean }> | null; noDatabase: boolean }

const BTN = "h-9 rounded-[8px] px-3.5 text-[14px]";
const CONNECT = "inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-accent px-4 text-[15px] font-semibold text-accent-fg transition hover:brightness-110 lg:h-9 lg:w-auto lg:text-[14px] lg:font-medium";

/**
 * Connexion Google du membre : lecture seule, un compte par membre, agendas au choix.
 * `bare` : sans cadre (dans la feuille du téléphone) ; sinon une carte (panneau de droite sur ordinateur).
 */
export function GooglePanel({ account, ready, env, noDatabase, bare }: GoogleProps & { bare?: boolean }) {
  const { exec, pending } = useAction();
  const [selected, setSelected] = React.useState<string[]>(account.calendars.filter((c) => c.selected).map((c) => c.id));
  const [confirm, setConfirm] = React.useState(false);
  const initial = account.calendars.filter((c) => c.selected).map((c) => c.id).sort().join("|");
  const dirty = [...selected].sort().join("|") !== initial;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const when = account.lastSync ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.lastSync)) : "jamais";
  const state = noDatabase || !ready ? null : account.connected ? (account.status === "invalide" ? { label: "À reconnecter", cls: "bg-mk-warn-soft text-mk-warn" } : { label: "Connecté", cls: "bg-mk-success-soft text-mk-success" }) : { label: "Non connecté", cls: "bg-mk-chip text-mk-sub" };

  const body = (
    <>
      {bare ? (state ? <span className={cn("mb-2 inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium", state.cls)}>{state.label}</span> : null) : (
        <div className="mb-2 flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><CalendarSync className="size-[18px]" strokeWidth={1.8} /></span>
          <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-mk-strong">Mon agenda Google</h3>
          {state ? <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium", state.cls)}>{state.label}</span> : null}
        </div>
      )}
      <p className="text-[13px] leading-relaxed text-mk-sub">Lecture seule : l&apos;app affiche tes agendas, elle n&apos;écrit jamais dans Google. Chaque membre connecte son compte une fois et choisit les agendas visibles par l&apos;équipe.</p>

      <div className="mt-3">
        {noDatabase ? <p className="rounded-[8px] bg-mk-chip px-3 py-2 text-[13px] text-mk-sub">La connexion Google demande une base reliée.</p>
          : !ready ? (
            <div className="rounded-[8px] border border-mk-warn/30 bg-mk-warn-soft px-3 py-2.5 text-[13px] text-mk-warn">
              Google n&apos;est pas encore configuré sur l&apos;hébergeur.{env ? <ul className="mt-1.5 space-y-0.5 text-mk-text">{env.map((v) => <li key={v.name}><span className="font-mono text-[12.5px]">{v.name}</span> <b className={v.read ? "font-semibold" : "font-semibold text-mk-warn"}>{v.read ? "lue" : "manquante"}</b></li>)}</ul> : " Demande à l'administrateur."}
            </div>
          ) : !account.connected ? (
            <a href="/api/marketing/google/connect" className={CONNECT}>Connecter Google</a>
          ) : (
            <div className="space-y-3">
              {account.status === "invalide" ? (
                <div role="alert" className="space-y-2 rounded-[8px] border border-mk-warn/30 bg-mk-warn-soft px-3 py-2.5 text-[13px] text-mk-warn">
                  <p>L&apos;accès à ton compte Google a été retiré ou a expiré : tes agendas ne sont plus mis à jour.</p>
                  <a href="/api/marketing/google/connect" className={CONNECT}>Reconnecter Google</a>
                </div>
              ) : null}
              <p className="text-[13px] text-mk-text">Compte : <b className="font-semibold text-mk-strong">{account.email ?? "compte Google"}</b><span className="block text-mk-sub">Dernière lecture : {when}</span>{account.lastError && account.status !== "invalide" ? <span className="block text-[12.5px] text-mk-warn">{account.lastError}</span> : null}</p>
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-semibold text-mk-strong">Agendas à afficher</legend>
                {account.calendars.length === 0 ? <p className="text-[13px] text-mk-sub">Aucun agenda lu pour l&apos;instant.</p> : (
                  <ul className="space-y-1">
                    {account.calendars.map((c) => (
                      <li key={c.id}><label className="flex min-h-9 items-center gap-2.5 text-[14px] text-mk-text"><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="size-[18px] accent-[var(--color-accent)]" /><span className="min-w-0 truncate">{c.name}{c.primary ? " (principal)" : ""}</span></label></li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className={BTN} loading={pending} disabled={!dirty} onClick={() => exec(() => googleSetCalendars(selected), { onSuccess: (r) => toast.success(r.busy ? "Agendas enregistrés. Ils s'afficheront à la prochaine lecture, dans quelques minutes." : "Agendas enregistrés.") })}>Enregistrer</Button>
                <Button size="sm" variant="outline" className={cn(BTN, "border-mk-input text-mk-strong")} loading={pending} disabled={account.status === "invalide"} onClick={() => exec(() => googleSyncNow(), { success: "Agendas relus." })}><RefreshCw />Actualiser</Button>
                <Button size="sm" variant="ghost" className={cn(BTN, "ml-auto text-mk-sub")} onClick={() => setConfirm(true)}><Unplug />Déconnecter</Button>
              </div>
            </div>
          )}
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} loading={pending} danger title="Déconnecter Google ?" description="Tes agendas disparaissent du calendrier de l'équipe et le jeton d'accès est supprimé. Rien n'est modifié dans Google."
        confirmLabel="Déconnecter" onConfirm={() => { void exec(() => googleDisconnect(), { success: "Compte Google déconnecté.", onSuccess: () => setConfirm(false) }); }} />
    </>
  );
  return bare ? <div className="px-3 pb-2 pt-1">{body}</div> : <section className="rounded-xl border border-mk-line bg-surface p-4 shadow-soft">{body}</section>;
}
