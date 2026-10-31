import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { fmt } from "@/lib/utils";
import { SEGMENTS, type ClientHealth, type ClientSegment } from "@/lib/data/types";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Table, Td, Th, Tr } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { ClientFilters } from "./client-filters";
import { NewClientDialog } from "./new-client-dialog";
import { StageBadge } from "./_components/stage-badge";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; stage?: string; health?: string; archived?: string; new?: string }> }) {
  const sp = await searchParams;
  const store = await requireAgency("clients");
  const [clients, management, briefs, livrables, profiles, stages] = await Promise.all([store.clients({ includeArchived: true }), store.management(), store.briefs(), store.livrables(), store.profiles(), store.stages()]);
  const q = (sp.q ?? "").trim().toLowerCase();
  const firstStage = stages[0]?.key ?? "onboarding";
  const stageOf = (id: string) => management.find((m) => m.client_id === id)?.stage ?? firstStage;
  const rows = clients.filter((c) =>
    (sp.archived === "1" ? true : c.status !== "archived") &&
    (!q || `${c.name} ${c.sector ?? ""} ${c.city ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(q)) &&
    (!sp.segment || c.segment === (sp.segment as ClientSegment)) &&
    (!sp.stage || stageOf(c.id) === sp.stage) &&
    (!sp.health || c.health === (sp.health as ClientHealth)),
  );
  const owner = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? null;

  return (
    <>
      <PageHeader eyebrow="CRM" title="Clients" description={`${clients.filter((c) => c.status !== "archived").length} clients actifs · ${fmt.eur(clients.filter((c) => c.status === "active").reduce((a, c) => a + c.monthly_budget, 0))} de budget ads géré par mois`}
        actions={<Link href="/studio/clients?new=1" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition hover:bg-accent-2"><Plus className="size-4" />Nouveau client</Link>} />
      <ClientFilters stages={stages} />
      <div className="mt-4">
        {rows.length ? (
          <Table>
            <thead><tr><Th>Client</Th><Th>Segment</Th><Th>Étape</Th><Th>Santé</Th><Th className="text-right">Budget / mois</Th><Th className="text-right">Retainer</Th><Th className="text-right">Briefs en cours</Th><Th>Dernier livrable</Th><Th>Account</Th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const open = briefs.filter((b) => b.client_id === c.id && b.status !== "valide").length;
                const last = livrables.find((l) => l.client_id === c.id);
                return (
                  <Tr key={c.id} className={c.status === "archived" ? "opacity-60" : ""}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ClientChip name={c.name} logo={c.logo_url} href={`/studio/clients/${c.id}`} size={28} className="text-[13.5px] text-fg" />
                        {c.status === "archived" ? <Badge tone="outline">Archivé</Badge> : c.status === "onboarding" ? <Badge tone="info">Onboarding</Badge> : null}
                      </div>
                      <p className="mt-0.5 pl-9 text-[12px] text-muted">{c.sector ?? "Secteur non renseigné"}{c.city ? ` · ${c.city}` : ""}</p>
                    </Td>
                    <Td className="text-fg-2">{SEGMENTS[c.segment]}</Td>
                    <Td><StageBadge stages={stages} value={stageOf(c.id)} /></Td>
                    <Td><StatusBadge kind="health" value={c.health} /></Td>
                    <Td className="text-right tabular">{fmt.eur(c.monthly_budget)}</Td>
                    <Td className="text-right tabular">{fmt.eur(c.retainer)}<span className="text-muted"> + {c.performance_fee_pct} %</span></Td>
                    <Td className="text-right tabular">{open || <span className="text-muted-2">0</span>}</Td>
                    <Td className="text-fg-2">{last ? <Link href={`/studio/livrables/${last.id}`} className="hover:text-fg"><span className="line-clamp-1">{last.title}</span><span className="text-[11.5px] text-muted">{fmt.relative(last.created_at)}</span></Link> : <span className="text-muted-2">—</span>}</Td>
                    <Td className="text-fg-2">{owner(c.owner_id) ?? <span className="text-muted-2">—</span>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="card"><EmptyState icon={Building2} title={q || sp.segment || sp.stage || sp.health ? "Aucun client ne correspond" : "Aucun client"} description={q ? "Essaie un autre mot-clé ou retire un filtre." : "Crée ton premier client pour démarrer son onboarding."} action={<Link href="/studio/clients?new=1" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg"><Plus className="size-4" />Nouveau client</Link>} /></div>
        )}
      </div>
      <NewClientDialog open={sp.new === "1"} />
    </>
  );
}
