"use client";
import * as React from "react";
import { CalendarPlus, Check, Plus, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { bookAppointment, cancelAppointment } from "@/lib/actions/marketing";
import { closeTaskAction, createTaskAction, updateProspectAction } from "@/lib/actions/marketing-crm";
import { CALL_RESULT, OUTCOME, TASK_KIND, type Appointment, type CallResult, type MarketingTask, type Member, type Outcome, type Prospect, type Stage, type TaskKind } from "@/lib/marketing/types";
import { formatSlot, formatDateTimeInZone } from "@/lib/marketing/slots";
import { cn } from "@/lib/utils";

const num = (v: number | null | undefined) => (v == null ? "" : String(v));
const dayOf = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
const atNine = (day: string) => (day ? new Date(`${day}T09:00:00Z`).toISOString() : null);

/** L'affaire : étape du pipeline, valeur, responsables. */
export function DealForm({ prospect, stages, members }: { prospect: Prospect; stages: Stage[]; members: Member[] }) {
  const { exec, pending } = useAction();
  const init = { stage: prospect.stage_id ?? "", title: prospect.title ?? "", value: num(prospect.value), setter: prospect.setter_id ?? "", closer: prospect.closer_id ?? "" };
  const [f, setF] = React.useState(init);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const save = () => exec(() => updateProspectAction(prospect.id, { ...(f.stage && f.stage !== init.stage ? { stage_id: f.stage } : {}), title: f.title, value: f.value === "" ? null : Number(f.value.replace(",", ".")), setter_id: f.setter || null, closer_id: f.closer || null }), { success: "Affaire enregistrée." });
  const setters = members.filter((m) => m.marketing_role !== "closer" && m.marketing_role !== "media_buyer"), closers = members.filter((m) => m.marketing_role !== "setter" && m.marketing_role !== "media_buyer");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Étape"><NativeSelect value={f.stage} onChange={set("stage")}>{!f.stage ? <option value="">Sans étape</option> : null}{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Field label="Valeur de l'affaire (€ HT)" hint="Estimation, saisie à la main"><Input inputMode="decimal" value={f.value} onChange={set("value")} placeholder="Ex. 4000" /></Field>
      </div>
      <Field label="Intitulé de l'affaire" hint="Facultatif"><Input value={f.title} onChange={set("title")} maxLength={160} placeholder="Ex. Creative Sprint, 3 mois" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Setter responsable"><NativeSelect value={f.setter} onChange={set("setter")}><option value="">Personne</option>{setters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field>
        <Field label="Closer responsable"><NativeSelect value={f.closer} onChange={set("closer")}><option value="">Personne</option>{closers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field>
      </div>
      <Button size="sm" loading={pending} disabled={!dirty} onClick={save}><Save />Enregistrer</Button>
    </div>
  );
}

/** L'appel : résultat, issue, montant signé HT, note d'appel. */
export function CallForm({ prospect }: { prospect: Prospect }) {
  const { exec, pending } = useAction();
  const init = { result: prospect.call_result ?? "", outcome: prospect.outcome ?? "", amount: num(prospect.signed_amount), note: prospect.call_note ?? "" };
  const [f, setF] = React.useState(init);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const save = () => exec(() => updateProspectAction(prospect.id, { call_result: (f.result || null) as CallResult | null, outcome: (f.outcome || null) as Outcome | null, signed_amount: f.amount === "" ? null : Number(f.amount.replace(",", ".")), call_note: f.note }), { success: "Appel enregistré." });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Résultat d'appel"><NativeSelect value={f.result} onChange={(e) => setF((v) => ({ ...v, result: e.target.value }))}><option value="">Non renseigné</option>{(Object.keys(CALL_RESULT) as CallResult[]).map((k) => <option key={k} value={k}>{CALL_RESULT[k]}</option>)}</NativeSelect></Field>
        <Field label="Issue"><NativeSelect value={f.outcome} onChange={(e) => setF((v) => ({ ...v, outcome: e.target.value }))}><option value="">Non renseignée</option>{(Object.keys(OUTCOME) as Outcome[]).map((k) => <option key={k} value={k}>{OUTCOME[k]}</option>)}</NativeSelect></Field>
        <Field label="Montant signé (€ HT)"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF((v) => ({ ...v, amount: e.target.value }))} placeholder="Ex. 4000" /></Field>
      </div>
      <Field label="Note d'appel"><Textarea value={f.note} onChange={(e) => setF((v) => ({ ...v, note: e.target.value }))} rows={4} maxLength={4000} /></Field>
      <Button size="sm" loading={pending} disabled={!dirty} onClick={save}><Save />Enregistrer</Button>
    </div>
  );
}

