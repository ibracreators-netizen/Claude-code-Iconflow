import { requireAgency } from "@/lib/auth/session";
import { hasFullAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/utils";
import { ManageStages } from "./manage-stages";
import { PipelineBoard } from "./pipeline-board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const store = await requireAgency("pipeline");
  // Les clients archivés n'apparaissent que si on les demande (filtre « Archivés ») : on peut alors les restaurer.
  const [clients, management, briefs, livrables, stages] = await Promise.all([
    store.clients({ includeArchived: status === "archived" }), store.management(), store.briefs(), store.livrables(), store.stages(),
  ]);
  const known = new Set(stages.map((s) => s.key));
  const firstStage = stages[0]?.key ?? "onboarding";
  // Une fiche sans suivi, ou dont l'étape n'existe plus, est affichée dans la première colonne.
  const stageOf = (clientId: string) => { const m = management.find((x) => x.client_id === clientId); return m && known.has(m.stage) ? m.stage : firstStage; };
  const visible = clients.filter((c) => !status || c.status === status);
  const cards = visible.map((c) => {
    const m = management.find((x) => x.client_id === c.id);
    return {
      client: c, stage: stageOf(c.id), notes: m?.notes ?? "", revision: m?.revision ?? 0,
      openBriefs: briefs.filter((b) => b.client_id === c.id && b.status !== "valide").length,
      pendingClient: briefs.filter((b) => b.client_id === c.id && b.status === "attente_client").length + livrables.filter((l) => l.client_id === c.id && l.status === "attente_client").length,
    };
  });
  const counts: Record<string, number> = {};
  for (const c of clients) if (c.status !== "archived") { const k = stageOf(c.id); counts[k] = (counts[k] ?? 0) + 1; }
  const budget = visible.reduce((a, c) => a + c.monthly_budget, 0);
  return (
    <>
      <PageHeader eyebrow="Suivi agence" title="Pipeline clients"
        description={`${visible.length} client${visible.length > 1 ? "s" : ""} · ${fmt.eur(budget)} de budget ads mensuel. Glisse une carte pour changer d'étape. Le classement est privé : le client ne voit rien et son accès ne change pas ; seule son étiquette Onboarding / Actif suit l'étape.`}
        actions={<ManageStages stages={stages} counts={counts} />} />
      <PipelineBoard cards={cards} stages={stages} statusFilter={status ?? ""} canDelete={hasFullAccess(store.session.profile)} />
    </>
  );
}
