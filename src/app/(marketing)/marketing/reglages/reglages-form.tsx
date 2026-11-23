"use client";
import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/lib/hooks/use-action";
import { saveMarketingSettings } from "@/lib/actions/marketing";
import type { AvailabilityWindow, MarketingSettings } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, BTN_ICON, Code, INPUT, KitField, Panel, SELECT } from "./kit";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** Fuseaux proposés (une liste courte, en clair). Un fuseau déjà enregistré hors de cette liste reste proposé. */
const ZONES: Array<[string, string]> = [
  ["Europe/Paris", "Paris (France)"],
  ["Europe/Brussels", "Bruxelles (Belgique)"],
  ["Europe/Luxembourg", "Luxembourg"],
  ["Europe/Zurich", "Genève, Zurich (Suisse)"],
  ["Europe/London", "Londres (Royaume-Uni)"],
  ["Europe/Lisbon", "Lisbonne (Portugal)"],
  ["Africa/Casablanca", "Casablanca (Maroc)"],
  ["Africa/Algiers", "Alger (Algérie)"],
  ["Africa/Tunis", "Tunis (Tunisie)"],
  ["Africa/Dakar", "Dakar (Sénégal)"],
  ["Africa/Abidjan", "Abidjan (Côte d'Ivoire)"],
  ["Asia/Dubai", "Dubaï (Émirats)"],
  ["Indian/Reunion", "La Réunion"],
  ["America/Guadeloupe", "Guadeloupe"],
  ["America/Martinique", "Martinique"],
  ["America/Cayenne", "Guyane"],
  ["America/Toronto", "Montréal, Toronto (Canada)"],
  ["Pacific/Tahiti", "Tahiti"],
];

/** Ligne de réglage avec interrupteur : libellé, précision grise, interrupteur à droite. */
function ToggleRow({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[10px] border border-mk-line px-4 py-3.5">
      <span className="min-w-0"><span className="block text-[14px] font-medium text-mk-strong">{label}</span>{sub ? <span className="mt-0.5 block text-[13px] text-mk-sub">{sub}</span> : null}</span>
      {children}
    </label>
  );
}

/** Ce que la rubrique Général enregistre : le reste des réglages (anciennes relances, alertes) n'est jamais réécrit d'ici. */
type General = Pick<MarketingSettings, "timezone" | "booking_mode" | "booking_url" | "availability" | "slot_minutes" | "min_notice_hours" | "booking_public_enabled">;
const pick = (s: MarketingSettings): General => ({
  timezone: s.timezone, booking_mode: s.booking_mode, booking_url: s.booking_url, availability: s.availability,
  slot_minutes: s.slot_minutes, min_notice_hours: s.min_notice_hours, booking_public_enabled: s.booking_public_enabled,
});

/**
 * Rubrique Général : le fuseau horaire de l'espace et la prise de rendez-vous (outil externe ou page /reserver).
 * Les réglages qui ne servaient qu'à la réception des leads, aux alertes du planificateur, aux relances et aux rappels
 * automatiques ne sont plus affichés : les leads arrivent maintenant dans GoHighLevel.
 */
export function ReglagesForm({ initial }: { initial: MarketingSettings }) {
  const { exec, pending } = useAction();
  const [s, setS] = React.useState<General>(() => pick(initial));
  const set = <K extends keyof General>(k: K, v: General[K]) => setS((cur) => ({ ...cur, [k]: v }));
  const setWin = (i: number, patch: Partial<AvailabilityWindow>) => set("availability", s.availability.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const addWin = () => set("availability", [...s.availability, { weekday: 1, start: "09:00", end: "12:00" }]);
  const delWin = (i: number) => set("availability", s.availability.filter((_, j) => j !== i));
  const zones = ZONES.some(([z]) => z === s.timezone) ? ZONES : [[s.timezone, s.timezone] as [string, string], ...ZONES];

  const save = () => exec(() => saveMarketingSettings(s), { success: "Réglages enregistrés." });

  return (
    <div className="space-y-4 lg:space-y-6">
      <Panel title="Fuseau horaire" description="Les heures de l'espace (rendez-vous, tâches, chiffres du jour) s'affichent dans ce fuseau.">
        <KitField label="Fuseau de l'équipe" className="sm:max-w-sm">
          <NativeSelect value={s.timezone} onChange={(e) => set("timezone", e.target.value)} className={SELECT}>
            {zones.map(([z, label]) => <option key={z} value={z}>{label}</option>)}
          </NativeSelect>
        </KitField>
      </Panel>

      <Panel title="Prise de rendez-vous" description={<>Où tes prospects prennent rendez-vous. Avec un outil externe, la fiche du prospect propose ton lien de réservation ; la page <Code>/reserver</Code> et les disponibilités de l&apos;app sont masquées.</>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <KitField label="Outil de réservation">
            <NativeSelect value={s.booking_mode} onChange={(e) => set("booking_mode", e.target.value === "interne" ? "interne" : "externe")} className={SELECT}>
              <option value="externe">Outil externe (GHL, iClosed…)</option>
              <option value="interne">Dans l&apos;app (page /reserver)</option>
            </NativeSelect>
          </KitField>
          {s.booking_mode === "externe" ? <KitField label="Lien de réservation" hint="Proposé sur la fiche du prospect, onglet Rendez-vous. Vide : aucun lien."><Input type="url" value={s.booking_url ?? ""} onChange={(e) => set("booking_url", e.target.value || null)} placeholder="https://…" className={INPUT} /></KitField> : null}
        </div>
      </Panel>

      {s.booking_mode === "interne" ? (<>
        <Panel title="Disponibilités" description="Plages de chaque semaine, dans le fuseau de l'équipe. Tant qu'aucune plage n'est définie, aucun créneau n'est proposé.">
          <div className="grid gap-4 sm:grid-cols-2">
            <KitField label="Durée d'un rendez-vous (min)"><Input type="number" min={5} step={5} value={s.slot_minutes ?? ""} onChange={(e) => set("slot_minutes", e.target.value ? Number(e.target.value) : null)} placeholder="non défini" className={INPUT} /></KitField>
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

        <Panel title="Réservation en ligne" description="Page publique de prise de rendez-vous. Éteinte par défaut : sans disponibilités réelles, elle ne doit pas promettre de faux créneaux.">
          <ToggleRow label={<>Ouvrir la page publique <Code>/reserver</Code></>}><Switch checked={s.booking_public_enabled} onCheckedChange={(v) => set("booking_public_enabled", v)} /></ToggleRow>
        </Panel>
      </>) : null}

      <div><Button className={cn(BTN, "w-full sm:w-auto")} loading={pending} onClick={save}><Save />Enregistrer</Button></div>
    </div>
  );
}
