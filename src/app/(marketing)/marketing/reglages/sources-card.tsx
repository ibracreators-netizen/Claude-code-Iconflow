"use client";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/hooks/use-action";
import { syncBookingsNow } from "@/lib/actions/marketing";

export interface SourceInfo {
  label: string; keyRead: boolean; webhookRead: boolean; webhookUrl: string | null;
  lastRun: string | null; lastOk: boolean | null; lastError: string | null; loading: boolean;
  runs: Array<{ id: string; when: string; mode: string; ok: boolean; summary: string }>;
}

/** Outil de réservation : état de la connexion, dernière synchronisation, journal. */
export function SourcesCard({ info }: { info: SourceInfo }) {
  const { exec, pending } = useAction();
  const sync = () => exec(() => syncBookingsNow(), { onSuccess: () => undefined, success: "Synchronisation terminée." });
  const state = !info.keyRead ? "non connecté" : info.lastOk === false ? "en erreur" : info.loading ? "premier chargement en cours" : info.lastRun ? "connecté" : "connecté, pas encore synchronisé";
  const warn = !info.keyRead || info.lastOk === false;
  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h3 className="text-[15px] font-semibold">Outil de réservation : {info.label}</h3>
        <span className={warn ? "text-[13px] font-semibold text-warning" : "text-[13px] text-fg-2"}>{state}</span>
        <Button size="sm" variant="secondary" className="ml-auto" loading={pending} disabled={!info.keyRead} onClick={sync}><RefreshCw />Synchroniser maintenant</Button>
      </div>
      <p className="mb-4 text-[12.5px] text-muted">Source des rendez-vous et de leur résultat. Lecture par l&apos;API toutes les cinq minutes, rejouable sans doublon. Un rendez-vous passe le prospect en « Audit réservé » ; un contact sans rendez-vous devient un « Nouveau lead » avec une tâche « À appeler ».</p>
      <ul className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
        <li><span className="font-mono text-[12.5px]">ICLOSED_API_KEY</span> <b className={info.keyRead ? "font-semibold text-fg-2" : "font-semibold text-warning"}>{info.keyRead ? "lue" : "manquante"}</b><span className="block text-[12px] text-muted">Clé d&apos;accès à l&apos;API. Sans elle, rien n&apos;est synchronisé.</span></li>
        <li><span className="font-mono text-[12.5px]">ICLOSED_WEBHOOK_SECRET</span> <b className="font-semibold text-fg-2">{info.webhookRead ? "lue" : "non posée"}</b><span className="block text-[12px] text-muted">{info.webhookRead ? "Notifications immédiates activées, en plus de la lecture toutes les cinq minutes." : "Facultatif : notifications immédiates. Sans elle, la lecture toutes les cinq minutes suffit."}</span></li>
        <li className="sm:col-span-2">Dernière synchronisation : <b className="font-semibold text-fg-2">{info.lastRun ?? "jamais"}</b>{info.lastError ? <span className="block text-[12.5px] text-warning">{info.lastError}</span> : null}</li>
        {info.webhookRead && info.webhookUrl ? <li className="sm:col-span-2 text-[12.5px] text-muted">Adresse à donner à iClosed pour les notifications : <span className="break-all font-mono text-fg-2">{info.webhookUrl}</span> suivie de la valeur de la variable.</li> : null}
      </ul>
      {info.runs.length ? (
        <div className="mt-4">
          <div className="mb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">Dernières synchronisations utiles</div>
          <ul className="divide-y divide-border rounded-xl border border-border text-[12.5px]">
            {info.runs.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5"><span className="w-36 text-muted tabular">{r.when}</span><span className="w-20 text-muted">{r.mode}</span><span className={r.ok ? "text-fg-2" : "font-semibold text-warning"}>{r.summary}</span></li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