/** Suivi : prochaine action, qualification, notes internes. */
export function FollowForm({ prospect }: { prospect: Prospect }) {
  const { exec, pending } = useAction();
  const init = { day: dayOf(prospect.next_action_at), note: prospect.next_action_note ?? "", besoin: prospect.besoin ?? "", budget: prospect.budget ?? "", notes: prospect.notes ?? "" };
  const [f, setF] = React.useState(init);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const save = () => exec(() => updateProspectAction(prospect.id, { next_action_at: atNine(f.day), next_action_note: f.note, besoin: f.besoin, budget: f.budget, notes: f.notes }), { success: "Suivi enregistré." });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <Field label="Prochaine action"><Input type="date" value={f.day} onChange={set("day")} /></Field>
        <Field label="Note de suivi"><Input value={f.note} onChange={set("note")} maxLength={200} placeholder="Ex. Envoyer l'étude de cas avant l'appel" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Besoin"><Input value={f.besoin} onChange={set("besoin")} maxLength={300} /></Field>
        <Field label="Budget indicatif" hint="Déclaratif"><Input value={f.budget} onChange={set("budget")} maxLength={120} /></Field>
      </div>
      <Field label="Notes internes"><Textarea value={f.notes} onChange={set("notes")} rows={4} maxLength={4000} /></Field>
      <Button size="sm" loading={pending} disabled={!dirty} onClick={save}><Save />Enregistrer</Button>
    </div>
  );
}

