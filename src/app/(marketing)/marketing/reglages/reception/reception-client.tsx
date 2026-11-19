"use client";
import * as React from "react";
import Link from "next/link";
import { FlaskConical, Play, RotateCcw, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAction } from "@/lib/hooks/use-action";
import { processInboxNow, reprocessInboxRow, sendTestLeadAction } from "@/lib/actions/marketing";
import { INBOX_ALERT, INBOX_STATUS, type InboxRow, type InboxStatus } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, BTN_LIGHT, CARD, Pill, SubTitle, TABLE, TableScroll, TD, TH, THEAD, TR, type Tone } from "../kit";

const TONE: Record<InboxStatus, Tone> = { recu: "neutral", traite: "success", erreur: "danger", suspect: "warn" };
const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

export function ReceptionActions() {
  const run = useAction();
  const test = useAction();
  return (
    <>
      <Button variant="outline" className={BTN_LIGHT} loading={test.pending} onClick={() => test.exec(() => sendTestLeadAction(), { success: "Lead de test envoyé et traité. Aucun prospect créé." })}><FlaskConical />Envoyer un lead de test</Button>
      <Button className={BTN} loading={run.pending} onClick={() => run.exec(() => processInboxNow(), { success: "Lignes en attente traitées." })}><Play />Traiter maintenant</Button>
    </>
  );
}

export function InboxTable({ rows, timezone, canSeeProspects }: { rows: InboxRow[]; timezone: string; canSeeProspects: boolean }) {
  const { exec, pending } = useAction();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<InboxRow | null>(null);
  const fmt = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone }), [timezone]);
  const retry = (id: string) => { setBusy(id); void exec(() => reprocessInboxRow(id), { success: "Ligne retraitée." }).finally(() => setBusy(null)); };

  return (
    <>
      <section className={cn(CARD, "overflow-hidden")}>
        <TableScroll>
          <table className={cn(TABLE, "min-w-[880px]")}>
            <thead className={THEAD}>
              <tr>
                <th scope="col" className={TH}>Reçu le</th><th scope="col" className={TH}>Site et page d&apos;entrée</th><th scope="col" className={TH}>Contact</th>
                <th scope="col" className={TH}>Campagne</th><th scope="col" className={TH}>Statut</th><th scope="col" className={cn(TH, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const utm = Object.entries(r.utm ?? {});
                return (
                  <tr key={r.id} className={cn(TR, "align-top")}>
                    <td className={cn(TD, "whitespace-nowrap align-top text-[13px] tabular-nums")}>{fmt.format(new Date(r.received_at))}{r.is_test ? <div className="mt-1.5"><Pill>Test</Pill></div> : null}</td>
                    <td className={cn(TD, "max-w-[240px] align-top")}>
                      <div className="truncate font-medium text-mk-strong">{r.site ?? "site inconnu"}</div>
                      <div className="truncate text-[13px] text-mk-sub" title={r.landing_page ?? undefined}>{r.landing_page ?? <span className="text-mk-warn">page d&apos;entrée absente</span>}</div>
                    </td>
                    <td className={cn(TD, "max-w-[220px] align-top")}>
                      <div className="truncate text-mk-strong">{text(r.payload?.email) || <span className="text-mk-warn">email absent</span>}</div>
                      <div className="truncate text-[13px] text-mk-sub">{[text(r.payload?.name) || text(r.payload?.prenom), text(r.payload?.marque)].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className={cn(TD, "max-w-[240px] align-top")}>
                      {utm.length ? <div className="flex flex-wrap gap-1">{utm.slice(0, 4).map(([k, v]) => <span key={k} className="max-w-full truncate rounded-full bg-mk-chip px-2 py-0.5 text-[12px] text-mk-text" title={`${k}=${v}`}>{k.replace(/^utm_/, "")}={v}</span>)}{utm.length > 4 ? <span className="text-[12px] text-mk-sub">+{utm.length - 4}</span> : null}</div> : <span className="text-[13px] text-mk-sub">aucun paramètre</span>}
                    </td>
                    <td className={cn(TD, "max-w-[240px] align-top")}>
                      <Pill tone={TONE[r.status]}>{INBOX_STATUS[r.status]}</Pill>
                      {r.error ? <div className="mt-1.5 text-[13px] text-mk-text">{r.error}</div> : null}
                      {r.alert_status ? <div className="mt-1 text-[12.5px] text-mk-sub" title={r.alert_error ?? undefined}>{INBOX_ALERT[r.alert_status]}</div> : r.processed_at ? <div className="mt-1 text-[12.5px] text-mk-sub" title="Les alertes sont regroupées : celle-ci partira avec le prochain message.">Alerte en attente</div> : null}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-right align-top")}>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" className={BTN_GHOST} onClick={() => setDetail(r)}><ScanSearch />Détail</Button>
                        <Button size="sm" variant="outline" className={BTN_LIGHT} loading={pending && busy === r.id} disabled={pending} onClick={() => retry(r.id)}><RotateCcw />Retraiter</Button>
                      </div>
                      {r.prospect_id && canSeeProspects ? <Link href={`/marketing/crm/${r.prospect_id}`} className="mt-1.5 inline-block text-[13px] font-medium text-accent-2 hover:underline">Voir le prospect</Link> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent side="right" title="Détail du lead reçu" description="La charge utile est conservée telle que le site l'a envoyée.">
          {detail ? (
            <div className="space-y-5 text-[14px]">
              <dl className="overflow-hidden rounded-[10px] border border-mk-line">
                {([["Statut", INBOX_STATUS[detail.status]], ["Reçu le", fmt.format(new Date(detail.received_at))], ["Traité le", detail.processed_at ? fmt.format(new Date(detail.processed_at)) : "pas encore"], ["Tentatives", String(detail.attempts)],
                  ["Site", detail.site ?? "inconnu"], ["Page d'entrée", detail.landing_page ?? "absente"], ["Page du formulaire", detail.page ?? "absente"], ["Site d'origine", detail.referrer ?? "inconnu"],
                  ["Alerte", detail.alert_status ? INBOX_ALERT[detail.alert_status] + (detail.alert_error ? ` (${detail.alert_error})` : "") : detail.processed_at ? "en attente (regroupée avec le prochain message)" : "aucune"], ["Message", detail.error ?? "aucun"], ["Identifiant de requête", detail.request_id]] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-x-3 border-b border-mk-line px-3.5 py-2.5 last:border-b-0">
                    <dt className="text-[13px] font-medium text-mk-sub">{k}</dt><dd className="min-w-0 break-words text-mk-strong">{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <SubTitle className="mb-2">Charge utile brute</SubTitle>
                <pre className="max-h-[340px] overflow-auto rounded-[10px] border border-mk-line bg-surface-2 p-3.5 font-sans text-[12.5px] leading-relaxed text-mk-text">{JSON.stringify(detail.payload, null, 2)}</pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
