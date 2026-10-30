import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { INVOICE_TYPE, invoiceTotals } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader, EmptyState, Table, Th, Td, Tr, Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = { title: "Factures" };

export default async function InvoicesPage() {
  const store = await requireClient();
  const invoices = await store.invoices({ clientId: store.clientId });
  const due = invoices.filter((i) => i.type === "facture" && ["envoyee", "en_retard"].includes(i.status)).reduce((a, i) => a + invoiceTotals(i).ttc, 0);
  const paidYear = invoices.filter((i) => i.type === "facture" && i.status === "payee" && i.issue_date.startsWith(String(new Date().getFullYear()))).reduce((a, i) => a + invoiceTotals(i).ttc, 0);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Espace" title="Factures & devis" description="Vos documents de facturation, téléchargeables à tout moment." />
      {invoices.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2"><Stat label="Reste à régler" value={fmt.eur(due)} tone={due ? "warning" : "neutral"} hint={due ? "Factures envoyées non réglées" : "Tout est à jour, merci !"} /><Stat label={`Réglé en ${new Date().getFullYear()}`} value={fmt.eur(paidYear)} tone="accent" /></div>
          <Table>
            <thead><tr><Th>Numéro</Th><Th className="hidden sm:table-cell">Type</Th><Th>Statut</Th><Th className="hidden md:table-cell">Émise le</Th><Th className="hidden md:table-cell">Échéance</Th><Th className="text-right">Montant TTC</Th></tr></thead>
            <tbody>{invoices.map((i) => (
              <Tr key={i.id}><Td><Link href={`/app/factures/${i.id}`} className="font-mono text-[13px] font-medium hover:underline underline-offset-4">{i.number}</Link></Td><Td className="hidden sm:table-cell">{INVOICE_TYPE[i.type]}</Td><Td><StatusBadge kind="invoice" value={i.status} /></Td><Td className="hidden text-muted md:table-cell">{fmt.date(i.issue_date)}</Td><Td className="hidden text-muted md:table-cell">{fmt.date(i.due_date)}</Td><Td className="text-right font-medium tabular">{fmt.eurCents(invoiceTotals(i).ttc)}</Td></Tr>
            ))}</tbody>
          </Table>
        </>
      ) : <div className="card"><EmptyState icon={Wallet} title="Aucune facture" description="Vos factures et devis apparaîtront ici dès leur émission." /></div>}
    </div>
  );
}