/** Tâches Marketing du prospect (« À appeler »…). Sans rapport avec les tâches de Studio. */
export function TasksPanel({ prospectId, tasks, members, me, timezone, today }: { prospectId: string; tasks: MarketingTask[]; members: Member[]; me: string; timezone: string; today: string }) {
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ kind: "a_appeler" as TaskKind, title: "", assignee: me, day: today, note: "" });
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
  const day = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }), [timezone]);
  const add = () => exec(() => createTaskAction({ prospect_id: prospectId, kind: f.kind, title: f.title || undefined, assignee_id: f.assignee || null, due_at: atNine(f.day), note: f.note || undefined }), { success: "Tâche ajoutée.", onSuccess: () => { setOpen(false); setF((v) => ({ ...v, title: "", note: "" })); } });
  const openTasks = tasks.filter((t) => t.status === "ouverte"), closed = tasks.filter((t) => t.status !== "ouverte").slice(0, 5);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-[14px] font-semibold">Tâches</h3><Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus />Ajouter</Button></div>
      {tasks.length === 0 ? <p className="text-[13px] text-muted">Aucune tâche. « À appeler » se crée ici, avec un responsable et une échéance.</p> : null}
      <ul className="space-y-2">
        {openTasks.map((t) => {
          const late = !!t.due_at && t.due_at.slice(0, 10) < today, due = !!t.due_at && t.due_at.slice(0, 10) === today;
          return (
            <li key={t.id} className={cn("flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]", late && "ring-1 ring-warning/50")}>
              <Button size="icon-sm" variant="ghost" aria-label={`Marquer « ${t.title} » comme faite`} disabled={pending} onClick={() => exec(() => closeTaskAction(t.id, "faite"), { success: "Tâche terminée." })}><Check /></Button>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                <p className="text-[12px] text-muted">{[TASK_KIND[t.kind], name(t.assignee_id) ?? "non attribuée", t.due_at ? `${late ? "en retard, " : due ? "aujourd'hui, " : ""}${day.format(new Date(t.due_at))}` : "sans échéance"].join(" · ")}</p>
                {t.note ? <p className="mt-0.5 text-[12px] text-fg-2">{t.note}</p> : null}
              </div>
              {late ? <Badge tone="warning">En retard</Badge> : null}
            </li>
          );
        })}
        {closed.map((t) => (
          <li key={t.id} className="flex items-center gap-2 px-3 py-1 text-[12.5px] text-muted">
            <span className="line-through">{t.title}</span><span>· {t.status === "faite" ? "faite" : "annulée"}</span>
            <Button size="icon-sm" variant="ghost" aria-label={`Rouvrir « ${t.title} »`} className="ml-auto" disabled={pending} onClick={() => exec(() => closeTaskAction(t.id, "ouverte"), { success: "Tâche rouverte." })}><RotateCcw /></Button>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouvelle tâche" description="Une tâche de l'espace Marketing, rattachée à ce prospect.">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type"><NativeSelect value={f.kind} onChange={(e) => setF((v) => ({ ...v, kind: e.target.value as TaskKind }))}>{(Object.keys(TASK_KIND) as TaskKind[]).map((k) => <option key={k} value={k}>{TASK_KIND[k]}</option>)}</NativeSelect></Field>
              <Field label="Échéance"><Input type="date" value={f.day} onChange={(e) => setF((v) => ({ ...v, day: e.target.value }))} /></Field>
            </div>
            <Field label="Attribuée à"><NativeSelect value={f.assignee} onChange={(e) => setF((v) => ({ ...v, assignee: e.target.value }))}><option value="">Personne</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field>
            <Field label="Intitulé" hint="Vide : le nom du type"><Input value={f.title} onChange={(e) => setF((v) => ({ ...v, title: e.target.value }))} maxLength={160} /></Field>
            <Field label="Note"><Textarea value={f.note} onChange={(e) => setF((v) => ({ ...v, note: e.target.value }))} rows={3} maxLength={2000} /></Field>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button loading={pending} onClick={add}>Ajouter</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Appointments({ prospectId, appointments, slots, slotMinutes, timezone, canBook = true }: { prospectId: string; appointments: Appointment[]; slots: { start: string; end: string }[]; slotMinutes: number | null; timezone: string; canBook?: boolean }) {
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState("");
  const [manual, setManual] = React.useState("");
  const [meeting, setMeeting] = React.useState("");
  const [cancelId, setCancelId] = React.useState<string | null>(null);

  const book = () => {
    let startIso = choice;
    if (!startIso && manual) { const d = new Date(manual); if (!isNaN(d.getTime())) startIso = d.toISOString(); }
    if (!startIso) return;
    const mins = slotMinutes ?? 30;
    const endIso = new Date(new Date(startIso).getTime() + mins * 60000).toISOString();
    exec(() => bookAppointment({ prospect_id: prospectId, starts_at: startIso, ends_at: endIso, meeting_url: meeting.trim() || null }), { success: "Rendez-vous confirmé.", onSuccess: () => { setOpen(false); setChoice(""); setManual(""); setMeeting(""); } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-[14px] font-semibold">Rendez-vous</h3>{canBook ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><CalendarPlus />Réserver</Button> : null}</div>
      {appointments.length === 0 ? <p className="text-[13px] text-muted">Aucun rendez-vous.</p> : (
        <ul className="space-y-2">
          {appointments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
              <span className="min-w-0"><span className={a.status === "annule" ? "text-muted line-through" : ""}>{formatDateTimeInZone(a.starts_at, timezone)}</span>{a.title || (a.source && a.source !== "interne") ? <span className="block truncate text-[11.5px] text-muted">{[a.title, a.source && a.source !== "interne" ? (a.source === "iclosed" ? "iClosed" : a.source) : null, a.result && a.result !== "a_venir" ? CALL_RESULT[a.result] : null].filter(Boolean).join(" · ")}</span> : null}</span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${a.status === "confirme" ? "bg-success/15 text-success" : "bg-surface-3 text-muted"}`}>{a.status === "confirme" ? "Confirmé" : a.status === "annule" ? "Annulé" : "Déplacé"}</span>
                {a.status === "confirme" && canBook ? <Button size="icon-sm" variant="ghost" aria-label="Annuler" onClick={() => setCancelId(a.id)}><X /></Button> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Réserver un créneau" description="Choisis un créneau proposé, ou saisis une date précise.">
          <div className="space-y-4">
            {slots.length ? (
              <Field label="Créneaux disponibles">
                <NativeSelect value={choice} onChange={(e) => { setChoice(e.target.value); setManual(""); }}>
                  <option value="">— Choisir —</option>
                  {slots.map((s) => <option key={s.start} value={s.start}>{formatSlot(s.start, timezone)}</option>)}
                </NativeSelect>
              </Field>
            ) : <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-muted">Aucun créneau proposé (disponibilités non configurées). Saisis une date manuelle.</p>}
            <Field label="Ou date et heure (manuel)" hint="Fuseau de ton navigateur"><Input type="datetime-local" value={manual} onChange={(e) => { setManual(e.target.value); setChoice(""); }} /></Field>
            <Field label="Lien visio (optionnel)"><Input value={meeting} onChange={(e) => setMeeting(e.target.value)} placeholder="https://…" maxLength={400} /></Field>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button loading={pending} disabled={!choice && !manual} onClick={book}>Confirmer le RDV</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)} loading={pending} danger title="Annuler ce rendez-vous ?" description="Les rappels programmés pour ce rendez-vous seront annulés."
        confirmLabel="Annuler le RDV" onConfirm={() => { if (cancelId) exec(() => cancelAppointment(cancelId), { success: "Rendez-vous annulé.", onSuccess: () => setCancelId(null) }); }} />
    </div>
  );
}
