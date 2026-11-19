import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import { automationSettings, RULES, type RuleKey } from "@/lib/marketing/automations";
import { isMailerConfigured } from "@/lib/email/mailer";
import { PageHeader } from "@/components/ui/misc";
import type { Contact, Prospect } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BackLink, Notice, Panel, TABLE, TableScroll, TD, TH, THEAD, TR } from "../kit";
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
      <BackLink href="/marketing/reglages" label="Réglages" title="Retour aux réglages" />
      <PageHeader title="Automatisations" description="Six règles fixes, chacune avec son interrupteur et ses délais. Tout ce qu'elles font est écrit dans le journal en bas de page et dans la chronologie du prospect." />
      <div className="space-y-4 lg:space-y-6">
        {settings === null || runs === null ? (
          <Notice tone="warn" icon={TriangleAlert} title="La base n'est pas à jour.">Les automatisations demandent la migration <b className="font-semibold">0025_marketing_automations.sql</b>. Tant qu&apos;elle n&apos;est pas appliquée, aucune règle ne s&apos;exécute.</Notice>
        ) : null}
        {admin && pending.length ? <ClientProposals rows={pending} /> : null}
        {settings ? <AutomationsForm initial={settings} mailNote={mail} mailLive={isMailerConfigured() && general.emails_live} /> : null}
        <Panel flush={journal.length > 0} title="Journal" description="Les 60 dernières exécutions. Une règle n'agit qu'une fois pour un même prospect ou un même rendez-vous.">
          {journal.length === 0 ? <p className="text-[14px] text-mk-sub">Aucune règle ne s&apos;est encore exécutée.</p> : (
            <TableScroll>
              <table className={cn(TABLE, "min-w-[760px]")}>
                <thead className={THEAD}><tr><th scope="col" className={TH}>Date</th><th scope="col" className={TH}>Règle</th><th scope="col" className={TH}>Prospect</th><th scope="col" className={TH}>Ce qui a été fait</th></tr></thead>
                <tbody>
                  {journal.map((r) => (
                    <tr key={r.id} className={TR}>
                      <td className={cn(TD, "whitespace-nowrap text-[13px] text-mk-sub tabular-nums")}>{r.when}</td>
                      <td className={cn(TD, "whitespace-nowrap text-mk-strong")}>{r.rule}</td>
                      <td className={TD}>{r.prospectId ? <Link href={`/marketing/crm/${r.prospectId}`} className="font-medium text-mk-strong hover:text-accent-2 hover:underline">{r.prospect}</Link> : <span className="text-mk-sub">supprimé</span>}</td>
                      <td className={TD}><span className={r.ok ? "text-mk-text" : "font-semibold text-mk-danger"}>{r.action}</span>{r.detail ? <span className="block text-[13px] text-mk-sub">{r.detail}</span> : null}</td>
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
