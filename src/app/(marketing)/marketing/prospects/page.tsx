import type { Metadata } from "next";
import { Target } from "lucide-react";
import { crmPage, members, prospectRows } from "@/lib/marketing/crm-server";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { NewProspectButton, ProspectsView } from "./prospects-view";

export const metadata: Metadata = { title: "Prospects" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_prospects");
  const view = one(sp.vue) === "colonnes" || one(sp.view) === "pipeline" ? "colonnes" : "tableau";
  const now = new Date();
  const [settings, data, team, appts] = await Promise.all([
    crm.store.settings(), prospectRows(crm), members(),
    crm.store.appointments({ from: now.toISOString() }).catch(() => []),
  ]);
  const upcomingIds = [...new Set(appts.filter((a) => a.status === "confirme").map((a) => a.prospect_id))];

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Prospects" description="Pipeline « IconFlow — Ventes » : une affaire par ligne, reliée à son contact, avec son étape, sa valeur et ses responsables."
        actions={<div className="flex items-center gap-2">{crm.demo ? <DemoBadge /> : null}<NewProspectButton stages={data.stages} /></div>} />
      {data.rows.length === 0 ? (
        <div className="card"><EmptyState icon={Target} title="Aucun prospect" description="Les leads reçus de tes sites apparaissent ici tout seuls. Tu peux aussi en ajouter un à la main." /></div>
      ) : (
        <ProspectsView rows={data.rows} stages={data.stages} members={team} view={view} today={now.toISOString().slice(0, 10)} timezone={settings.timezone} upcomingIds={upcomingIds} />
      )}
    </>
  );
}
