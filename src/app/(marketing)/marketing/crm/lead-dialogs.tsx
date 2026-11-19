"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, StickyNote, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { addNoteAction, createTaskAction, deleteProspectsAction, saveEmailTemplatesAction, sendLeadEmailAction, updateProspectAction } from "@/lib/actions/marketing-crm";
import { TASK_KIND, type EmailTemplate, type Member, type TaskKind } from "@/lib/marketing/types";
import { fillTemplate } from "@/lib/marketing/ui";

/** Ce qu'il faut savoir d'un prospect pour agir dessus depuis le kanban, la liste ou sa fiche. */
export interface LeadRef { id: string; name: string; email: string | null; company: string | null; setter_id: string | null; closer_id: string | null; unsubscribed: boolean }
export interface MailContext { templates: EmailTemplate[]; mailReady: boolean; canEditTemplates: boolean; myName: string | null }

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/* ─────────────────────────── Email ─────────────────────────── */

export function EmailComposer({ lead, mail, onSent, compact }: { lead: LeadRef; mail: MailContext; onSent?: () => void; compact?: boolean }) {
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ subject: "", body: "", template: "" });
  const [templates, setTemplates] = React.useState(mail.templates);
  const [naming, setNaming] = React.useState<string | null>(null);
  const vars = { prenom: first(lead.name), nom: lead.name, entreprise: lead.company, mon_prenom: first(mail.myName) };
  const pick = (id: string) => { const t = templates.find((x) => x.id === id); setF(t ? { template: id, subject: fillTemplate(t.subject, vars), body: fillTemplate(t.body, vars) } : { ...f, template: "" }); };
  const send = () => exec(() => sendLeadEmailAction(lead.id, { subject: f.subject, body: f.body }), {
    onSuccess: () => { setF({ subject: "", body: "", template: "" }); onSent?.(); },
    success: mail.mailReady ? "Email envoyé." : "Email simulé : le service d'envoi n'est pas configuré.",
  });
  const saveTemplate = () => {
    const name = (naming ?? "").trim(); if (!name) return;
    const next = [...templates.filter((t) => t.name !== name), { id: `modele-${Date.now().toString(36)}`, name, subject: f.subject, body: f.body }];
    exec(() => saveEmailTemplatesAction(next), { success: "Email type enregistré.", refresh: false, onSuccess: (clean) => { setTemplates(clean); setNaming(null); } });
  };
  if (!lead.email) return <p className="text-[13px] text-muted">Ce contact n&apos;a pas d&apos;email. Ajoute-le sur sa fiche pour pouvoir lui écrire.</p>;
  if (lead.unsubscribed) return <p className="text-[13px] text-muted">Ce contact s&apos;est désinscrit : aucun email ne peut lui être envoyé.</p>;
  return (
    <div className="space-y-3">
      {!mail.mailReady ? <p role="status" className="rounded-lg bg-warning/10 px-3 py-2 text-[12.5px] text-warning">Simulation : le service d&apos;envoi n&apos;est pas configuré. L&apos;email sera noté dans l&apos;historique, mais ne partira pas.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Destinataire"><Input value={lead.email} readOnly disabled /></Field>
        <Field label="Email type" hint={templates.length ? undefined : "Aucun pour l'instant"}>
          <NativeSelect value={f.template} onChange={(e) => pick(e.target.value)} disabled={!templates.length}><option value="">Message libre</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect>
        </Field>
      </div>
      <Field label="Objet"><Input value={f.subject} onChange={(e) => setF((v) => ({ ...v, subject: e.target.value }))} maxLength={200} /></Field>
      <Field label="Message" hint="Les réponses arrivent dans ta boîte mail, pas dans le CRM."><Textarea value={f.body} onChange={(e) => setF((v) => ({ ...v, body: e.target.value }))} rows={compact ? 7 : 9} maxLength={8000} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        {mail.canEditTemplates && f.body.trim() && f.subject.trim() ? (
          naming === null
            ? <Button variant="ghost" size="sm" onClick={() => setNaming("")}>Enregistrer comme email type</Button>
            : <span className="flex items-center gap-2"><Input aria-label="Nom de l'email type" value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Nom de l'email type" className="h-9 w-52" maxLength={80} /><Button size="sm" variant="secondary" disabled={pending || !naming.trim()} onClick={saveTemplate}>Enregistrer</Button><Button size="sm" variant="ghost" onClick={() => setNaming(null)}>Annuler</Button></span>
        ) : null}
        <Button className="ml-auto" loading={pending} disabled={!f.subject.trim() || f.body.trim().length < 2} onClick={send}><Send />{mail.mailReady ? "Envoyer" : "Simuler l'envoi"}</Button>
      </div>
    </div>
  );
}

