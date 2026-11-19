import { AlertTriangle, CalendarClock, Repeat, Wallet } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Stat, Table, Td, Th, Tr } from "@/components/ui/misc";
import { ClientChip } from "@/components/shared/client-chip";
import { SectionTabs } from "@/components/layout/section-tabs";
import { HEALTH, type Client } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { ContractEnd } from "./contract-end";

export const metadata = { title: "Revenus récurrents" };

// Isolé pour que la date courante soit calculée hors du rendu (règle react-hooks/purity).
function clock() { const now = Date.now(); return { today: new Date(now).toISOString().slice(0, 10), in90: new Date(now + 90 * 86400000).toISOString().slice(0, 10), now }; }
const STATUS: Record<string, string> = { onboarding: "Onboarding", active: "Actif", paused: "En pause", archived: "Archivé" };

export default async function RecurringRevenuePage() {
  const store = await requireAgency("factures");
  const clients = (await store.clients({ includeArchived: false })).filter((c) => c.status !== "archived");
  const { today, in90, now } = clock();
  const paying = clients.filter((c) => c.retainer > 0);
  const active = paying.filter((c) => c.status === "active"), coming = paying.filter((c) => c.status === "onboarding"), paused = paying.filter((c) => c.status === "paused");
  const sum = (list: Client[]) => list.reduce((a, c) => a + c.retainer, 0);
  const mrr = sum(active);
  const risky = active.filter((c) => c.health === "risque" || c.health === "attention");
  const ending = paying.filter((c) => c.contract_end && c.contract_end >= today && c.contract_end <= in90);
  const expired = paying.filter((c) => c.contract_end && c.contract_end < today);
  const months = (c: Client) => Math.max(0, Math.floor((now - Date.parse(c.created_at)) / (30.44 * 86400000)));
  const rows = [...paying].sort((a, b) => (a.contract_end ?? "9999").localeCompare(b.contract_end ?? "9999") || b.retainer - a.retainer);
  const hasDates = paying.some((c) => c.contract_end);

  return (
    <>
      <PageHeader eyebrow="Gestion" title="Revenus récurrents" description="Les honoraires mensuels de tes clients, ce qui est à risque et les engagements qui arrivent à échéance. Calculé à partir des fiches clients." />
      <SectionTabs section="facturation" current="/studio/factures/revenus" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Récurrent mensuel" value={fmt.eur(mrr)} hint={`${active.length} client${active.length > 1 ? "s" : ""} actif${active.length > 1 ? "s" : ""} · ${fmt.eur(mrr * 12)} sur 12 mois`} icon={Repeat} tone="accent" />
        <Stat label="Honoraire moyen" value={active.length ? fmt.eur(mrr / active.length) : "—"} hint={coming.length ? `${fmt.eur(sum(coming))} en onboarding, pas encore comptés` : paused.length ? `${fmt.eur(sum(paused))} en pause, non comptés` : "Par client actif"} icon={Wallet} />
        <Stat label="Récurrent à risque" value={fmt.eur(sum(risky))} hint={risky.length ? `${risky.length} client${risky.length > 1 ? "s" : ""} en « Attention » ou « À risque »` : "Aucun client actif à risque"} icon={AlertTriangle} tone={risky.length ? "warning" : "neutral"} />
        <Stat label="Fins de contrat · 90 jours" value={String(ending.length)} hint={!hasDates ? "Aucune date de fin saisie pour l'instant" : expired.length ? `${expired.length} engagement${expired.length > 1 ? "s" : ""} déjà échu${expired.length > 1 ? "s" : ""}` : `${fmt.eur(sum(ending))} par mois concernés`} icon={CalendarClock} tone={ending.length || expired.length ? "warning" : "neutral"} />
      </div>
      {paying.length === 0 ? (
        <div className="card"><EmptyState icon={Repeat} title="Aucun honoraire mensuel" description="Renseigne le retainer sur la fiche d'un client pour le voir apparaître ici." /></div>
      ) : (
        <div className="card overflow-x-auto">
          <Table>
            <thead><Tr><Th>Client</Th><Th>Statut</Th><Th>Santé</Th><Th className="text-right">Honoraires / mois</Th><Th className="text-right">Part aux résultats</Th><Th className="text-right">Ancienneté</Th><Th>Fin de contrat</Th></Tr></thead>
            <tbody>
              {rows.map((c) => {
                const late = !!c.contract_end && c.contract_end < today, soon = !!c.contract_end && !late && c.contract_end <= in90;
                return (
                  <Tr key={c.id}>
                    <Td><ClientChip id={c.id} name={c.name} logo={c.logo_url} href={`/studio/clients/${c.id}`} /></Td>
                    <Td><Badge tone={c.status === "active" ? "success" : c.status === "paused" ? "warning" : "info"}>{STATUS[c.status] ?? c.status}</Badge></Td>
                    <Td><Badge tone={c.health === "risque" ? "danger" : c.health === "attention" ? "warning" : "neutral"}>{HEALTH[c.health]}</Badge></Td>
                    <Td className="text-right font-medium tabular">{fmt.eur(c.retainer)}</Td>
                    <Td className="text-right tabular text-fg-2">{c.performance_fee_pct ? `${c.performance_fee_pct} %` : "—"}</Td>
                    <Td className="text-right tabular text-fg-2">{months(c)} mois</Td>
                    <Td><span className="flex items-center gap-2"><ContractEnd clientId={c.id} name={c.name} value={c.contract_end ?? null} />{late ? <Badge tone="danger">Échu</Badge> : soon ? <Badge tone="warning">Bientôt</Badge> : null}</span></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-[12.5px] text-muted">Le récurrent mensuel additionne les honoraires des clients actifs. Les clients en onboarding ou en pause sont listés mais pas comptés. La date de fin de contrat se saisit ici : sans date, l&apos;engagement est considéré sans échéance.</p>
    </>
  );
}
