import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { crmPage, isAdmin, members, stagesFor } from "@/lib/marketing/crm-server";
import { PageHeader } from "@/components/ui/misc";
import { CONTACT_COLUMNS, OPPORTUNITY_COLUMNS } from "@/lib/marketing/ghl";
import { cn } from "@/lib/utils";
import { Panel, Pill, SubTitle, TABLE, TableScroll, TD, TH, THEAD, TR } from "../kit";
import { GhlImport } from "./import-client";

export const metadata: Metadata = { title: "Import GoHighLevel" };
interface ImportRow { id: string; kind: string; filename: string | null; total: number; created: number; merged: number; rejected: number; status: string; created_at: string }

export default async function ImportPage() {
  const crm = await crmPage("marketing_reglages");
  if (!isAdmin(crm.session)) redirect("/marketing/reglages");
  const [stages, team, settings, history] = await Promise.all([stagesFor(crm), members(), crm.store.settings(), crm.db.list<ImportRow>("marketing_imports", { order: ["created_at", "desc"], limit: 20 }).catch(() => [] as ImportRow[])]);
  const when = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone });
  const cols = (c: Record<string, readonly string[]>, keys: string[]) => (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Colonnes">{keys.map((k) => <li key={k} className="rounded-full bg-mk-chip px-2.5 py-1 text-[12.5px] font-medium text-mk-text">{c[k][0]}</li>)}</ul>
  );
  return (
    <>
      <PageHeader title="Import GoHighLevel" description="Deux fichiers CSV : les contacts d'abord, les opportunités ensuite. L'import se relance sans créer de doublon." />
      <div className="space-y-4 lg:space-y-6">
        <Panel title="Colonnes attendues" description="Les intitulés de l'export GHL en anglais sont reconnus tels quels, ainsi que leurs équivalents français. L'ordre des colonnes n'a pas d'importance, les colonnes en plus sont ignorées.">
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-[10px] border border-mk-line p-4">
              <SubTitle>1. Contacts</SubTitle>
              {cols(CONTACT_COLUMNS, ["external_id", "first_name", "last_name", "email", "phone", "company", "tags", "source", "created"])}
              <p className="mt-3 text-[13px] text-mk-sub">Indispensable : Email ou Phone (ou Contact Id). Le reste est facultatif.</p>
            </section>
            <section className="rounded-[10px] border border-mk-line p-4">
              <SubTitle>2. Opportunités</SubTitle>
              {cols(OPPORTUNITY_COLUMNS, ["external_id", "title", "contact_external_id", "contact_name", "email", "phone", "pipeline", "stage", "status", "value", "source", "assigned", "created", "tags"])}
              <p className="mt-3 text-[13px] text-mk-sub">Indispensable : Stage, et de quoi retrouver le contact (Contact ID, Email ou Phone).</p>
            </section>
          </div>
        </Panel>
        <GhlImport stages={stages.map((s) => ({ key: s.key, name: s.name }))} members={team.map((m) => ({ id: m.id, name: m.name }))} />
        <Panel flush={history.length > 0} title="Imports passés" description="Les vingt derniers.">
          {history.length === 0 ? <p className="text-[14px] text-mk-sub">Aucun import pour l&apos;instant.</p> : (
            <TableScroll>
              <table className={cn(TABLE, "min-w-[680px]")}>
                <thead className={THEAD}><tr><th scope="col" className={TH}>Date</th><th scope="col" className={TH}>Fichier</th><th scope="col" className={cn(TH, "text-right")}>Lignes</th><th scope="col" className={cn(TH, "text-right")}>Créés</th><th scope="col" className={cn(TH, "text-right")}>Fusionnés</th><th scope="col" className={cn(TH, "text-right")}>Rejetés</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className={TR}>
                      <td className={cn(TD, "whitespace-nowrap text-[13px] text-mk-sub tabular-nums")}>{when.format(new Date(h.created_at))}{h.status !== "termine" ? <Pill tone="warn" className="ml-2">interrompu</Pill> : null}</td>
                      <td className={cn(TD, "max-w-[280px] truncate text-mk-strong")}>{h.kind === "ghl_contacts" ? "Contacts" : "Opportunités"} · {h.filename ?? "fichier"}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{h.total}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{h.created}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{h.merged}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{h.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Panel>
      </div>
    </>
  );
}
