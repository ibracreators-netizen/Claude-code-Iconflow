import { requireAgency } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/utils";
import { PipelineBoard } from "./pipeline-board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const store = await requireAgency();
  const [clients, management, briefs, livrables] = await Promise.all([store.clients(), store.management(), store.briefs(), store.livrables()]);
  const visible = clients.filter((c) => !status || c.status === status);
  const cards = visible.map((c) => {
    const m = management.find((x) => x.client_id === c.id);
    return {
      client: c, stage: m?.stage ?? ("onboarding" as const), notes: m?.notes ?? "", revision: m?.revision ?? 0,
      openBriefs: briefs.filter((b) => b.client_id === c.id && b.status !== "valide").length,
      pendingClient: briefs.filter((b) => b.client_id === c.id && b.status === "attente_client").length + livrables.filter((l) => l.client_id === c.id && l.status === "attente_client").length,
    };
  });
  const budget = visible.reduce((a, c) => a + c.monthly_budget, 0);
  return (
    <>
      <PageHeader eyebrow="Suivi agence" title="Pipeline clients" description={`${visible.length} clients · ${fmt.eur(budget)} de budget ads mensuel. Glisse une carte pour changer d'étape. Le classement est privé et ne modifie aucun accès client.`} />
      <PipelineBoard cards={cards} statusFilter={status ?? ""} />
    </>
  );
}
