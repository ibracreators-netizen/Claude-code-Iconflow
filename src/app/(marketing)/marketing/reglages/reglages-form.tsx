"use client";
import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { saveMarketingSettings } from "@/lib/actions/marketing";
import type { AvailabilityWindow, MarketingSettings } from "@/lib/marketing/types";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function ReglagesForm({ initial }: { initial: MarketingSettings }) {
  const { exec, pending } = useAction();
  const [s, setS] = React.useState<MarketingSettings>(initial);
  const [confirmLive, setConfirmLive] = React.useState(false);
  const set = <K extends keyof MarketingSettings>(k: K, v: MarketingSettings[K]) => setS((cur) => ({ ...cur, [k]: v }));
  const setWin = (i: number, patch: Partial<AvailabilityWindow>) => set("availability", s.availability.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const addWin = () => set("availability", [...s.availability, { weekday: 1, start: "09:00", end: "12:00" }]);
  const delWin = (i: number) => set("availability", s.availability.filter((_, j) => j !== i));

  const save = (next: MarketingSettings = s) => exec(() => saveMarketingSettings(next), { success: "Réglages enregistrés." });
  const reminders = s.reminder_offsets_hours.join(", ");

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h3 className="mb-1 text-[15px] font-semibold">Disponibilités</h3>
        <p className="mb-4 text-[12.5px] text-muted">Plages hebdomadaires dans le fuseau d&apos;affichage. Tant qu&apos;aucune plage n&apos;est définie, aucun créneau n&apos;est proposé.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fuseau d'affichage"><Input value={s.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Europe/Paris" /></Field>
          <Field label="Durée d'un RDV (min)"><Input type="number" min={5} step={5} value={s.slot_minutes ?? ""} onChange={(e) => set("slot_minutes", e.target.value ? Number(e.target.value) : null)} placeholder="non défini" /></Field>
          <Field label="Délai minimum (h)"><Input type="number" min={0} value={s.min_notice_hours} onChange={(e) => set("min_notice_hours", Number(e.target.value) || 0)} /></Field>
        </div>
        <div className="mt-4 space-y-2">
          {s.availability.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <NativeSelect value={w.weekday} onChange={(e) => setWin(i, { weekday: Number(e.target.value) })} className="w-40">{DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}</NativeSelect>
              <Input type="time" value={w.start} onChange={(e) => setWin(i, { start: e.target.value })} className="w-32" />
              <span className="text-muted">→</span>
              <Input type="time" value={w.end} onChange={(e) => setWin(i, { end: e.target.value })} className="w-32" />
              <Button size="icon-sm" variant="ghost" aria-label="Retirer" onClick={() => delWin(i)}><Trash2 /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={addWin}><Plus />Ajouter une plage</Button>
        </div>
      </section>

      <section className="card p-5">
        <h3 className="mb-1 text-[15px] font-semibold">Réservation en ligne</h3>
        <p className="mb-4 text-[12.5px] text-muted">Page publique de prise de rendez-vous. Désactivée par défaut : sans disponibilités réelles, elle ne doit pas promettre de faux créneaux.</p>
        <label className="flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-4 py-3"><span className="text-[13.5px] font-medium">Ouvrir la page publique <span className="font-mono text-[12px] text-muted">/reserver</span></span><Switch checked={s.booking_public_enabled} onCheckedChange={(v) => set("booking_public_enabled", v)} /></label>
      </section>

      <section className="card p-5">
        <h3 className="mb-1 text-[15px] font-semibold">Emails (rappels & relances)</h3>
        <p className="mb-4 text-[12.5px] text-muted">Rien n&apos;est actif par défaut. Les rappels se programment à la confirmation d&apos;un RDV selon les offsets ; la relance part après un opt-in sans réservation, selon le délai.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rappels avant le RDV (heures, séparées par des virgules)" hint="Ex. 24, 1 — vide = aucun rappel"><Input defaultValue={reminders} onBlur={(e) => set("reminder_offsets_hours", e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0))} placeholder="aucun" /></Field>
          <Field label="Relance après opt-in sans réservation (h)" hint="vide = aucune relance"><Input type="number" min={1} value={s.relance_delay_hours ?? ""} onChange={(e) => set("relance_delay_hours", e.target.value ? Number(e.target.value) : null)} placeholder="aucune" /></Field>
        </div>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-4 py-3">
          <span><span className="block text-[13.5px] font-medium">Envoi réel des emails</span><span className="block text-[12px] text-muted">Désactivé = DRY RUN : rien n&apos;est envoyé, tout est seulement enregistré.</span></span>
          <Switch checked={s.emails_live} onCheckedChange={(v) => { if (v) setConfirmLive(true); else set("emails_live", false); }} />
        </label>
        <Field label="Adresse de test (optionnel)" hint="En envoi réel, tout est redirigé vers cette adresse si renseignée." className="mt-3"><Input type="email" value={s.test_email ?? ""} onChange={(e) => set("test_email", e.target.value || null)} placeholder="toi@icon-flow.fr" /></Field>
      </section>

      <div><Button loading={pending} onClick={() => save()}><Save />Enregistrer les réglages</Button></div>

      <ConfirmDialog open={confirmLive} onOpenChange={setConfirmLive} title="Activer l'envoi réel des emails ?"
        description="Les emails partiront vraiment aux prospects (ou à l'adresse de test si renseignée). Assure-toi d'avoir vérifié les gabarits et la configuration Resend. Enregistre ensuite pour appliquer."
        confirmLabel="Activer l'envoi réel" onConfirm={() => { set("emails_live", true); setConfirmLive(false); }} />
    </div>
  );
}
