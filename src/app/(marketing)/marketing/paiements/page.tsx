import type { Metadata } from "next";
import Link from "next/link";
import { crmPage, members, salesRole, systemDb } from "@/lib/marketing/crm-server";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { canEditPayments, parseDocuments, parseLinks, PAYMENT_LINKS_KEY, SALES_DOCUMENTS_KEY } from "@/lib/marketing/payments";
import type { KpiEntry } from "@/lib/marketing/types";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { DailyEntry } from "../kpi/kpi-entry";
import { PaymentLinksView } from "./links-client";
import { DocumentsView } from "./documents-client";
import { Heading, TabChips } from "./parts";

export const metadata: Metadata = { title: "Paiements" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
type Tab = "liens" | "documents" | "kpi";
const TABS: Array<{ key: Tab; label: string; module: "marketing_prospects" | "marketing_classement" }> = [
  { key: "liens", label: "Liens de paiement", module: "marketing_prospects" },
  { key: "documents", label: "Documents et contrats", module: "marketing_prospects" },
  { key: "kpi", label: "Saisie des KPI", module: "marketing_classement" },
];
const hrefOf = (t: Tab) => (t === "liens" ? "/marketing/paiements" : `/marketing/paiements?onglet=${t}`);

/**
 * Paiements (écran « Paiements » de LeadConnector ; sur téléphone, « Ventes et opérations ») :
 * liens de paiement, documents et contrats à envoyer aux prospects, saisie des KPI du jour (setters, closers).
 * Chaque onglet n'apparaît que si le compte a le droit correspondant.
 */
export default async function PaiementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const space = await requireMarketingSpace();
  const profile = space.session.profile;
  const tabs = TABS.filter((t) => canAccess(profile, t.module));
  // Ni prospects ni KPI : crmPage renvoie vers la première page autorisée.
  const crm = await crmPage(tabs[0]?.module ?? "marketing_prospects");
  const tab: Tab = tabs.find((t) => t.key === one(sp.onglet))?.key ?? tabs[0].key;
  const canEdit = canEditPayments(profile);
  const settings = await crm.store.settings();

  const nav = (
    <>
      {/* Ordinateur : onglets soulignés (14 px, actif en bleu) */}
      <nav aria-label="Paiements" className="-mt-1 mb-7 hidden gap-7 border-b border-mk-line lg:flex">
        {tabs.map((t) => (
          <Link key={t.key} href={hrefOf(t.key)} aria-current={t.key === tab ? "page" : undefined}
            className={cn("-mb-px border-b-2 pb-3 text-[14px] font-medium transition", t.key === tab ? "border-accent text-accent-2" : "border-transparent text-mk-sub hover:text-mk-strong")}>{t.label}</Link>
        ))}
      </nav>
      {/* Téléphone : pastilles qui défilent */}
      <TabChips label="Paiements" items={tabs.map((t) => ({ href: hrefOf(t.key), label: t.label, active: t.key === tab }))} />
    </>
  );

  if (tab === "liens") {
    const links = parseLinks(await (systemDb() ?? crm.db).setting<unknown>(PAYMENT_LINKS_KEY).catch(() => null));
    return (
      <>
        {nav}
        <PaymentLinksView links={links} canEdit={canEdit} timezone={settings.timezone} />
      </>
    );
  }
  if (tab === "documents") {
    const docs = parseDocuments(await (systemDb() ?? crm.db).setting<unknown>(SALES_DOCUMENTS_KEY).catch(() => null));
    return (
      <>
        {nav}
        <DocumentsView docs={docs} canEdit={canEdit} timezone={settings.timezone} />
      </>
    );
  }

  // Saisie des KPI : le suivi du jour (ce que le CRM ne peut pas compter tout seul).
  const role = salesRole(crm.session), me = crm.session.user.id;
  const now = new Date(), since = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  const [team, entries] = await Promise.all([
    members(),
    crm.db.list<KpiEntry>("marketing_kpi_entries", { where: [["gte", "day", since]], order: ["day", "desc"], limit: 2000 }).then((r) => r as KpiEntry[] | null).catch(() => null),
  ]);
  const today = new Intl.DateTimeFormat("fr-CA", { timeZone: settings.timezone }).format(now);
  return (
    <>
      {nav}
      <Heading title="Saisie des KPI" sub="Tes chiffres du jour : setters et closers" />
      <p className="mb-4 text-[15px] text-mk-sub lg:hidden">Tes chiffres du jour : setters et closers</p>
      {entries === null ? (
        <p className="rounded-lg border border-mk-warn/30 bg-mk-warn-soft px-4 py-3 text-[14px] text-mk-warn">La saisie des KPI demande la migration 0026 de la base. Demande à l&apos;administrateur de la passer.</p>
      ) : (
        <DailyEntry today={today} me={me} canPickMember={!role} defaultRole={role === "closer" ? "closer" : "setter"}
          members={team.filter((m) => m.marketing_role === "setter" || m.marketing_role === "closer").map((m) => ({ id: m.id, name: m.name, role: m.marketing_role as "setter" | "closer" }))}
          entries={entries.map((e) => ({ profile_id: e.profile_id, day: e.day, metrics: e.metrics ?? {}, note: e.note }))} />
      )}
    </>
  );
}
