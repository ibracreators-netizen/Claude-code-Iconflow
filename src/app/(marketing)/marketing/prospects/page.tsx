import type { Metadata } from "next";
import { Target } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { NewProspect } from "./prospects-client";
import { ProspectsBoard } from "./prospects-board";

export const metadata: Metadata = { title: "Prospects" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const store = await requireMarketing("marketing_prospects");
  const q = one(sp.q);
  const view = one(sp.view) === "pipeline" ? "pipeline" : "liste";
  const now = new Date();
  const [settings, prospects, appts] = await Promise.all([
    store.settings(),
    store.prospects({ q: q || undefined }),
    store.appointments({ from: now.toISOString() }),
  ]);
  const upcomingIds = [...new Set(appts.filter((a) => a.status === "confirme").map((a) => a.prospect_id))];
  const today = now.toISOString().slice(0, 10);

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Prospects" description="Les leads de l'agence : opt-ins, qualification, relances, réservations."
        actions={<div className="flex items-center gap-2">{store.demo ? <DemoBadge /> : null}<NewProspect /></div>} />
      <form action="/marketing/prospects" className="mb-4 flex items-center gap-2">
        <input type="search" name="q" defaultValue={q} placeholder="Rechercher un prospect…" className="h-9 w-full max-w-xs rounded-full border border-border bg-surface px-3.5 text-[13px] outline-none focus:border-border-strong" />
        {view === "pipeline" ? <input type="hidden" name="view" value="pipeline" /> : null}
      </form>
      {prospects.length === 0 ? (
        <div className="card"><EmptyState icon={Target} title="Aucun prospect" description={q ? "Aucun prospect ne correspond à cette recherche." : "Ajoute un prospect à la main, ou branche un formulaire d'opt-in plus tard."} /></div>
      ) : (
        <ProspectsBoard prospects={prospects} view={view} upcomingIds={upcomingIds} today={today} timezone={settings.timezone} />
      )}
    </>
  );
}
