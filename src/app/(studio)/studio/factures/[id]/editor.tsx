"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Plus, Printer, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { setInvoiceStatus, updateInvoice } from "@/lib/actions/invoices";
import { useAction } from "@/lib/hooks/use-action";
import { INVOICE_TYPE, invoiceTotals, type Client, type Invoice, type InvoiceLine } from "@/lib/data/types";
import { fmt, uid } from "@/lib/utils";
import { InvoiceMenu } from "../_components/invoice-actions";

export function InvoiceEditor({ invoice, client }: { invoice: Invoice; client: Client | null }) {
  const { exec, pending } = useAction();
  const [lines, setLines] = React.useState<InvoiceLine[]>(invoice.lines.length ? invoice.lines : [{ id: uid("il"), label: "", qty: 1, unit_price: 0, vat_pct: 20 }]);
  const [issue, setIssue] = React.useState(invoice.issue_date);
  const [due, setDue] = React.useState(invoice.due_date);
  const [notes, setNotes] = React.useState(invoice.notes ?? "");
  const totals = invoiceTotals({ lines });
  const locked = invoice.status === "payee" || invoice.status === "annulee";
  const dirty = JSON.stringify({ lines, issue, due, notes }) !== JSON.stringify({ lines: invoice.lines.length ? invoice.lines : lines, issue: invoice.issue_date, due: invoice.due_date, notes: invoice.notes ?? "" });
  const save = () => exec(() => updateInvoice(invoice.id, { lines: lines.filter((l) => l.label.trim()), issue_date: issue, due_date: due, notes: notes || null }), { success: "Pièce enregistrée" });
  const upd = (id: string, patch: Partial<InvoiceLine>) => setLines(lines.map((l) => l.id === id ? { ...l, ...patch } : l));

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/studio/factures" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ArrowLeft className="size-4" />Facturation</Link>
        <div className="ml-auto flex items-center gap-2">
          {dirty && !locked ? <Button size="sm" loading={pending} onClick={save}><Save />Enregistrer</Button> : null}
          {invoice.status === "brouillon" ? <Button size="sm" variant="secondary" onClick={async () => { if (dirty) await save(); exec(() => setInvoiceStatus(invoice.id, "envoyee"), { success: "Marquée envoyée" }); }}><Send />Marquer envoyée</Button> : null}
          {["envoyee", "en_retard"].includes(invoice.status) ? <Button size="sm" variant="secondary" onClick={() => exec(() => setInvoiceStatus(invoice.id, "payee"), { success: "Marquée payée" })}><CheckCircle2 />Marquer payée</Button> : null}
          <Button size="sm" variant="secondary" onClick={() => window.open(`/print/factures/${invoice.id}`, "_blank")}><Printer />Aperçu PDF</Button>
          <InvoiceMenu invoice={invoice} />
        </div>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Badge tone={invoice.type === "devis" ? "info" : invoice.type === "avoir" ? "warning" : "neutral"}>{INVOICE_TYPE[invoice.type]}</Badge><StatusBadge kind="invoice" value={invoice.status} /></div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] tabular">{invoice.number}</h1>
          <p className="text-[13px] text-muted">Créée {fmt.dateLong(invoice.created_at)}{invoice.paid_at ? ` · payée ${fmt.dateLong(invoice.paid_at)}` : ""}</p>
        </div>
        <div className="text-right"><p className="text-[12px] text-muted">Total TTC</p><p className="text-[30px] font-semibold tracking-[-0.03em] tabular">{fmt.eurCents(totals.ttc)}</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Lignes" action={!locked ? <Button variant="ghost" size="sm" onClick={() => setLines([...lines, { id: uid("il"), label: "", qty: 1, unit_price: 0, vat_pct: 20 }])}><Plus />Ligne</Button> : null} />
            <CardBody className="space-y-2">
              <div className="hidden grid-cols-[1fr_72px_120px_72px_110px_32px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted sm:grid"><span>Désignation</span><span>Qté</span><span>PU HT</span><span>TVA %</span><span className="text-right">Total HT</span><span /></div>
              {lines.map((l) => (
                <div key={l.id} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_72px_120px_72px_110px_32px] sm:items-center sm:border-0 sm:p-0">
                  <Input className="col-span-2 sm:col-span-1" value={l.label} disabled={locked} onChange={(e) => upd(l.id, { label: e.target.value })} placeholder="Retainer Scale · novembre" />
                  <Input type="number" min={0} step="0.5" value={l.qty} disabled={locked} onChange={(e) => upd(l.id, { qty: Number(e.target.value) })} aria-label="Quantité" />
                  <Input type="number" min={0} step="0.01" value={l.unit_price} disabled={locked} onChange={(e) => upd(l.id, { unit_price: Number(e.target.value) })} aria-label="Prix unitaire" />
                  <Input type="number" min={0} max={100} value={l.vat_pct} disabled={locked} onChange={(e) => upd(l.id, { vat_pct: Number(e.target.value) })} aria-label="TVA" />
                  <span className="text-right text-[13.5px] font-medium tabular">{fmt.eurCents(l.qty * l.unit_price)}</span>
                  {!locked ? <Button variant="ghost" size="icon-sm" onClick={() => setLines(lines.filter((x) => x.id !== l.id))} aria-label="Supprimer la ligne"><Trash2 /></Button> : <span />}
                </div>
              ))}
              <div className="ml-auto mt-4 w-full max-w-[280px] space-y-1 text-[13.5px]">
                <div className="flex justify-between text-muted"><span>Total HT</span><span className="tabular">{fmt.eurCents(totals.ht)}</span></div>
                <div className="flex justify-between text-muted"><span>TVA</span><span className="tabular">{fmt.eurCents(totals.tva)}</span></div>
                <div className="flex justify-between border-t border-border pt-1.5 text-[15px] font-semibold"><span>Total TTC</span><span className="tabular">{fmt.eurCents(totals.ttc)}</span></div>
              </div>
            </CardBody>
          </Card>
          <Card><CardHeader title="Notes" description="Conditions de paiement, mentions, remerciements." /><CardBody><Textarea rows={3} value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} placeholder="Paiement à 30 jours par virement. Merci pour votre confiance." /></CardBody></Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Client" action={client ? <Link href={`/studio/clients/${client.id}`} className="text-[12.5px] text-accent-2 hover:underline">Voir la fiche</Link> : null} />
            <CardBody className="text-[13.5px]">
              {client ? (<><p className="font-semibold">{client.name}</p>{client.sector ? <p className="text-muted">{client.sector}</p> : null}{client.contact_email ? <p className="mt-2 text-fg-2">{client.contact_email}</p> : null}{client.city ? <p className="text-muted">{client.city}</p> : null}</>) : <p className="text-muted">Client introuvable</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Dates" />
            <CardBody className="grid gap-3">
              <Field label="Émission"><Input type="date" value={issue} disabled={locked} onChange={(e) => setIssue(e.target.value)} /></Field>
              <Field label="Échéance"><Input type="date" value={due} disabled={locked} onChange={(e) => setDue(e.target.value)} /></Field>
            </CardBody>
          </Card>
          {!locked && dirty ? <Button className="w-full" loading={pending} onClick={save}><Save />Enregistrer les modifications</Button> : null}
        </div>
      </div>
    </div>
  );
}
