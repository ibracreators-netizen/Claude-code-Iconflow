"use client";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/hooks/use-action";
import { syncBookingsNow } from "@/lib/actions/marketing";
import { cn } from "@/lib/utils";
import { BTN_LIGHT, Code, Panel, Pill, SubTitle, TABLE, TableScroll, TD, TH, THEAD, TR } from "./kit";

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
  const tone = warn ? "warn" : info.loading ? "teal" : info.lastRun ? "success" : "neutral";
  return (
    <Panel title={<>Outil de réservation : {info.label}<Pill tone={tone}>{state}</Pill></>}
      description="Source des rendez-vous et de leur résultat. Lecture par l'API toutes les cinq minutes, rejouable sans doublon. Un rendez-vous passe le prospect en « Audit réservé » ; un contact sans rendez-vous devient un « Nouveau lead » avec une tâche « À appeler »."
      action={<Button size="sm" variant="outline" className={BTN_LIGHT} loading={pending} disabled={!info.keyRead} onClick={sync}><RefreshCw />Synchroniser maintenant</Button>}>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li className="rounded-[10px] border border-mk-line p-3.5">
          <div className="flex flex-wrap items-center gap-2"><Code>ICLOSED_API_KEY</Code><Pill tone={info.keyRead ? "success" : "warn"}>{info.keyRead ? "lue" : "manquante"}</Pill></div>
          <p className="mt-1.5 text-[13px] text-mk-sub">Clé d&apos;accès à l&apos;API. Sans elle, rien n&apos;est synchronisé.</p>
        </li>
        <li className="rounded-[10px] border border-mk-line p-3.5">
          <div className="flex flex-wrap items-center gap-2"><Code>ICLOSED_WEBHOOK_SECRET</Code><Pill tone={info.webhookRead ? "success" : "neutral"}>{info.webhookRead ? "lue" : "non posée"}</Pill></div>
          <p className="mt-1.5 text-[13px] text-mk-sub">{info.webhookRead ? "Notifications immédiates activées, en plus de la lecture toutes les cinq minutes." : "Facultatif : notifications immédiates. Sans elle, la lecture toutes les cinq minutes suffit."}</p>
        </li>
        <li className="text-[14px] text-mk-text sm:col-span-2">Dernière synchronisation : <b className="font-semibold text-mk-strong">{info.lastRun ?? "jamais"}</b>{info.lastError ? <span className="mt-0.5 block text-[13px] text-mk-warn">{info.lastError}</span> : null}</li>
        {info.webhookRead && info.webhookUrl ? <li className="text-[13px] text-mk-sub sm:col-span-2">Adresse à donner à iClosed pour les notifications : <Code className="break-all">{info.webhookUrl}</Code> suivie de la valeur de la variable.</li> : null}
      </ul>
      {info.runs.length ? (
        <div className="mt-5">
          <SubTitle className="mb-2">Dernières synchronisations utiles</SubTitle>
          <div className="overflow-hidden rounded-[10px] border border-mk-line">
            <TableScroll>
              <table className={cn(TABLE, "min-w-[620px]")}>
                <thead className={THEAD}><tr><th scope="col" className={TH}>Date</th><th scope="col" className={TH}>Mode</th><th scope="col" className={TH}>Résultat</th></tr></thead>
                <tbody>
                  {info.runs.map((r) => (
                    <tr key={r.id} className={TR}>
                      <td className={cn(TD, "whitespace-nowrap text-[13px] text-mk-sub tabular-nums")}>{r.when}</td>
                      <td className={cn(TD, "whitespace-nowrap text-[13px]")}>{r.mode}</td>
                      <td className={cn(TD, "text-[13px]", r.ok ? "text-mk-text" : "font-semibold text-mk-warn")}>{r.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
