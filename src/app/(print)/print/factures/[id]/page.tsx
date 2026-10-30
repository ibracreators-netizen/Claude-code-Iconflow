import Image from "next/image";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/auth/session";
import { INVOICE_TYPE, invoiceTotals } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PrintButton } from "./print-button";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const invoice = await store.invoice(id);
  if (!invoice) notFound();
  const client = await store.client(invoice.client_id);
  const t = invoiceTotals(invoice);
  const vatGroups = Object.entries(invoice.lines.reduce<Record<string, number>>((a, l) => { a[l.vat_pct] = (a[l.vat_pct] ?? 0) + l.qty * l.unit_price * l.vat_pct / 100; return a; }, {}));
  return (
    <main className="mx-auto max-w-[800px] px-8 py-10 print:px-0 print:py-0" style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      <div className="no-print mb-8 flex justify-end"><PrintButton /></div>
      <header className="flex items-start justify-between border-b border-black/10 pb-6">
        <div className="flex items-center gap-3"><Image src="/brand/iconflow-logo-96.png" alt="" width={44} height={44} className="rounded-xl" /><div><p className="text-xl font-semibold tracking-tight">icon-flow</p><p className="text-[12px] text-black/55">agence créative ads · payée aux résultats</p></div></div>
        <div className="text-right"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">{INVOICE_TYPE[invoice.type]}</p><p className="text-2xl font-semibold tabular tracking-tight">{invoice.number}</p></div>
      </header>
      <section className="mt-8 grid grid-cols-2 gap-8 text-[13px]">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/50">Émetteur</p><p className="mt-1.5 font-semibold">icon-flow</p><p className="text-black/70">Adresse de l&apos;agence · à compléter</p><p className="text-black/70">SIRET · TVA intracom. · à compléter</p><p className="text-black/70">contact@icon-flow.fr</p></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/50">Client</p><p className="mt-1.5 font-semibold">{client?.name ?? "—"}</p>{client?.sector ? <p className="text-black/70">{client.sector}</p> : null}{client?.contact_email ? <p className="text-black/70">{client.contact_email}</p> : null}{client?.city ? <p className="text-black/70">{client.city}</p> : null}</div>
      </section>
      <section className="mt-6 grid grid-cols-3 gap-4 rounded-lg bg-black/[0.035] p-4 text-[13px]">
        <div><p className="text-[11px] text-black/50">Date d&apos;émission</p><p className="font-medium">{fmt.dateLong(invoice.issue_date)}</p></div>
        <div><p className="text-[11px] text-black/50">{invoice.type === "devis" ? "Valable jusqu'au" : "Échéance"}</p><p className="font-medium">{fmt.dateLong(invoice.due_date)}</p></div>
        <div><p className="text-[11px] text-black/50">Statut</p><p className="font-medium capitalize">{invoice.status.replace("_", " ")}</p></div>
      </section>
      <table className="mt-8 w-full text-[13px]">
        <thead><tr className="border-b-2 border-black/80 text-left text-[11px] font-semibold uppercase tracking-wider"><th className="py-2">Désignation</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">PU HT</th><th className="py-2 text-right">TVA</th><th className="py-2 text-right">Total HT</th></tr></thead>
        <tbody>{invoice.lines.map((l) => <tr key={l.id} className="border-b border-black/10"><td className="py-2.5 pr-4">{l.label}</td><td className="py-2.5 text-right tabular">{l.qty}</td><td className="py-2.5 text-right tabular">{fmt.eurCents(l.unit_price)}</td><td className="py-2.5 text-right tabular">{l.vat_pct} %</td><td className="py-2.5 text-right tabular font-medium">{fmt.eurCents(l.qty * l.unit_price)}</td></tr>)}</tbody>
      </table>
      <div className="ml-auto mt-6 w-[300px] space-y-1.5 text-[13px]">
        <div className="flex justify-between"><span className="text-black/60">Total HT</span><span className="tabular">{fmt.eurCents(t.ht)}</span></div>
        {vatGroups.map(([pct, v]) => <div key={pct} className="flex justify-between"><span className="text-black/60">TVA {pct} %</span><span className="tabular">{fmt.eurCents(v)}</span></div>)}
        <div className="flex justify-between border-t-2 border-black/80 pt-2 text-[16px] font-semibold"><span>Total TTC</span><span className="tabular">{fmt.eurCents(t.ttc)}</span></div>
      </div>
      {invoice.notes ? <p className="mt-8 whitespace-pre-line rounded-lg border border-black/10 p-4 text-[12.5px] text-black/70">{invoice.notes}</p> : null}
      <footer className="mt-12 border-t border-black/10 pt-4 text-[10.5px] leading-relaxed text-black/50">
        <p>Paiement par virement bancaire. IBAN · BIC · à compléter dans les paramètres. En cas de retard de paiement, pénalités au taux légal en vigueur et indemnité forfaitaire de recouvrement de 40 €. Pas d&apos;escompte pour paiement anticipé.</p>
        <p className="mt-1">icon-flow · forme juridique, capital, RCS et adresse à compléter · TVA intracommunautaire à compléter</p>
      </footer>
    </main>
  );
}
