import type { Metadata } from "next";
import { crmPage, members, salesRole, stagesFor } from "@/lib/marketing/crm-server";
import { NewProspectForm } from "./new-prospect-form";

export const metadata: Metadata = { title: "Ajouter un prospect" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Ajouter un prospect (comme « Ajouter une opportunité » de LeadConnector). `?etape=<id>` choisit l'étape de départ. */
export default async function NewProspectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_prospects");
  const role = salesRole(crm.session);
  // Un setter ou un closer devient responsable tout seul : pas besoin de la liste de l'équipe.
  const [stages, team] = await Promise.all([stagesFor(crm), role ? Promise.resolve([]) : members()]);
  const wanted = one(sp.etape);
  const initialStage = stages.find((s) => s.id === wanted)?.id ?? stages.find((s) => s.key === "nouveau_lead")?.id ?? stages[0]?.id ?? "";
  return <NewProspectForm stages={stages} members={team} initialStage={initialStage} salesRole={role} />;
}
