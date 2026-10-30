"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createLivrable, updateLivrable } from "@/lib/actions/livrables";
import { LIVRABLE_KIND, type Livrable, type LivrableKind } from "@/lib/data/types";
import { useUrlFlag } from "../_prod/filter-bar";

export interface BriefOption { id: string; title: string; client_id: string }

function LivrableFields({ form, setForm, briefs, clients, lockClient }: { form: FormState; setForm: (f: FormState) => void; briefs: BriefOption[]; clients?: Array<{ id: string; name: string }>; lockClient?: boolean }) {
  const briefChoices = briefs.filter((b) => b.client_id === form.client_id);
  return (
    <>
      {clients && !lockClient ? (
        <Field label="Client" required>
          <NativeSelect value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, brief_id: "" })} required>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {form.month !== undefined ? <Field label="Mois" required><Input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></Field> : null}
        <Field label="Type" required>
          <NativeSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LivrableKind })}>
            {(Object.keys(LIVRABLE_KIND) as LivrableKind[]).map((k) => <option key={k} value={k}>{LIVRABLE_KIND[k]}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Titre" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={240} required /></Field>
      <Field label="Lien du fichier" hint="HTTPS : Frame.io, Drive, .mp4 direct… Vérifie les droits de partage."><Input type="url" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Durée (secondes)"><Input type="number" min={0} value={form.duration_sec} onChange={(e) => setForm({ ...form, duration_sec: e.target.value })} /></Field>
        <Field label="Brief lié">
          <NativeSelect value={form.brief_id} onChange={(e) => setForm({ ...form, brief_id: e.target.value })}>
            <option value="">Aucun</option>
            {briefChoices.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </NativeSelect>
        </Field>
      </div>
    </>
  );
}

interface FormState { client_id: string; month?: string; kind: LivrableKind; title: string; file_url: string; duration_sec: string; brief_id: string }

export function NewLivrableDialog({ clients, briefs, defaultMonth, defaultClient, defaultBrief }: { clients: Array<{ id: string; name: string }>; briefs: BriefOption[]; defaultMonth: string; defaultClient?: string; defaultBrief?: string }) {
  const [open, setOpen] = useUrlFlag("new");
  const router = useRouter();
  const { exec, pending } = useAction();
  const initial = React.useCallback((): FormState => ({ client_id: defaultClient || briefs.find((b) => b.id === defaultBrief)?.client_id || clients[0]?.id || "", month: defaultMonth, kind: "video", title: "", file_url: "", duration_sec: "", brief_id: defaultBrief || "" }), [defaultClient, defaultBrief, defaultMonth, clients, briefs]);
  const [form, setForm] = React.useState<FormState>(initial);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setForm(initial()); }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => createLivrable({ client_id: form.client_id, month: form.month!, kind: form.kind, title: form.title, file_url: form.file_url || null, duration_sec: form.duration_sec ? Number(form.duration_sec) : null, brief_id: form.brief_id || null }),
      { success: "Livrable enregistré · en contrôle agence.", refresh: false, onSuccess: (l) => { setOpen(false); router.push(`/studio/livrables/${l.id}`); } });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Ajouter un livrable" description="Il passe en contrôle agence avant d'être proposé au client.">
        <form onSubmit={submit} className="space-y-4">
          <LivrableFields form={form} setForm={setForm} briefs={briefs} clients={clients} />
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditLivrableDialog({ livrable, briefs, open, onOpenChange }: { livrable: Livrable; briefs: BriefOption[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { exec, pending } = useAction();
  const [form, setForm] = React.useState<FormState>({ client_id: livrable.client_id, kind: livrable.kind, title: livrable.title, file_url: livrable.file_url ?? "", duration_sec: livrable.duration_sec?.toString() ?? "", brief_id: livrable.brief_id ?? "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => updateLivrable(livrable.id, { kind: form.kind, title: form.title.trim(), file_url: form.file_url || null, duration_sec: form.duration_sec ? Number(form.duration_sec) : null, brief_id: form.brief_id || null }), { success: "Livrable mis à jour.", onSuccess: () => onOpenChange(false) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Modifier le livrable">
        <form onSubmit={submit} className="space-y-4">
          <LivrableFields form={form} setForm={setForm} briefs={briefs} lockClient />
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
