import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { crmPage, isAdmin, members, stagesFor } from "@/lib/marketing/crm-server";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { CONTACT_COLUMNS, OPPORTUNITY_COLUMNS } from "@/lib/marketing/ghl";
import { GhlImport } from "./import-client";

export const metadata: Metadata = { title: "Import GoHighLevel" };
interface ImportRow { id: string; kind: string; filename: string | null; total: number; created: number; merged: number; rejected: number; status: string; created_at: string }

export default async function ImportPage() {
  const crm = await crmPage("marketing_reglages");
  if (!isAdmin(crm.session)) redirect("/marketing/reglages");
  const [stages, team, settings, history] = await Promise.all([stagesFor(crm), members(), crm.store.settings(), crm.db.list<ImportRow>("marketing_imports", { order: ["created_at", "desc"], limit: 20 }).catch(() => [] as ImportRow[])]);
  const when = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone });
  const cols = (c: Record<string, readonly string[]>, keys: string[]) => keys.map((k) => c[k][0]).join(", ");
  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour aux réglages"><Link href="/marketing/reglages" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/reglages" className="hover:text-fg">Réglages</Link></nav>
      <PageHeader eyebrow="IconFlow Marketing" title="Reprise des données GoHighLevel" description="Deux fichiers CSV : les contacts d'abord, les opportunités ensuite. L'import se relance sans créer de doublon." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Colonnes attendues" description="Les intitulés de l'export GHL en anglais sont reconnus tels quels, ainsi que leurs équivalents français. L'ordre des colonnes n'a pas d'importance, les colonnes en plus sont ignorées." />
          <CardBody>
            <dl className="grid gap-4 text-[13px] md:grid-cols-2">
              <div><dt className="mb-1 font-semibold">1. Contacts</dt><dd className="text-fg-2">{cols(CONTACT_COLUMNS, ["external_id", "first_name", "last_name", "email", "phone", "company", "tags", "source", "created"])}.</dd><dd className="mt-1 text-[12.5px] text-muted">Indispensable : Email ou Phone (ou Contact Id). Le reste est facultatif.</dd></div>
              <div><dt className="mb-1 font-semibold">2. Opportunités</dt><dd className="text-fg-2">{cols(OPPORTUNITY_COLUMNS, ["external_id", "title", "contact_external_id", "contact_name", "email", "phone", "pipeline", "stage", "status", "value", "source", "assigned", "created", "tags"])}.</dd><dd className="mt-1 text-[12.5px] text-muted">Indispensable : Stage, et de quoi retrouver le contact (Contact ID, Email ou Phone).</dd></div>
            </dl>
          </CardBody>
        </Card>
        <GhlImport stages={stages.map((s) => ({ key: s.key, name: s.name }))} members={team.map((m) => ({ id: m.id, name: m.name }))} />
        <Card>
          <CardHeader title="Imports passés" description="Les vingt derniers." />
          <CardBody>
            {history.length === 0 ? <p className="text-[13px] text-muted">Aucun import pour l&apos;instant.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead><tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted"><th className="py-2 pr-3 font-medium">Date</th><th className="px-3 py-2 font-medium">Fichier</th><th className="px-3 py-2 text-right font-medium">Lignes</th><th className="px-3 py-2 text-right font-medium">Créés</th><th className="px-3 py-2 text-right font-medium">Fusionnés</th><th className="py-2 pl-3 text-right font-medium">Rejetés</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {history.map((h) => (
                      <tr key={h.id}><td className="whitespace-nowrap py-2 pr-3 text-muted">{when.format(new Date(h.created_at))}{h.status !== "termine" ? " · interrompu" : ""}</td><td className="max-w-[260px] truncate px-3 py-2">{h.kind === "ghl_contacts" ? "Contacts" : "Opportunités"} · {h.filename ?? "fichier"}</td><td className="px-3 py-2 text-right tabular">{h.total}</td><td className="px-3 py-2 text-right tabular">{h.created}</td><td className="px-3 py-2 text-right tabular">{h.merged}</td><td className="py-2 pl-3 text-right tabular">{h.rejected}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
