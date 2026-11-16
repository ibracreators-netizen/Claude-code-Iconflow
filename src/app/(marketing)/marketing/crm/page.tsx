import type { Metadata } from "next";
import Link from "next/link";
import { Contact as ContactIcon } from "lucide-react";
import { crmPage, emailTemplates, isAdmin, members, prospectRows, salesRole } from "@/lib/marketing/crm-server";
import { isMailerConfigured } from "@/lib/email/mailer";
import { canAccess } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { CrmView, NewLeadButton } from "./crm-view";
import { ContactsTable, NewContactButton } from "./contacts-client";

export const metadata: Metadata = { title: "CRM" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_prospects");
  const profile = crm.session.profile, admin = isAdmin(crm.session);
  const wanted = one(sp.vue);
  const canContacts = canAccess(profile, "marketing_contacts");
  const view = wanted === "contacts" && canContacts ? "contacts" : wanted === "liste" || wanted === "tableau" ? "liste" : "kanban";
  const now = new Date();
  const [settings, data, team, appts, templates, counts] = await Promise.all([
    crm.store.settings(), prospectRows(crm), members(),
    crm.store.appointments({ from: now.toISOString() }).catch(() => []),
    emailTemplates(), canAccess(profile, "marketing_reception") ? crm.store.counts().catch(() => null) : Promise.resolve(null),
  ]);
  const upcomingIds = [...new Set(appts.filter((a) => a.status === "confirme").map((a) => a.prospect_id))];
  const toCheck = counts?.inboxAttention ?? 0;
  const deals: Record<string, number> = {};
  for (const p of data.rows) if (p.contact_id) deals[p.contact_id] = (deals[p.contact_id] ?? 0) + 1;

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="CRM" description={<span className="hidden sm:inline">Tous tes leads au même endroit : les faire avancer, les attribuer, leur écrire, suivre leur historique.</span>}
        actions={<div className="flex flex-wrap items-center gap-2">{crm.demo ? <DemoBadge /> : null}{admin ? <a href={`/api/marketing/export?quoi=${view === "contacts" ? "contacts" : "prospects"}`} className={cn(buttonVariants({ variant: "secondary" }), "hidden sm:inline-flex")}>Exporter</a> : null}{view === "contacts" ? <NewContactButton /> : <NewLeadButton stages={data.stages} autoOpen={one(sp.nouveau) === "1"} />}</div>} />
      {toCheck > 0 ? (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[13px] text-warning">
          <b className="font-semibold">{toCheck} lead{toCheck > 1 ? "s" : ""} reçu{toCheck > 1 ? "s" : ""} à vérifier.</b> Ils n&apos;ont pas pu entrer dans le CRM tout seuls (erreur ou envoi suspect). <Link href="/marketing/reglages/reception" className="underline">Les contrôler</Link>
        </p>
      ) : null}
      {view === "contacts" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/marketing/crm" className="inline-flex h-9 items-center rounded-full bg-surface-2 px-3 text-[13px] text-muted transition hover:text-fg">Kanban</Link>
            <Link href="/marketing/crm?vue=liste" className="inline-flex h-9 items-center rounded-full bg-surface-2 px-3 text-[13px] text-muted transition hover:text-fg">Liste</Link>
            <span aria-current="page" className="inline-flex h-9 items-center rounded-full bg-accent-soft px-3 text-[13px] text-accent-2">Contacts</span>
          </div>
          {data.contacts.length === 0
            ? <div className="card"><EmptyState icon={ContactIcon} title="Aucun contact" description="Un contact est créé tout seul à l'arrivée d'un lead. Tu peux aussi en ajouter un à la main." /></div>
            : <ContactsTable contacts={[...data.contacts].sort((a, b) => b.created_at.localeCompare(a.created_at))} deals={deals} timezone={settings.timezone} canExport={false} />}
        </div>
      ) : (
        <CrmView rows={data.rows} stages={data.stages} members={team} view={view} today={now.toISOString().slice(0, 10)} timezone={settings.timezone} upcomingIds={upcomingIds}
          me={crm.session.user.id} canAssign={!salesRole(crm.session)} canManage={canAccess(profile, "marketing_reglages")}
          mail={{ templates, mailReady: !crm.demo && isMailerConfigured(), canEditTemplates: admin, myName: profile.display_name ?? null }} />
      )}
    </>
  );
}
