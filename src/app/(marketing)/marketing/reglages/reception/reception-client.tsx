"use client";
import * as React from "react";
import Link from "next/link";
import { FlaskConical, Play, RotateCcw, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAction } from "@/lib/hooks/use-action";
import { processInboxNow, reprocessInboxRow, sendTestLeadAction } from "@/lib/actions/marketing";
import { INBOX_ALERT, INBOX_STATUS, type InboxRow, type InboxStatus } from "@/lib/marketing/types";

const TONE: Record<InboxStatus, "neutral" | "success" | "danger" | "warning"> = { recu: "neutral", traite: "success", erreur: "danger", suspect: "warning" };
const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

export function ReceptionActions() {
  const run = useAction();
  const test = useAction();
  return (
    <>
      <Button variant="secondary" loading={test.pending} onClick={() => test.exec(() => sendTestLeadAction(), { success: "Lead de test envoyé et traité. Aucun prospect créé." })}><FlaskConical />Envoyer un lead de test</Button>
      <Button loading={run.pending} onClick={() => run.exec(() => processInboxNow(), { success: "Lignes en attente traitées." })}><Play />Traiter maintenant</Button>
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
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
              <th className="px-4 py-3 font-medium">Reçu le</th><th className="px-3 py-3 font-medium">Site et page d&apos;entrée</th><th className="px-3 py-3 font-medium">Contact</th>
              <th className="px-3 py-3 font-medium">Campagne</th><th className="px-3 py-3 font-medium">Statut</th><th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const utm = Object.entries(r.utm ?? {});
              return (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 tabular text-fg-2">{fmt.format(new Date(r.received_at))}{r.is_test ? <div className="mt-1"><Badge tone="outline">Test</Badge></div> : null}</td>
                  <td className="max-w-[240px] px-3 py-3">
                    <div className="truncate font-medium text-fg">{r.site ?? "site inconnu"}</div>
                    <div className="truncate text-[12px] text-muted" title={r.landing_page ?? undefined}>{r.landing_page ?? <span className="text-warning">page d&apos;entrée absente</span>}</div>
                  </td>
                  <td className="max-w-[200px] px-3 py-3">
                    <div className="truncate text-fg">{text(r.payload?.email) || <span className="text-warning">email absent</span>}</div>
                    <div className="truncate text-[12px] text-muted">{[text(r.payload?.name) || text(r.payload?.prenom), text(r.payload?.marque)].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="max-w-[220px] px-3 py-3">
                    {utm.length ? <div className="flex flex-wrap gap-1">{utm.slice(0, 4).map(([k, v]) => <span key={k} className="max-w-full truncate rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2" title={`${k}=${v}`}>{k.replace(/^utm_/, "")}={v}</span>)}{utm.length > 4 ? <span className="text-[11px] text-muted">+{utm.length - 4}</span> : null}</div> : <span className="text-[12px] text-muted">aucun paramètre</span>}
                  </td>
                  <td className="max-w-[230px] px-3 py-3">
                    <Badge tone={TONE[r.status]}>{INBOX_STATUS[r.status]}</Badge>
                    {r.error ? <div className="mt-1 text-[12px] text-fg-2">{r.error}</div> : null}
                    {r.alert_status ? <div className="mt-1 text-[11.5px] text-muted" title={r.alert_error ?? undefined}>{INBOX_ALERT[r.alert_status]}</div> : r.processed_at ? <div className="mt-1 text-[11.5px] text-muted" title="Les alertes sont regroupées : celle-ci partira avec le prochain message.">Alerte en attente</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(r)}><ScanSearch />Détail</Button>
                      <Button size="sm" variant="secondary" loading={pending && busy === r.id} disabled={pending} onClick={() => retry(r.id)}><RotateCcw />Retraiter</Button>
                    </div>
                    {r.prospect_id && canSeeProspects ? <Link href={`/marketing/crm/${r.prospect_id}`} className="mt-1 inline-block text-[12px] text-accent-2 hover:underline">Voir le prospect</Link> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent side="right" title="Détail du lead reçu" description="La charge utile est conservée telle que le site l'a envoyée.">
          {detail ? (
            <div className="space-y-4 text-[13px]">
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2">
                {([["Statut", INBOX_STATUS[detail.status]], ["Reçu le", fmt.format(new Date(detail.received_at))], ["Traité le", detail.processed_at ? fmt.format(new Date(detail.processed_at)) : "pas encore"], ["Tentatives", String(detail.attempts)],
                  ["Site", detail.site ?? "inconnu"], ["Page d'entrée", detail.landing_page ?? "absente"], ["Page du formulaire", detail.page ?? "absente"], ["Site d'origine", detail.referrer ?? "inconnu"],
                  ["Alerte", detail.alert_status ? INBOX_ALERT[detail.alert_status] + (detail.alert_error ? ` (${detail.alert_error})` : "") : detail.processed_at ? "en attente (regroupée avec le prochain message)" : "aucune"], ["Message", detail.error ?? "aucun"], ["Identifiant de requête", detail.request_id]] as Array<[string, string]>).map(([k, v]) => (
                  <React.Fragment key={k}><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words text-fg">{v}</dd></React.Fragment>
                ))}
              </dl>
              <div>
                <div className="mb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">Charge utile brute</div>
                <pre className="max-h-[340px] overflow-auto rounded-xl border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg-2">{JSON.stringify(detail.payload, null, 2)}</pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
