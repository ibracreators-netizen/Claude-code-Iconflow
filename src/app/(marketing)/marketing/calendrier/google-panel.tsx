"use client";
import * as React from "react";
import { RefreshCw, Unplug } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { googleDisconnect, googleSetCalendars, googleSyncNow } from "@/lib/actions/marketing";
import type { GoogleAccountView } from "@/lib/marketing/google/sync";

/** Connexion Google du membre : lecture seule, un compte par membre, agendas au choix. */
export function GooglePanel({ account, ready, env, noDatabase }: { account: GoogleAccountView; ready: boolean; env: Array<{ name: string; read: boolean }> | null; noDatabase: boolean }) {
  const { exec, pending } = useAction();
  const [selected, setSelected] = React.useState<string[]>(account.calendars.filter((c) => c.selected).map((c) => c.id));
  const [confirm, setConfirm] = React.useState(false);
  const initial = account.calendars.filter((c) => c.selected).map((c) => c.id).sort().join("|");
  const dirty = [...selected].sort().join("|") !== initial;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const when = account.lastSync ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.lastSync)) : "jamais";

  return (
    <section className="card mt-6 p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Mon agenda Google</h3>
      <p className="mb-4 text-[12.5px] text-muted">Lecture seule : l&apos;app affiche tes agendas, elle n&apos;écrit jamais dans Google. Chaque membre connecte son compte une fois et choisit les agendas visibles par l&apos;équipe.</p>

      {noDatabase ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">La connexion Google demande une base reliée.</p>
        : !ready ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] text-warning">
            Google n&apos;est pas encore configuré sur l&apos;hébergeur.{env ? <ul className="mt-1.5 space-y-0.5 text-fg-2">{env.map((v) => <li key={v.name}><span className="font-mono text-[12.5px]">{v.name}</span> <b className={v.read ? "font-semibold" : "font-semibold text-warning"}>{v.read ? "lue" : "manquante"}</b></li>)}</ul> : " Demande à l'administrateur."}
          </div>
        ) : !account.connected ? (
          <a href="/api/marketing/google/connect" className={buttonVariants({})}>Connecter Google</a>
        ) : (
          <div className="space-y-4">
            {account.status === "invalide" ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] text-warning">
                <span className="min-w-0 flex-1">L&apos;accès à ton compte Google a été retiré ou a expiré : tes agendas ne sont plus mis à jour.</span>
                <a href="/api/marketing/google/connect" className={buttonVariants({ size: "sm" })}>Reconnecter Google</a>
              </div>
            ) : null}
            <p className="text-[13px] text-fg-2">Compte connecté : <b className="font-semibold">{account.email ?? "compte Google"}</b> · dernière lecture : {when}{account.lastError && account.status !== "invalide" ? <span className="block text-[12.5px] text-warning">{account.lastError}</span> : null}</p>
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-semibold">Agendas à afficher</legend>
              {account.calendars.length === 0 ? <p className="text-[13px] text-muted">Aucun agenda lu pour l&apos;instant.</p> : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {account.calendars.map((c) => (
                    <li key={c.id}><label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="size-4 accent-[var(--color-accent)]" /><span className="min-w-0 truncate">{c.name}{c.primary ? " (principal)" : ""}</span></label></li>
                  ))}
                </ul>
              )}
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" loading={pending} disabled={!dirty} onClick={() => exec(() => googleSetCalendars(selected), { success: "Agendas enregistrés." })}>Enregistrer les agendas</Button>
              <Button size="sm" variant="secondary" loading={pending} disabled={account.status === "invalide"} onClick={() => exec(() => googleSyncNow(), { success: "Agendas relus." })}><RefreshCw />Actualiser</Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setConfirm(true)}><Unplug />Déconnecter</Button>
            </div>
          </div>
        )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} loading={pending} danger title="Déconnecter Google ?" description="Tes agendas disparaissent du calendrier de l'équipe et le jeton d'accès est supprimé. Rien n'est modifié dans Google."
        confirmLabel="Déconnecter" onConfirm={() => { void exec(() => googleDisconnect(), { success: "Compte Google déconnecté.", onSuccess: () => setConfirm(false) }); }} />
    </section>
  );
}
