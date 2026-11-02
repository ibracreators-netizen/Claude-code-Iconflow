"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createProspect } from "@/lib/actions/marketing";

export function NewProspect() {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", source: "", notes: "" });
  const { exec, pending } = useAction();
  const router = useRouter();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => createProspect(form), { success: "Prospect ajouté.", onSuccess: (p) => { setOpen(false); setForm({ name: "", email: "", phone: "", source: "", notes: "" }); router.push(`/marketing/prospects/${p.id}`); } });
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Nouveau prospect</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau prospect" description="Ajoute un prospect à la main. L'email sert à la déduplication et aux relances.">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={160} autoFocus /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={160} /></Field>
              <Field label="Téléphone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} /></Field>
            </div>
            <Field label="Source" hint="Ex. landing-sprint, instagram, recommandation"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} maxLength={80} /></Field>
            <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={2000} /></Field>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Ajouter</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
