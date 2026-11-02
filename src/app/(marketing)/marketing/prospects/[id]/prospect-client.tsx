"use client";
import * as React from "react";

import { CalendarPlus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { updateProspect, bookAppointment, cancelAppointment } from "@/lib/actions/marketing";
import { PROSPECT_STATUS, type Appointment, type ProspectStatus } from "@/lib/marketing/types";
import { formatSlot, formatDateTimeInZone } from "@/lib/marketing/slots";

export function StatusAndNotes({ id, status, notes }: { id: string; status: ProspectStatus; notes: string | null }) {
  const { exec, pending } = useAction();
  const [st, setSt] = React.useState<ProspectStatus>(status);
  const [nt, setNt] = React.useState(notes ?? "");
  const dirty = st !== status || nt !== (notes ?? "");
  return (
    <div className="space-y-4">
      <Field label="Statut">
        <NativeSelect value={st} onChange={(e) => setSt(e.target.value as ProspectStatus)}>
          {(Object.keys(PROSPECT_STATUS) as ProspectStatus[]).map((s) => <option key={s} value={s}>{PROSPECT_STATUS[s]}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Notes internes"><Textarea value={nt} onChange={(e) => setNt(e.target.value)} rows={5} maxLength={4000} /></Field>
      <Button size="sm" loading={pending} disabled={!dirty} onClick={() => exec(() => updateProspect(id, { status: st, notes: nt }), { success: "Prospect enregistré." })}><Save />Enregistrer</Button>
    </div>
  );
}

export function Appointments({ prospectId, appointments, slots, slotMinutes, timezone }: { prospectId: string; appointments: Appointment[]; slots: { start: string; end: string }[]; slotMinutes: number | null; timezone: string }) {
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
      <div className="flex items-center justify-between"><h3 className="text-[14px] font-semibold">Rendez-vous</h3><Button size="sm" variant="secondary" onClick={() => setOpen(true)}><CalendarPlus />Réserver</Button></div>
      {appointments.length === 0 ? <p className="text-[13px] text-muted">Aucun rendez-vous.</p> : (
        <ul className="space-y-2">
          {appointments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
              <span className={a.status === "annule" ? "text-muted line-through" : ""}>{formatDateTimeInZone(a.starts_at, timezone)}</span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${a.status === "confirme" ? "bg-success/15 text-success" : "bg-surface-3 text-muted"}`}>{a.status === "confirme" ? "Confirmé" : a.status === "annule" ? "Annulé" : "Déplacé"}</span>
                {a.status === "confirme" ? <Button size="icon-sm" variant="ghost" aria-label="Annuler" onClick={() => setCancelId(a.id)}><X /></Button> : null}
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
