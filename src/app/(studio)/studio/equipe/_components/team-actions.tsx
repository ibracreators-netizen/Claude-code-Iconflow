"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { inviteMember } from "@/lib/actions/team";
import { PermissionsPicker } from "./permissions-picker";

type Opt = { id: string; name: string };

export function TeamActions({ clients, canInvite, demo }: { clients: Opt[]; canInvite: boolean; demo: boolean }) {
  const [open, setOpen] = React.useState<"member" | "client" | null>(null);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen("client")} disabled={!canInvite}><Building2 />Inviter un client</Button>
      <Button size="sm" onClick={() => setOpen("member")} disabled={!canInvite}><UserPlus />Inviter un membre</Button>
      {open === "member" ? <InviteMemberDialog onClose={() => setOpen(null)} demo={demo} /> : null}
      {open === "client" ? <InviteClientDialog clients={clients} onClose={() => setOpen(null)} demo={demo} /> : null}
    </>
  );
}

function InviteMemberDialog({ onClose, demo }: { onClose: () => void; demo: boolean }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [form, setForm] = React.useState({ email: "", full_name: "", title: "" });
  const [permissions, setPermissions] = React.useState<string[] | null>(["dashboard", "inbox", "briefs", "livrables", "taches", "planning", "brain", "documents", "fichiers", "messages", "parametres"]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => inviteMember({ ...form, title: form.title || null, role: "agency", permissions }), { success: demo ? "Membre ajouté (démo)." : "Invitation envoyée par email.", onSuccess: (p) => { onClose(); router.push(`/studio/equipe/${p.id}`); } });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" title="Inviter un membre de l'équipe" description={demo ? "En démo, le compte est créé en mémoire sans email." : "Le membre reçoit un email avec un lien pour créer son mot de passe. Il n'accède qu'aux modules cochés."}>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" required><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={80} autoFocus required placeholder="Prénom Nom" /></Field>
            <Field label="Fonction"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} placeholder="Monteur, Head of Scripts…" /></Field>
          </div>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="prenom@icon-flow.fr" /></Field>
          <div><p className="mb-2 text-[13px] font-medium text-fg-2">Pages accessibles</p><PermissionsPicker value={permissions} onChange={setPermissions} /></div>
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="submit" loading={pending}><UserPlus />{demo ? "Ajouter" : "Envoyer l'invitation"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteClientDialog({ clients, onClose, demo }: { clients: Opt[]; onClose: () => void; demo: boolean }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [form, setForm] = React.useState({ email: "", full_name: "", title: "", client_id: clients[0]?.id ?? "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => inviteMember({ email: form.email, full_name: form.full_name, title: form.title || null, role: "client", client_id: form.client_id }), { success: demo ? "Compte client ajouté (démo)." : "Invitation envoyée au client.", onSuccess: (p) => { onClose(); router.push(`/studio/equipe/${p.id}`); } });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" title="Inviter un client" description="Le compte est rattaché à un seul espace client : il ne voit que ses briefs, livrables, documents et factures.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Espace client" required>
            <NativeSelect value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" required><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={80} required placeholder="Prénom Nom" /></Field>
            <Field label="Fonction"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} placeholder="Fondatrice, CMO…" /></Field>
          </div>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="contact@client.fr" /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="submit" loading={pending} disabled={!form.client_id}><Building2 />{demo ? "Ajouter" : "Envoyer l'invitation"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
