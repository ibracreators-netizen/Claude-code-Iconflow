"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Plus, Send, Trash2, CheckCircle2, Ban, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createInvoice, deleteInvoice, setInvoiceStatus } from "@/lib/actions/invoices";
import { useAction } from "@/lib/hooks/use-action";
import { INVOICE_TYPE, MONTHS_FR, type Client, type Invoice, type InvoiceType } from "@/lib/data/types";
import { uid } from "@/lib/utils";

export function CreateInvoiceDialog({ clients, autoOpen, defaultClient }: { clients: Pick<Client, "id" | "name" | "retainer">[]; autoOpen?: boolean; defaultClient?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(!!autoOpen);
  const [type, setType] = React.useState<InvoiceType>("facture");
  const [client, setClient] = React.useState(defaultClient ?? clients[0]?.id ?? "");
  const [issue, setIssue] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [due, setDue] = React.useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [prefill, setPrefill] = React.useState(true);
  const { exec, pending } = useAction();
  const close = (o: boolean) => { setOpen(o); if (!o && autoOpen) router.replace("/studio/factures"); };
  const submit = () => {
    const c = clients.find((x) => x.id === client);
    const month = MONTHS_FR[new Date(issue).getMonth()].toLowerCase();
    const lines = prefill && c && c.retainer > 0 ? [{ id: uid("il"), label: `Retainer · ${month}`, qty: 1, unit_price: c.retainer, vat_pct: 20 }] : [];
    exec(() => createInvoice({ type, client_id: client, issue_date: issue, due_date: due, lines }), { success: `${INVOICE_TYPE[type]} créé`, refresh: false, onSuccess: (i) => router.push(`/studio/factures/${i.id}`) });
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Nouvelle facture</Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent title="Nouvelle pièce" description="Facture, devis ou avoir. Le numéro est attribué automatiquement.">
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type"><NativeSelect value={type} onChange={(e) => setType(e.target.value as InvoiceType)}>{(Object.keys(INVOICE_TYPE) as InvoiceType[]).map((t) => <option key={t} value={t}>{INVOICE_TYPE[t]}</option>)}</NativeSelect></Field>
              <Field label="Client" required><NativeSelect value={client} onChange={(e) => setClient(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
              <Field label="Date d'émission"><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
              <Field label="Échéance"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={prefill} onChange={(e) => setPrefill(e.target.checked)} className="accent-[var(--color-accent)]" />Pré-remplir avec le retainer du client</label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => close(false)}>Annuler</Button><Button loading={pending} disabled={!client} onClick={submit}>Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InvoiceMenu({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const { exec } = useAction();
  const [del, setDel] = React.useState(false);
  const dup = () => exec(() => createInvoice({ type: invoice.type, client_id: invoice.client_id, lines: invoice.lines.map((l) => ({ ...l, id: uid("il") })), notes: invoice.notes }), { success: "Pièce dupliquée", refresh: false, onSuccess: (i) => router.push(`/studio/factures/${i.id}`) });
  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal /></Button></DropdownTrigger>
        <DropdownContent>
          {invoice.status === "brouillon" ? <DropdownItem onSelect={() => exec(() => setInvoiceStatus(invoice.id, "envoyee"), { success: "Marquée envoyée" })}><Send />Marquer envoyée</DropdownItem> : null}
          {["envoyee", "en_retard"].includes(invoice.status) ? <DropdownItem onSelect={() => exec(() => setInvoiceStatus(invoice.id, "payee"), { success: "Marquée payée" })}><CheckCircle2 />Marquer payée</DropdownItem> : null}
          <DropdownItem onSelect={() => window.open(`/print/factures/${invoice.id}`, "_blank")}><Printer />Aperçu PDF</DropdownItem>
          <DropdownItem onSelect={dup}><Copy />Dupliquer</DropdownItem>
          <DropdownSeparator />
          {invoice.status === "brouillon" ? <DropdownItem danger onSelect={() => setDel(true)}><Trash2 />Supprimer le brouillon</DropdownItem> : invoice.status !== "annulee" && invoice.status !== "payee" ? <DropdownItem danger onSelect={() => exec(() => setInvoiceStatus(invoice.id, "annulee"), { success: "Pièce annulée" })}><Ban />Annuler</DropdownItem> : null}
        </DropdownContent>
      </Dropdown>
      <ConfirmDialog open={del} onOpenChange={setDel} title="Supprimer ce brouillon ?" description={invoice.number} confirmLabel="Supprimer" danger onConfirm={async () => { await exec(() => deleteInvoice(invoice.id), { success: "Brouillon supprimé", onSuccess: () => { setDel(false); router.push("/studio/factures"); } }); }} />
    </>
  );
}
