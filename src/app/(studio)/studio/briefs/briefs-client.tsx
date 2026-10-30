"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/tabs";
import { useAction } from "@/lib/hooks/use-action";
import { createBrief, transitionBrief } from "@/lib/actions/briefs";
import type { BriefKind } from "@/lib/data/types";
import { useUrlFlag, useUrlParam } from "../_prod/filter-bar";

export function KindSegments({ counts }: { counts: { video: number; statique: number; all: number } }) {
  const [kind, setKind] = useUrlParam("kind");
  const value = (kind as BriefKind | "") || "all";
  return (
    <SegmentedControl value={value} onChange={(v) => setKind(v === "all" ? "" : v, true)}
      options={[{ value: "video", label: "Vidéo", count: counts.video }, { value: "statique", label: "Statique", count: counts.statique }, { value: "all", label: "Tous", count: counts.all }]} />
  );
}

export function TrashToggle({ active, count }: { active: boolean; count: number }) {
  const [, setTrash] = useUrlParam("trash");
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" onClick={() => setTrash(active ? "" : "1", true)} aria-pressed={active}>
      <Trash2 />Corbeille{count ? <span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular">{count}</span> : null}
    </Button>
  );
}

export function RestoreBriefButton({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return <Button variant="secondary" size="sm" loading={pending} onClick={() => exec(() => transitionBrief(id, "redaction"), { success: "Brief restauré · en rédaction." })}><RotateCcw />Restaurer</Button>;
}

export function NewBriefDialog({ clients, defaultMonth, defaultClient }: { clients: Array<{ id: string; name: string }>; defaultMonth: string; defaultClient?: string }) {
  const [open, setOpen] = useUrlFlag("new");
  const router = useRouter();
  const { exec, pending } = useAction();
  const [form, setForm] = React.useState({ client_id: defaultClient || clients[0]?.id || "", month: defaultMonth, kind: "video" as BriefKind, title: "" });
  const [seen, setSeen] = React.useState({ open, defaultClient, defaultMonth });
  if (seen.open !== open || seen.defaultClient !== defaultClient || seen.defaultMonth !== defaultMonth) {
    setSeen({ open, defaultClient, defaultMonth });
    if (open) setForm((f) => ({ ...f, client_id: defaultClient || f.client_id || clients[0]?.id || "", month: defaultMonth }));
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => createBrief(form), { success: "Brief créé.", refresh: false, onSuccess: (b) => { setOpen(false); router.push(`/studio/briefs/${b.id}`); } });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Nouveau brief" description="Il démarre en rédaction. Tu le soumettras au contrôle Ibra quand il sera prêt.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Client" required>
            <NativeSelect value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mois" required><Input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></Field>
            <Field label="Type" required>
              <NativeSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as BriefKind })}>
                <option value="video">Brief vidéo</option><option value="statique">Brief statique</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Titre" required hint="Ex. « 01 · Le secret des cils qui tiennent 6 semaines »"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={240} autoFocus required /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Créer le brief</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
