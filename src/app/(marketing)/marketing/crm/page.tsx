import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { crmPage, emailTemplates, isAdmin, members, prospectRows, salesRole } from "@/lib/marketing/crm-server";
import { isMailerConfigured } from "@/lib/email/mailer";
import { canAccess } from "@/lib/permissions";
import { CrmView } from "./crm-view";

export const metadata: Metadata = { title: "Prospects" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  // Anciennes adresses : les contacts ont leur page, l'ajout aussi.
  if (one(sp.vue) === "contacts") redirect("/marketing/contacts");
  if (one(sp.nouveau) === "1") redirect("/marketing/crm/nouveau");

  const crm = await crmPage("marketing_prospects");
  const profile = crm.session.profile, admin = isAdmin(crm.session);
  const now = new Date();
  const [settings, data, team, appts, templates, counts] = await Promise.all([
    crm.store.settings(), prospectRows(crm), members(),
    crm.store.appointments({ from: now.toISOString() }).catch(() => []),
    emailTemplates(), canAccess(profile, "marketing_reception") ? crm.store.counts().catch(() => null) : Promise.resolve(null),
  ]);
  const upcomingIds = [...new Set(appts.filter((a) => a.status === "confirme").map((a) => a.prospect_id))];
  const toCheck = counts?.inboxAttention ?? 0;
  // Le jour « local » (fuseau des réglages) sert aux filtres de date et aux tâches en retard.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

  return (
    <>
      {toCheck > 0 ? (
        <p className="mb-3 rounded-[10px] border border-mk-warn/30 bg-mk-warn-soft px-3.5 py-2.5 text-[13.5px] text-mk-warn lg:mb-4">
          <b className="font-semibold">{toCheck} lead{toCheck > 1 ? "s" : ""} reçu{toCheck > 1 ? "s" : ""} à vérifier.</b> Ils n&apos;ont pas pu entrer dans Prospects tout seuls (erreur ou envoi suspect). <Link href="/marketing/reglages/reception" className="font-medium underline">Les contrôler</Link>
        </p>
      ) : null}
      <CrmView rows={data.rows} stages={data.stages} members={team} today={today} timezone={settings.timezone} upcomingIds={upcomingIds}
        me={crm.session.user.id} canAssign={!salesRole(crm.session)} canManage={canAccess(profile, "marketing_reglages")} canImport={admin} canExport={admin}
        mail={{ templates, mailReady: !crm.demo && isMailerConfigured(), canEditTemplates: admin, myName: profile.display_name ?? null }} />
    </>
  );
}
