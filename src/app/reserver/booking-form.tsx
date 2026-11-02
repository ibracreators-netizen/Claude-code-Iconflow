"use client";
import * as React from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { formatSlot } from "@/lib/marketing/slots";
import { submitBooking } from "@/lib/actions/marketing-public";

export function BookingForm({ slots, timezone }: { slots: { start: string; end: string }[]; timezone: string }) {
  const [form, setForm] = React.useState({ slot_start: "", name: "", email: "", phone: "", website: "" });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!form.slot_start) { setError("Choisis un créneau."); return; }
    setPending(true);
    const res = await submitBooking(form);
    setPending(false);
    if (res.ok) setDone(res.when ? formatSlot(res.when, timezone) : "ton créneau");
    else setError(res.error);
  };

  if (done) return (
    <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
      <CalendarCheck className="mx-auto mb-3 size-8 text-success" />
      <h2 className="text-[18px] font-semibold">C&apos;est réservé</h2>
      <p className="mt-1 text-[14px] text-muted">Rendez-vous confirmé pour {done}. Un email de confirmation suivra.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p> : null}
      <Field label="Créneau" required>
        <NativeSelect value={form.slot_start} onChange={(e) => setForm({ ...form, slot_start: e.target.value })} required>
          <option value="">— Choisir un créneau —</option>
          {slots.map((s) => <option key={s.start} value={s.start}>{formatSlot(s.start, timezone)}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={160} required /></Field>
        <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={160} required /></Field>
      </div>
      <Field label="Téléphone (optionnel)"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} /></Field>
      {/* champ piège anti-robots : invisible, doit rester vide */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden"><label>Site web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label></div>
      <Button type="submit" disabled={pending} className="w-full">{pending ? <Loader2 className="animate-spin" /> : <CalendarCheck />}Réserver mon créneau</Button>
    </form>
  );
}
