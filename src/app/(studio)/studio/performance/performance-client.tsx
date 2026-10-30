"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/tabs";
import { useAction } from "@/lib/hooks/use-action";
import { upsertMetric } from "@/lib/actions/metrics";
import { useUrlParam } from "../_prod/filter-bar";

export function RangeSegments({ value }: { value: string }) {
  const [, setRange] = useUrlParam("range");
  return <SegmentedControl value={value} onChange={(v) => setRange(v === "90" ? "" : v, true)} options={[{ value: "30", label: "30 j" }, { value: "90", label: "90 j" }, { value: "all", label: "Tout" }]} />;
}

function lastMonday() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }

export function MetricsDialog({ clients, livrables }: { clients: Array<{ id: string; name: string }>; livrables: Array<{ id: string; title: string; client_id: string }> }) {
  const [open, setOpen] = React.useState(false);
  const { exec, pending } = useAction();
  const [form, setForm] = React.useState({ client_id: clients[0]?.id ?? "", livrable_id: "", period_start: lastMonday(), spend: "", impressions: "", clicks: "", thruplays_3s: "", purchases: "", revenue: "" });
  const n = (v: string) => Number(v || 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => upsertMetric({ client_id: form.client_id, livrable_id: form.livrable_id || null, period_start: form.period_start, spend: n(form.spend), impressions: n(form.impressions), clicks: n(form.clicks), thruplays_3s: n(form.thruplays_3s), purchases: n(form.purchases), revenue: n(form.revenue) }), { success: "Métriques enregistrées.", onSuccess: () => setOpen(false) });
  };
  const num = (key: keyof typeof form, label: string, step = "1") => <Field label={label}><Input type="number" min={0} step={step} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></Field>;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus />Saisir des métriques</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Saisir des métriques" description="Une ligne par semaine (date du lundi), par client, et si possible par créative. Une saisie existante est remplacée.">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client" required><NativeSelect value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, livrable_id: "" })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
              <Field label="Créative"><NativeSelect value={form.livrable_id} onChange={(e) => setForm({ ...form, livrable_id: e.target.value })}><option value="">Compte entier</option>{livrables.filter((l) => l.client_id === form.client_id).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</NativeSelect></Field>
              <Field label="Semaine du" required><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} required /></Field>
              {num("spend", "Dépense (€)", "0.01")}
              {num("impressions", "Impressions")}
              {num("thruplays_3s", "Vues 3 s (thruplays)")}
              {num("clicks", "Clics")}
              {num("purchases", "Achats")}
              {num("revenue", "CA attribué (€)", "0.01")}
            </div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
