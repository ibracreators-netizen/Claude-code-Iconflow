"use client";
import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { saveMarketingSettings } from "@/lib/actions/marketing";
import type { AvailabilityWindow, MarketingSettings } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, BTN_ICON, Code, INPUT, KitField, Panel, SELECT } from "./kit";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export interface SchedulerInfo { tone: "ok" | "warn"; verdict: string; note: string }

/** Ligne de réglage avec interrupteur : libellé, précision grise, interrupteur à droite. */
function ToggleRow({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[10px] border border-mk-line px-4 py-3.5">
      <span className="min-w-0"><span className="block text-[14px] font-medium text-mk-strong">{label}</span>{sub ? <span className="mt-0.5 block text-[13px] text-mk-sub">{sub}</span> : null}</span>
      {children}
    </label>
  );
}

export function ReglagesForm({ initial, scheduler, mailer }: { initial: MarketingSettings; scheduler: SchedulerInfo; mailer: boolean }) {
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
      <Panel title="Réservation" description={<>Où tes prospects prennent rendez-vous. Avec un outil externe, la page <Code>/reserver</Code> et les disponibilités de l&apos;app sont masquées : les rendez-vous arrivent par la synchronisation.</>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <KitField label="Outil de réservation">
            <NativeSelect value={s.booking_mode} onChange={(e) => set("booking_mode", e.target.value === "interne" ? "interne" : "externe")} className={SELECT}>
              <option value="externe">Outil externe (iClosed)</option>
              <option value="interne">Dans l&apos;app (page /reserver)</option>
            </NativeSelect>
          </KitField>
          {s.booking_mode === "externe" ? <KitField label="Lien de réservation" hint="Repris dans l'email de relance. Vide : l'email part sans lien."><Input type="url" value={s.booking_url ?? ""} onChange={(e) => set("booking_url", e.target.value || null)} placeholder="https://…" className={INPUT} /></KitField> : null}
        </div>
      </Panel>

      {s.booking_mode === "interne" ? (<>
      <Panel title="Disponibilités" description="Plages hebdomadaires dans le fuseau d'affichage. Tant qu'aucune plage n'est définie, aucun créneau n'est proposé.">
        <div className="grid gap-4 sm:grid-cols-3">
          <KitField label="Fuseau d'affichage"><Input value={s.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Europe/Paris" className={INPUT} /></KitField>
          <KitField label="Durée d'un RDV (min)"><Input type="number" min={5} step={5} value={s.slot_minutes ?? ""} onChange={(e) => set("slot_minutes", e.target.value ? Number(e.target.value) : null)} placeholder="non défini" className={INPUT} /></KitField>
          <KitField label="Délai minimum (h)"><Input type="number" min={0} value={s.min_notice_hours} onChange={(e) => set("min_notice_hours", Number(e.target.value) || 0)} className={INPUT} /></KitField>
        </div>
        <div className="mt-4 space-y-2">
          {s.availability.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-mk-line p-2 sm:flex-nowrap sm:border-0 sm:p-0">
              <NativeSelect aria-label="Jour" value={w.weekday} onChange={(e) => setWin(i, { weekday: Number(e.target.value) })} className={cn(SELECT, "w-full sm:w-44")}>{DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}</NativeSelect>
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                <Input type="time" aria-label="Début" value={w.start} onChange={(e) => setWin(i, { start: e.target.value })} className={cn(INPUT, "min-w-0 flex-1 sm:w-32 sm:flex-none")} />
                <span className="text-mk-sub" aria-hidden>→</span>
                <Input type="time" aria-label="Fin" value={w.end} onChange={(e) => setWin(i, { end: e.target.value })} className={cn(INPUT, "min-w-0 flex-1 sm:w-32 sm:flex-none")} />
                <Button size="icon-sm" variant="ghost" className={cn(BTN_ICON, "hover:text-mk-danger")} aria-label="Retirer" onClick={() => delWin(i)}><Trash2 /></Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" className={cn(BTN_GHOST, "-ml-1 text-accent-2 hover:text-accent-2")} onClick={addWin}><Plus />Ajouter une plage</Button>
        </div>
      </Panel>

      <Panel title="Réservation en ligne" description="Page publique de prise de rendez-vous. Désactivée par défaut : sans disponibilités réelles, elle ne doit pas promettre de faux créneaux.">
        <ToggleRow label={<>Ouvrir la page publique <Code>/reserver</Code></>}><Switch checked={s.booking_public_enabled} onCheckedChange={(v) => set("booking_public_enabled", v)} /></ToggleRow>
      </Panel>

      </>) : null}

      <Panel title="Emails (rappels & relances)" description="Rien n'est actif par défaut. Les rappels se programment à la confirmation d'un RDV selon les offsets ; la relance part après un opt-in sans réservation, selon le délai.">
        <div className="grid gap-4 sm:grid-cols-2">
          <KitField label="Rappels avant le RDV (heures, séparées par des virgules)" hint="Ex. 24, 1 — vide = aucun rappel"><Input defaultValue={reminders} onBlur={(e) => set("reminder_offsets_hours", e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0))} placeholder="aucun" className={INPUT} /></KitField>
          <KitField label="Relance après opt-in sans réservation (h)" hint="vide = aucune relance"><Input type="number" min={1} value={s.relance_delay_hours ?? ""} onChange={(e) => set("relance_delay_hours", e.target.value ? Number(e.target.value) : null)} placeholder="aucune" className={INPUT} /></KitField>
        </div>
        <div className="mt-4">
          <ToggleRow label="Envoi réel des emails" sub="Désactivé = DRY RUN : rien n'est envoyé, tout est seulement enregistré.">
            <Switch checked={s.emails_live} onCheckedChange={(v) => { if (v) setConfirmLive(true); else set("emails_live", false); }} />
          </ToggleRow>
        </div>
        <KitField label="Adresse de test (optionnel)" hint="En envoi réel, tout est redirigé vers cette adresse si renseignée." className="mt-4"><Input type="email" value={s.test_email ?? ""} onChange={(e) => set("test_email", e.target.value || null)} placeholder="toi@icon-flow.fr" className={INPUT} /></KitField>
      </Panel>

      <Panel title="Alertes et planificateur" description="Qui est prévenu à chaque nouveau lead, à chaque erreur de traitement, et si le planificateur s'arrête.">
        <KitField label="Adresses à prévenir (séparées par des virgules)" hint={mailer ? "Les alertes partent par Resend." : "Simulation : RESEND_API_KEY ou EMAIL_FROM manque sur l'hébergeur, aucune alerte ne part pour l'instant."}>
          <Input defaultValue={s.alert_emails.join(", ")} onBlur={(e) => set("alert_emails", e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x)))} placeholder="toi@icon-flow.fr" className={INPUT} />
        </KitField>
        <div className={cn("mt-4 rounded-[10px] border px-4 py-3", scheduler.tone === "ok" ? "border-mk-line bg-surface-2" : "border-mk-warn/30 bg-mk-warn-soft")}>
          <p className="text-[14px]"><span className="font-semibold text-mk-strong">Planificateur</span> <span className={cn("font-semibold", scheduler.tone === "ok" ? "text-mk-success" : "text-mk-warn")}>{scheduler.verdict}</span></p>
          <p className="mt-1 text-[13px] text-mk-text">{scheduler.note}</p>
        </div>
      </Panel>

      <div><Button className={cn(BTN, "w-full sm:w-auto")} loading={pending} onClick={() => save()}><Save />Enregistrer les réglages</Button></div>

      <ConfirmDialog open={confirmLive} onOpenChange={setConfirmLive} title="Activer l'envoi réel des emails ?"
        description="Les emails partiront vraiment aux prospects (ou à l'adresse de test si renseignée). Assure-toi d'avoir vérifié les gabarits et la configuration Resend. Enregistre ensuite pour appliquer."
        confirmLabel="Activer l'envoi réel" onConfirm={() => { set("emails_live", true); setConfirmLive(false); }} />
    </div>
  );
}
