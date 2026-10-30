import Image from "next/image";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth/session";
import { INVOICE_TYPE, invoiceTotals } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { PrintButton } from "../../_components/print-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const store = await requireClient(); const i = await store.invoice(id);
  return { title: i?.number ?? "Facture" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireClient();
  const inv = await store.invoice(id);
  if (!inv) notFound();
  const client = await store.client(inv.client_id);
  const t = invoiceTotals(inv);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print"><PageHeader crumbs={[{ label: "Factures", href: "/app/factures" }, { label: inv.number }]} title={`${INVOICE_TYPE[inv.type]} ${inv.number}`} description={<StatusBadge kind="invoice" value={inv.status} />} actions={<PrintButton label="Imprimer / PDF" />} /></div>
      <article className="card p-6 sm:p-10 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div className="flex items-center gap-3"><Image src="/brand/iconflow-logo-96.png" alt="" width={40} height={40} className="rounded-lg" /><div><p className="text-[16px] font-semibold tracking-tight">icon-flow</p><p className="text-[12px] text-muted">Agence créative · payée aux résultats</p></div></div>
          <div className="text-right"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{INVOICE_TYPE[inv.type]}</p><p className="font-mono text-[18px] font-semibold">{inv.number}</p><p className="text-[12.5px] text-muted">Émise le {fmt.dateLong(inv.issue_date)}</p><p className="text-[12.5px] text-muted">{inv.type === "devis" ? "Valable jusqu'au" : "Échéance"} {fmt.dateLong(inv.due_date)}</p></div>
        </header>
        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Facturé à</p><p className="mt-1 text-[14px] font-medium">{client?.name}</p>{client?.city ? <p className="text-[13px] text-muted">{client.city}</p> : null}{client?.contact_email ? <p className="text-[13px] text-muted">{client.contact_email}</p> : null}</div>
          <div className="sm:text-right"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Statut</p><p className="mt-1"><StatusBadge kind="invoice" value={inv.status} /></p>{inv.paid_at ? <p className="mt-1 text-[12.5px] text-muted">Réglée le {fmt.dateLong(inv.paid_at)}</p> : null}</div>
        </div>
        <table className="w-full text-[13.5px]">
          <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-2">Désignation</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">PU HT</th><th className="py-2 text-right">TVA</th><th className="py-2 text-right">Total HT</th></tr></thead>
          <tbody>{inv.lines.map((l) => <tr key={l.id} className="border-b border-border"><td className="py-3 pr-4">{l.label}</td><td className="py-3 text-right tabular">{l.qty}</td><td className="py-3 text-right tabular">{fmt.eurCents(l.unit_price)}</td><td className="py-3 text-right tabular">{l.vat_pct} %</td><td className="py-3 text-right tabular font-medium">{fmt.eurCents(l.qty * l.unit_price)}</td></tr>)}</tbody>
        </table>
        <dl className="ml-auto mt-6 w-full max-w-xs space-y-1.5 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd className="tabular">{fmt.eurCents(t.ht)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">TVA</dt><dd className="tabular">{fmt.eurCents(t.tva)}</dd></div>
          <div className="flex justify-between border-t border-border pt-2 text-[16px] font-semibold"><dt>Total TTC</dt><dd className="tabular">{fmt.eurCents(t.ttc)}</dd></div>
        </dl>
        {inv.notes ? <p className="mt-8 rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-fg-2">{inv.notes}</p> : null}
        <p className="mt-8 text-[11.5px] text-muted-2">Merci pour votre confiance. Une question sur cette facture ? Écrivez-nous dans la messagerie de votre espace.</p>
      </article>
    </div>
  );
}
