import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { crmPage, systemDb } from "@/lib/marketing/crm-server";
import { canEditPayments, parseDocuments, parseLinks, PAYMENT_LINKS_KEY, SALES_DOCUMENTS_KEY } from "@/lib/marketing/payments";
import { cn } from "@/lib/utils";
import { PaymentLinksView } from "./links-client";
import { DocumentsView } from "./documents-client";
import { TabChips } from "./parts";

export const metadata: Metadata = { title: "Paiements" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
type Tab = "liens" | "documents";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "liens", label: "Liens de paiement" },
  { key: "documents", label: "Documents et contrats" },
];
const hrefOf = (t: Tab) => (t === "liens" ? "/marketing/paiements" : `/marketing/paiements?onglet=${t}`);

/**
 * Paiements (écran « Paiements » de LeadConnector ; sur téléphone, « Ventes et opérations ») : liens de paiement,
 * documents et contrats à envoyer aux prospects. Droit « Prospects et paiements ».
 * La saisie des KPI est dans la page KPI (onglet « Saisie des KPI ») : l'ancienne adresse ?onglet=kpi y mène.
 */
export default async function PaiementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  if (one(sp.onglet) === "kpi") redirect("/marketing/kpi?onglet=saisie");
  const crm = await crmPage("marketing_prospects");
  const profile = crm.session.profile;
  const tab: Tab = TABS.find((t) => t.key === one(sp.onglet))?.key ?? "liens";
  const canEdit = canEditPayments(profile);
  const settings = await crm.store.settings();

  const nav = (
    <>
      {/* Ordinateur : onglets soulignés (14 px, actif en vert) */}
      <nav aria-label="Paiements" className="-mt-1 mb-7 hidden gap-7 border-b border-mk-line lg:flex">
        {TABS.map((t) => (
          <Link key={t.key} href={hrefOf(t.key)} aria-current={t.key === tab ? "page" : undefined}
            className={cn("-mb-px border-b-2 pb-3 text-[14px] font-medium transition", t.key === tab ? "border-accent text-accent-2" : "border-transparent text-mk-sub hover:text-mk-strong")}>{t.label}</Link>
        ))}
      </nav>
      {/* Téléphone : pastilles qui défilent */}
      <TabChips label="Paiements" items={TABS.map((t) => ({ href: hrefOf(t.key), label: t.label, active: t.key === tab }))} />
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
  const docs = parseDocuments(await (systemDb() ?? crm.db).setting<unknown>(SALES_DOCUMENTS_KEY).catch(() => null));
  return (
    <>
      {nav}
      <DocumentsView docs={docs} canEdit={canEdit} timezone={settings.timezone} />
      {/* Tant que la base n'est pas mise à jour, cette liste reste lisible par tout compte de l'espace Marketing (voir payments.ts). */}
      {canEdit ? <p className="mt-3 text-[13px] text-mk-sub">Pour un contrat, mets un lien protégé (accès sur invitation) : pour l&apos;instant, tout compte de l&apos;espace Marketing peut lire cette liste.</p> : null}
    </>
  );
}
