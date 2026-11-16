import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import { automationSettings, RULES, type RuleKey } from "@/lib/marketing/automations";
import { isMailerConfigured } from "@/lib/email/mailer";
import { PageHeader } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import type { Contact, Prospect } from "@/lib/marketing/types";
import { AutomationsForm, ClientProposals, type JournalRow, type ProposalRow } from "./automations-client";

export const metadata: Metadata = { title: "Automatisations" };

interface Run { id: string; rule: RuleKey; prospect_id: string | null; action: string; ok: boolean; detail: string | null; created_at: string }
interface Proposal { id: string; prospect_id: string; status: string; created_at: string }

export default async function AutomatisationsPage() {
  const crm = await crmPage("marketing_reglages");
  const admin = isAdmin(crm.session);
  const [settings, general, runs, proposals] = await Promise.all([
    automationSettings(crm.db).catch(() => null), crm.store.settings(),
    crm.db.list<Run>("marketing_automation_runs", { order: ["created_at", "desc"], limit: 60 }).then((r) => r as Run[] | null).catch(() => null),
    admin ? crm.db.list<Proposal>("marketing_client_proposals", { where: [["eq", "status", "en_attente"]], order: ["created_at", "desc"], limit: 50 }).catch(() => [] as Proposal[]) : Promise.resolve([] as Proposal[]),
  ]);
  const ids = [...new Set([...(runs ?? []).map((r) => r.prospect_id), ...proposals.map((p) => p.prospect_id)].filter((v): v is string => !!v))];
  const prospects = ids.length ? await crm.db.list<Prospect>("marketing_prospects", { where: [["in", "id", ids]] }).catch(() => [] as Prospect[]) : [];
  const contactIds = [...new Set(prospects.map((p) => p.contact_id).filter((v): v is string => !!v))];
  const contacts = proposals.length && contactIds.length ? await crm.db.list<Contact>("marketing_contacts", { where: [["in", "id", contactIds]] }).catch(() => [] as Contact[]) : [];
  const byId = new Map(prospects.map((p) => [p.id, p])), contactById = new Map(contacts.map((c) => [c.id, c]));
  const when = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: general.timezone }).format(new Date(iso));
  const title = (k: string) => RULES.find((r) => r.key === k)?.title ?? k;
  const journal: JournalRow[] = (runs ?? []).map((r) => ({ id: r.id, when: when(r.created_at), rule: title(r.rule), prospectId: r.prospect_id, prospect: r.prospect_id ? byId.get(r.prospect_id)?.name ?? byId.get(r.prospect_id)?.email ?? "prospect" : null, action: r.action, ok: r.ok, detail: r.detail }));
  const pending: ProposalRow[] = proposals.map((p) => {
    const pr = byId.get(p.prospect_id), c = pr?.contact_id ? contactById.get(pr.contact_id) : null;
    return { id: p.id, prospectId: p.prospect_id, name: (c?.company ?? c?.name ?? pr?.name ?? "").trim() || null, email: c?.email ?? pr?.email ?? null, amount: pr?.signed_amount ?? null, when: when(p.created_at) };
  });
  const mail = !isMailerConfigured() ? "Le service d'envoi n'est pas configuré : tout email reste en simulation, rien ne part."
    : !general.emails_live ? "Le service d'envoi est configuré, mais l'envoi réel aux prospects est éteint (Réglages › Emails) : les emails aux prospects restent en simulation."
    : "L'envoi réel est allumé : une règle allumée qui écrit à un prospect envoie vraiment l'email.";
  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-[12.5px] text-muted"><Tooltip label="Retour aux réglages"><Link href="/marketing/reglages" className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link></Tooltip><Link href="/marketing/reglages" className="hover:text-fg">Réglages</Link></nav>
      <PageHeader eyebrow="IconFlow Marketing" title="Automatisations" description="Six règles fixes, chacune avec son interrupteur et ses délais. Tout ce qu'elles font est écrit dans le journal en bas de page et dans la chronologie du prospect." />
      <div className="space-y-6">
        {settings === null || runs === null ? (
          <p className="card border-warning/40 p-4 text-[13.5px] text-fg-2"><strong className="font-semibold text-fg">La base n&apos;est pas à jour.</strong> Les automatisations demandent la migration <span className="font-mono text-[12.5px]">0025_marketing_automations.sql</span>. Tant qu&apos;elle n&apos;est pas appliquée, aucune règle ne s&apos;exécute.</p>
        ) : null}
        {admin && pending.length ? <ClientProposals rows={pending} /> : null}
        {settings ? <AutomationsForm initial={settings} mailNote={mail} mailLive={isMailerConfigured() && general.emails_live} /> : null}
        <section className="card p-5">
          <h3 className="text-[15px] font-semibold">Journal</h3>
          <p className="mb-4 text-[12.5px] text-muted">Les 60 dernières exécutions. Une règle n&apos;agit qu&apos;une fois pour un même prospect ou un même rendez-vous.</p>
          {journal.length === 0 ? <p className="text-[13px] text-muted">Aucune règle ne s&apos;est encore exécutée.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead><tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted"><th className="py-2 pr-3 font-medium">Date</th><th className="px-3 py-2 font-medium">Règle</th><th className="px-3 py-2 font-medium">Prospect</th><th className="py-2 pl-3 font-medium">Ce qui a été fait</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {journal.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-fg-2">{r.when}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{r.rule}</td>
                      <td className="px-3 py-2.5">{r.prospectId ? <Link href={`/marketing/crm/${r.prospectId}`} className="font-medium hover:underline">{r.prospect}</Link> : <span className="text-muted">supprimé</span>}</td>
                      <td className="py-2.5 pl-3"><span className={r.ok ? "text-fg-2" : "font-semibold text-danger"}>{r.action}</span>{r.detail ? <span className="block text-[12px] text-muted">{r.detail}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
