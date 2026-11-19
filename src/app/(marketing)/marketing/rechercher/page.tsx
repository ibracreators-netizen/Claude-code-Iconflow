import type { Metadata } from "next";
import { isAdmin } from "@/lib/marketing/crm-server";
import { memberCrm, searchCrm } from "@/lib/marketing/home-server";
import { appsFor } from "@/lib/marketing/apps";
import { SearchView } from "./rechercher-client";

export const metadata: Metadata = { title: "Rechercher" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const RECOMMENDED = ["contacts", "crm", "calendrier", "taches"];

/**
 * Rechercher (onglet du téléphone, et lien de la barre du haut sur ordinateur), comme dans LeadConnector :
 * les applications, puis les prospects et les contacts que la session a le droit de voir. Le texte cherché est
 * dans l'adresse (?q=), ce qui permet de revenir aux résultats.
 */
export default async function RechercherPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = one((await searchParams).q).trim().slice(0, 80);
  const m = await memberCrm();
  const apps = appsFor(m.can, isAdmin(m.store.session)).filter((a) => a.key !== "rechercher");
  const results = q.length >= 2 ? await searchCrm(m.crm, q, m.can) : null;
  const picked = RECOMMENDED.map((k) => apps.find((a) => a.key === k)).filter((a) => !!a);
  return (
    <SearchView q={q} apps={apps} results={results} recommended={picked.length ? picked : apps.filter((a) => a.key !== "notifications").slice(0, 4)}
      canSearch={!!m.crm && (m.can("marketing_prospects") || m.can("marketing_contacts"))} />
  );
}
