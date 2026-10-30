import Link from "next/link";
import { Receipt, TrendingUp, Clock, AlertTriangle, Wallet } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Stat, Table, Td, Th, Tr } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { INVOICE_TYPE, invoiceTotals } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { CreateInvoiceDialog, InvoiceMenu } from "./_components/invoice-actions";
import { InvoiceFilters } from "./_components/filters";

export const metadata = { title: "Facturation" };

// Isolé pour que la date courante soit calculée hors du rendu (règle react-hooks/purity).
function periods() {
  const now = Date.now();
  return { d30: new Date(now - 30 * 86400000).toISOString(), year: new Date(now).getFullYear().toString() };
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await requireAgency();
  const [clients, invoices] = await Promise.all([store.clients({ includeArchived: true }), store.invoices()]);
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const { d30, year } = periods();
  const paid = invoices.filter((i) => i.type === "facture" && i.status === "payee");
  const ttc = (i: typeof invoices[number]) => invoiceTotals(i).ttc;
  const kpi = {
    paid30: paid.filter((i) => (i.paid_at ?? "") >= d30).reduce((a, i) => a + ttc(i), 0),
    paidYear: paid.filter((i) => i.issue_date.startsWith(year)).reduce((a, i) => a + ttc(i), 0),
    pending: invoices.filter((i) => i.type === "facture" && i.status === "envoyee").reduce((a, i) => a + ttc(i), 0),
    late: invoices.filter((i) => i.type === "facture" && i.status === "en_retard").reduce((a, i) => a + ttc(i), 0),
    lateCount: invoices.filter((i) => i.status === "en_retard").length,
  };
  const filtered = invoices.filter((i) => (!sp.status || i.status === sp.status) && (!sp.client || i.client_id === sp.client) && (!sp.type || i.type === sp.type));
  const active = clients.filter((c) => c.status !== "archived").map((c) => ({ id: c.id, name: c.name, retainer: c.retainer }));

  return (
    <>
      <PageHeader eyebrow="Gestion" title="Facturation" description="Factures, devis et avoirs. Retainers, commissions performance : tout est suivi ici." actions={<CreateInvoiceDialog clients={active} autoOpen={sp.new === "1"} defaultClient={sp.client} />} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Encaissé · 30 jours" value={fmt.eur(kpi.paid30)} icon={TrendingUp} tone="accent" hint="Factures payées, TTC" />
        <Stat label={`Encaissé · ${year}`} value={fmt.eur(kpi.paidYear)} icon={Wallet} />
        <Stat label="En attente" value={fmt.eur(kpi.pending)} icon={Clock} hint="Envoyées, non échues" />
        <Stat label="En retard" value={fmt.eur(kpi.late)} icon={AlertTriangle} tone={kpi.lateCount ? "danger" : "neutral"} hint={kpi.lateCount ? `${kpi.lateCount} facture${kpi.lateCount > 1 ? "s" : ""} à relancer` : "Aucun retard"} />
      </div>
      <div className="mb-4"><InvoiceFilters clients={clients.map((c) => ({ id: c.id, name: c.name }))} status={sp.status ?? ""} client={sp.client ?? ""} type={sp.type ?? ""} /></div>
      {!filtered.length ? <EmptyState icon={Receipt} title="Aucune pièce" description={invoices.length ? "Aucune pièce ne correspond à ces filtres." : "Crée ta première facture : le numéro est attribué automatiquement."} /> : (
        <Table>
          <thead><tr><Th>Numéro</Th><Th>Client</Th><Th className="hidden md:table-cell">Émise</Th><Th className="hidden md:table-cell">Échéance</Th><Th className="text-right">TTC</Th><Th>Statut</Th><Th /></tr></thead>
          <tbody>
            {filtered.map((i) => (
              <Tr key={i.id}>
                <Td><Link href={`/studio/factures/${i.id}`} className="font-medium hover:text-accent-2">{i.number}</Link><span className="ml-2 hidden sm:inline"><Badge tone={i.type === "devis" ? "info" : i.type === "avoir" ? "warning" : "neutral"}>{INVOICE_TYPE[i.type]}</Badge></span></Td>
                <Td><ClientChip name={name(i.client_id)} href={`/studio/clients/${i.client_id}`} /></Td>
                <Td className="hidden text-muted md:table-cell">{fmt.date(i.issue_date, { day: "2-digit", month: "short", year: "numeric" })}</Td>
                <Td className="hidden text-muted md:table-cell">{fmt.date(i.due_date, { day: "2-digit", month: "short", year: "numeric" })}</Td>
                <Td className="text-right font-medium tabular">{fmt.eurCents(ttc(i))}</Td>
                <Td><StatusBadge kind="invoice" value={i.status} /></Td>
                <Td className="text-right"><InvoiceMenu invoice={i} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