export function EmailDialog({ lead, mail, onClose }: { lead: LeadRef | null; mail: MailContext; onClose: () => void }) {
  return (
    <Dialog open={!!lead} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={lead ? `Écrire à ${lead.name}` : "Écrire"} description="L'email part à ton nom et s'ajoute à l'historique du prospect.">
        {lead ? <EmailComposer lead={lead} mail={mail} onSent={onClose} compact /> : null}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Attribution ─────────────────────────── */

export function AssignDialog({ lead, members, onClose }: { lead: LeadRef | null; members: Member[]; onClose: () => void }) {
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ setter: "", closer: "" });
  const [seen, setSeen] = React.useState<string | null>(null);
  if (lead && seen !== lead.id) { setSeen(lead.id); setF({ setter: lead.setter_id ?? "", closer: lead.closer_id ?? "" }); }
  const setters = members.filter((m) => m.marketing_role !== "media_buyer"), label = (m: Member) => `${m.name}${m.marketing_role === "setter" ? " · setter" : m.marketing_role === "closer" ? " · closer" : ""}`;
  const save = () => lead && exec(() => updateProspectAction(lead.id, { setter_id: f.setter || null, closer_id: f.closer || null }), { success: "Attribution enregistrée.", onSuccess: onClose });
  return (
    <Dialog open={!!lead} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={lead ? `Attribuer ${lead.name}` : "Attribuer"} description="Le setter prend contact et pose le rendez-vous. Le closer tient l'appel. Chacun le retrouve dans « Mes prospects ».">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Setter"><NativeSelect value={f.setter} onChange={(e) => setF((v) => ({ ...v, setter: e.target.value }))}><option value="">Personne</option>{setters.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}</NativeSelect></Field>
          <Field label="Closer"><NativeSelect value={f.closer} onChange={(e) => setF((v) => ({ ...v, closer: e.target.value }))}><option value="">Personne</option>{setters.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}</NativeSelect></Field>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={pending} onClick={save}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Tâche rapide ─────────────────────────── */

export function TaskDialog({ lead, members, canAssign, me, onClose }: { lead: LeadRef | null; members: Member[]; canAssign: boolean; me: string; onClose: () => void }) {
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ kind: "a_appeler" as TaskKind, title: "", day: "", assignee: "" });
  const save = () => lead && exec(() => createTaskAction({ prospect_id: lead.id, kind: f.kind, title: f.title || undefined, due_at: f.day ? new Date(`${f.day}T09:00:00`).toISOString() : null, assignee_id: canAssign ? f.assignee || null : me }), {
    success: "Tâche ajoutée.", onSuccess: () => { setF({ kind: "a_appeler", title: "", day: "", assignee: "" }); onClose(); } });
  return (
    <Dialog open={!!lead} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={lead ? `Tâche pour ${lead.name}` : "Tâche"}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type"><NativeSelect value={f.kind} onChange={(e) => setF((v) => ({ ...v, kind: e.target.value as TaskKind }))}>{(Object.keys(TASK_KIND) as TaskKind[]).map((k) => <option key={k} value={k}>{TASK_KIND[k]}</option>)}</NativeSelect></Field>
            <Field label="Échéance"><Input type="date" value={f.day} onChange={(e) => setF((v) => ({ ...v, day: e.target.value }))} /></Field>
          </div>
          {canAssign ? <Field label="Attribuée à"><NativeSelect value={f.assignee} onChange={(e) => setF((v) => ({ ...v, assignee: e.target.value }))}><option value="">Personne</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field> : null}
          <Field label="Intitulé" hint="Vide : le nom du type"><Input value={f.title} onChange={(e) => setF((v) => ({ ...v, title: e.target.value }))} maxLength={160} /></Field>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={pending} onClick={save}>Ajouter</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Note ─────────────────────────── */

export function NoteForm({ prospectId }: { prospectId: string }) {
  const { exec, pending } = useAction();
  const [text, setText] = React.useState("");
  return (
    <div className="space-y-2">
      <Textarea aria-label="Nouvelle note" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} placeholder="Ce qui s'est dit, ce qu'il faut retenir…" />
      <div className="flex justify-end"><Button size="sm" variant="secondary" loading={pending} disabled={!text.trim()} onClick={() => exec(() => addNoteAction(prospectId, text), { success: "Note ajoutée à l'historique.", onSuccess: () => setText("") })}><StickyNote />Ajouter la note</Button></div>
    </div>
  );
}

/* ─────────────────────────── Suppression (fiche du lead) ─────────────────────────── */

export function DeleteLeadButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setOpen(true)}><Trash2 />Supprimer</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} loading={pending} danger title={`Supprimer ${name} ?`}
        description="Le prospect disparaît avec son historique, ses tâches et ses rendez-vous. Sa fiche contact aussi, si elle n'a pas d'autre affaire. C'est définitif."
        confirmLabel="Supprimer" onConfirm={() => { void exec(() => deleteProspectsAction([id]), { success: "Prospect supprimé.", refresh: false, onSuccess: () => { setOpen(false); router.push("/marketing/crm"); } }); }} />
    </>
  );
}
