import type { Metadata } from "next";
import { crmPage, stagesFor } from "@/lib/marketing/crm-server";
import type { Prospect } from "@/lib/marketing/types";
import { PageHeader } from "@/components/ui/misc";
import { PipelineStages } from "../pipeline-stages";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const crm = await crmPage("marketing_reglages");
  const [stages, prospects] = await Promise.all([
    stagesFor(crm),
    crm.db.list<Pick<Prospect, "stage_id">>("marketing_prospects", { columns: "stage_id" }).catch(() => [] as Array<Pick<Prospect, "stage_id">>),
  ]);
  const counts: Record<string, number> = {};
  for (const p of prospects) if (p.stage_id) counts[p.stage_id] = (counts[p.stage_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Pipeline" description="Les étapes de tes prospects, dans l'ordre des colonnes de Prospects." />
      <PipelineStages stages={stages} counts={counts} />
    </>
  );
}
