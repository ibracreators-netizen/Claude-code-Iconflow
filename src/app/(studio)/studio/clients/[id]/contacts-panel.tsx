"use client";
import { useState } from "react";
import { Mail, Phone, Plus, Star, Trash2, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Contact } from "@/lib/data/types";
import { useAction } from "@/lib/hooks/use-action";
import { deleteContact, upsertContact } from "@/lib/actions/clients";

export function ContactsPanel({ clientId, contacts }: { clientId: string; contacts: Contact[] }) {
  const { exec, pending } = useAction();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [removing, setRemoving] = useState<Contact | null>(null);
  const [primary, setPrimary] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const base = { client_id: clientId, full_name: String(f.get("full_name") ?? "").trim(), email: String(f.get("email") ?? "").trim() || null, phone: String(f.get("phone") ?? "").trim() || null, job_title: String(f.get("job_title") ?? "").trim() || null, is_primary: primary };
    if (!base.full_name) return;
    const res = await exec(() => upsertContact(editing && editing !== "new" ? { id: editing.id, ...base } : base), { success: "Contact enregistré" });
    if (res.ok) setEditing(null);
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Contacts" description="Interlocuteurs côté client" action={<Button size="sm" onClick={() => { setPrimary(contacts.length === 0); setEditing("new"); }}><Plus />Contact</Button>} />
      {contacts.length ? (
        <ul>
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3 first:border-0 sm:flex-nowrap">
              <Avatar name={c.full_name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13.5px] font-medium">{c.full_name}{c.is_primary ? <Badge tone="accent"><Star className="size-3" />Principal</Badge> : null}</p>
                <p className="text-[12.5px] text-muted">{c.job_title ?? "Rôle non renseigné"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg-2">
                {c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-fg"><Mail className="size-3.5 text-muted" />{c.email}</a> : null}
                {c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-fg"><Phone className="size-3.5 text-muted" />{c.phone}</a> : null}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setPrimary(c.is_primary); setEditing(c); }}>Modifier</Button>
                <Button variant="ghost" size="icon-sm" aria-label="Supprimer" onClick={() => setRemoving(c)}><Trash2 className="text-muted" /></Button>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={UserRound} title="Aucun contact" description="Ajoute l'interlocuteur principal pour les validations et la messagerie." />}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent title={editing === "new" ? "Nouveau contact" : "Modifier le contact"}>
          <form onSubmit={onSubmit} className="space-y-4" key={editing === "new" ? "new" : editing?.id}>
            <Field label="Nom complet" required><Input name="full_name" required defaultValue={editing && editing !== "new" ? editing.full_name : ""} autoFocus /></Field>
            <Field label="Rôle"><Input name="job_title" placeholder="Fondatrice, CMO…" defaultValue={editing && editing !== "new" ? editing.job_title ?? "" : ""} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email"><Input name="email" type="email" defaultValue={editing && editing !== "new" ? editing.email ?? "" : ""} /></Field>
              <Field label="Téléphone"><Input name="phone" type="tel" defaultValue={editing && editing !== "new" ? editing.phone ?? "" : ""} /></Field>
            </div>
            <label className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2.5 text-[13px]"><span>Contact principal</span><Switch checked={primary} onCheckedChange={setPrimary} /></label>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} title="Supprimer ce contact ?" description={removing?.full_name} danger confirmLabel="Supprimer" loading={pending}
        onConfirm={async () => { if (!removing) return; const r = await exec(() => deleteContact(removing.id, clientId), { success: "Contact supprimé" }); if (r.ok) setRemoving(null); }} />
    </Card>
  );
}
