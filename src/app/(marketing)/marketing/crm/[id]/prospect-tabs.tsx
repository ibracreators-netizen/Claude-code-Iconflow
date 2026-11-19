"use client";
import * as React from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, Check, ExternalLink, Loader2, Pencil, Pin, Plus, RotateCcw, Video, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { MkEmpty } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { bookAppointment, cancelAppointment } from "@/lib/actions/marketing";
import { addNoteAction, closeTaskAction, updateProspectAction } from "@/lib/actions/marketing-crm";
import { APPOINTMENT_STATUS, CALL_RESULT, TASK_KIND, type Appointment, type MarketingTask, type Member, type ProspectEvent } from "@/lib/marketing/types";
import { formatDateTimeInZone, formatSlot } from "@/lib/marketing/slots";
import { cn } from "@/lib/utils";
import { BTN_LINK, BTN_PRIMARY, BTN_SECONDARY, INPUT, Select, TabHeading, TEXTAREA, dayKey, safeUrl } from "./fiche-ui";

const CHIP = "inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium";

/* ─────────────────────────── Tâches ─────────────────────────── */

/** Tâches du prospect : à faire (échéance la plus proche en haut), puis terminées. Le rond termine ou rouvre la tâche. */
export function TasksTab({ tasks, members, timezone, today, onAdd }: { tasks: MarketingTask[]; members: Member[]; timezone: string; today: string; onAdd: () => void }) {
  const { exec, pending } = useAction();
  const [busy, setBusy] = React.useState<string | null>(null);
  const when = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), [timezone]);
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "Membre" : null);
  const open = tasks.filter((t) => t.status === "ouverte").sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity));
  const closed = tasks.filter((t) => t.status !== "ouverte").sort((a, b) => Date.parse(b.done_at ?? b.updated_at) - Date.parse(a.done_at ?? a.updated_at));
  const toggle = (t: MarketingTask) => {
    setBusy(t.id);
    void exec(() => closeTaskAction(t.id, t.status === "ouverte" ? "faite" : "ouverte"), { success: t.status === "ouverte" ? "Tâche terminée." : "Tâche rouverte." }).then(() => setBusy(null));
  };
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <TabHeading title="À faire" count={open.length} action={<button type="button" onClick={onAdd} className={BTN_LINK}><Plus />Ajouter une tâche</button>} />
        {open.length === 0 ? <MkEmpty>Aucune tâche à faire pour ce prospect.</MkEmpty> : (
          <ul className="divide-y divide-mk-line">
            {open.map((t) => {
              const due = t.due_at ? dayKey(t.due_at, timezone) : null, late = !!due && due < today, isToday = due === today;
              return (
                <li key={t.id} className="flex items-start gap-3 py-3.5">
                  <button type="button" onClick={() => toggle(t)} disabled={pending} aria-label={`Marquer « ${t.title} » comme faite`}
                    className="group mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-mk-input bg-surface transition hover:border-accent disabled:opacity-60">
                    {busy === t.id ? <Loader2 className="size-3.5 animate-spin text-mk-sub" /> : <Check className="size-3.5 text-transparent transition group-hover:text-accent-2" strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-medium leading-snug text-mk-strong">{t.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-mk-sub">
                      <span className={cn("inline-flex items-center gap-1", late && "font-medium text-mk-danger", isToday && "font-medium text-mk-strong")}>
                        <CalendarClock className="size-3.5" strokeWidth={2} />{t.due_at ? `${late ? "En retard · " : isToday ? "Aujourd'hui · " : ""}${when.format(new Date(t.due_at))}` : "Sans échéance"}
                      </span>
                      <span aria-hidden>·</span><span>{who(t.assignee_id) ?? "Non attribuée"}</span>
                    </p>
                    {t.note ? <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-mk-text">{t.note}</p> : null}
                  </div>
                  <span className={cn(CHIP, "mt-0.5 shrink-0 bg-mk-chip text-mk-text")}>{TASK_KIND[t.kind] ?? "Tâche"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {closed.length ? (
        <section className="space-y-1">
          <TabHeading title="Terminées" count={closed.length} />
          <ul className="divide-y divide-mk-line">
            {closed.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-3">
                <button type="button" onClick={() => toggle(t)} disabled={pending} aria-label={`Rouvrir « ${t.title} »`} title="Rouvrir la tâche"
                  className={cn("group mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60", t.status === "faite" ? "bg-accent text-accent-fg" : "bg-mk-strip text-mk-sub")}>
                  {busy === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <><Check className="size-3.5 group-hover:hidden" strokeWidth={3} /><RotateCcw className="hidden size-3.5 group-hover:block" strokeWidth={2.4} /></>}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[15px] text-mk-sub line-through">{t.title}</p>
                  <p className="mt-0.5 text-[13px] text-mk-sub">{t.status === "faite" ? ["Faite", t.done_at ? `le ${when.format(new Date(t.done_at))}` : null, who(t.done_by) ? `par ${who(t.done_by)}` : null].filter(Boolean).join(" ") : "Annulée"}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Remarques ─────────────────────────── */

/** Remarques : saisie en haut, puis la note de la fiche (si elle existe) et les remarques, les plus récentes en premier. */
export function NotesTab({ prospectId, notes, sheetNote, names, timezone }: { prospectId: string; notes: ProspectEvent[]; sheetNote: string | null; names: Record<string, string>; timezone: string }) {
  const { exec, pending } = useAction();
  const [text, setText] = React.useState("");
  const add = () => exec(() => addNoteAction(prospectId, text), { success: "Remarque ajoutée.", onSuccess: () => setText("") });
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-mk-input bg-surface transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <label htmlFor="nouvelle-remarque" className="sr-only">Nouvelle remarque</label>
        <textarea id="nouvelle-remarque" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} placeholder="Écris une remarque…"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !pending) { e.preventDefault(); add(); } }}
          className="block w-full resize-none bg-transparent px-3.5 py-3 text-[16px] text-mk-strong outline-none placeholder:text-mk-sub lg:text-[14px]" />
        <div className="flex items-center justify-end border-t border-mk-line px-3 py-2">
          <button type="button" className={cn(BTN_PRIMARY, "h-9")} disabled={pending || !text.trim()} onClick={add}>{pending ? <Loader2 className="animate-spin" /> : null}Ajouter</button>
        </div>
      </div>
      {sheetNote ? <SheetNote prospectId={prospectId} value={sheetNote} /> : null}
      {notes.length === 0 ? (sheetNote ? null : <MkEmpty>Aucune remarque pour l&apos;instant.</MkEmpty>) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const author = n.created_by ? names[n.created_by] ?? "Un membre" : "Le système";
            const data = (n.data ?? {}) as Record<string, unknown>;
            return (
              <li key={n.id} className="rounded-xl border border-mk-line bg-surface p-4">
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-mk-strong">{String(data.texte ?? data.excerpt ?? "")}</p>
                <p className="mt-3 flex min-w-0 items-center gap-2 text-[13px] text-mk-sub"><Avatar name={author} size={24} /><span className="truncate">{author} · {formatDateTimeInZone(n.created_at, timezone)}</span></p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Le champ « notes » de la fiche, épinglé au-dessus des remarques, modifiable sur place. */
function SheetNote({ prospectId, value }: { prospectId: string; value: string }) {
  const { exec, pending } = useAction();
  const [draft, setDraft] = React.useState<string | null>(null);
  const save = () => exec(() => updateProspectAction(prospectId, { notes: draft ?? "" }), { success: "Note de la fiche enregistrée.", onSuccess: () => setDraft(null) });
  return (
    <div className="rounded-xl border border-mk-line bg-mk-chip p-4">
      <div className="mb-2 flex items-center gap-2">
        <Pin className="size-4 text-mk-icon" strokeWidth={1.8} />
        <span className="flex-1 text-[14px] font-semibold text-mk-strong">Note de la fiche</span>
        {draft === null ? <button type="button" onClick={() => setDraft(value)} className="inline-flex size-8 items-center justify-center rounded-full text-mk-icon transition hover:bg-surface hover:text-mk-strong" aria-label="Modifier la note de la fiche"><Pencil className="size-4" /></button> : null}
      </div>
      {draft === null ? <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-mk-text">{value}</p> : (
        <div className="space-y-2">
          <label htmlFor="note-fiche" className="sr-only">Note de la fiche</label>
          <textarea id="note-fiche" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} maxLength={4000} className={TEXTAREA} />
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setDraft(null)}>Annuler</button>
            <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={save}>{pending ? <Loader2 className="animate-spin" /> : null}Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Rendez-vous ─────────────────────────── */

const SOURCE: Record<string, string> = { iclosed: "iClosed", google: "Google Agenda", import: "Import" };
const STATUS_CHIP: Record<string, string> = { confirme: "bg-mk-success-soft text-mk-success", annule: "bg-mk-chip text-mk-sub", deplace: "bg-mk-warn-soft text-mk-warn" };

/** Rendez-vous du prospect : à venir (le plus proche en haut), puis passés. Prise de rendez-vous si la réservation est interne. */
export function AppointmentsTab({ prospectId, appointments, slots, slotMinutes, timezone, now, today, canBook, bookingUrl }: {
  prospectId: string; appointments: Appointment[]; slots: { start: string; end: string }[]; slotMinutes: number | null; timezone: string; now: string; today: string; canBook: boolean; bookingUrl: string | null;
}) {
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const nowMs = Date.parse(now);
  const upcoming = appointments.filter((a) => Date.parse(a.ends_at) >= nowMs).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = appointments.filter((a) => Date.parse(a.ends_at) < nowMs).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const external = safeUrl(bookingUrl);
  const action = canBook
    ? <button type="button" onClick={() => setOpen(true)} className={BTN_LINK}><Plus />Prendre un rendez-vous</button>
    : <Link href="/marketing/calendrier" className={BTN_LINK}><CalendarDays />Ouvrir le calendrier</Link>;
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <TabHeading title="À venir" count={upcoming.length} action={action} />
        {!canBook ? (
          <p className="text-[13px] text-mk-sub">
            Les rendez-vous se prennent dans ton outil de réservation et arrivent ici tout seuls.
            {external ? <> <a href={external} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-mk-link hover:underline">Ouvrir la page de réservation<ExternalLink className="size-3.5" /></a></> : null}
          </p>
        ) : null}
        {upcoming.length === 0 ? <MkEmpty>Aucun rendez-vous à venir.</MkEmpty> : (
          <ul className="divide-y divide-mk-line">{upcoming.map((a) => <AppointmentRow key={a.id} a={a} timezone={timezone} today={today} onCancel={canBook && a.status === "confirme" ? () => setCancelId(a.id) : undefined} />)}</ul>
        )}
      </section>
      {past.length ? (
        <section className="space-y-1">
          <TabHeading title="Passés" count={past.length} />
          <ul className="divide-y divide-mk-line">{past.map((a) => <AppointmentRow key={a.id} a={a} timezone={timezone} today={today} />)}</ul>
        </section>
      ) : null}

      {canBook ? <BookDialog open={open} onOpenChange={setOpen} prospectId={prospectId} slots={slots} slotMinutes={slotMinutes} timezone={timezone} /> : null}
      <ConfirmDialog open={!!cancelId} onOpenChange={(o) => { if (!o) setCancelId(null); }} loading={pending} danger title="Annuler ce rendez-vous ?" description="Les rappels programmés pour ce rendez-vous seront annulés."
        confirmLabel="Annuler le rendez-vous" onConfirm={() => { if (cancelId) void exec(() => cancelAppointment(cancelId), { success: "Rendez-vous annulé.", onSuccess: () => setCancelId(null) }); }} />
    </div>
  );
}

function AppointmentRow({ a, timezone, today, onCancel }: { a: Appointment; timezone: string; today: string; onCancel?: () => void }) {
  const start = new Date(a.starts_at), end = new Date(a.ends_at);
  const part = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, ...o }).format(d);
  const hour = (d: Date) => part({ hour: "2-digit", minute: "2-digit" }, d);
  const isToday = dayKey(a.starts_at, timezone) === today, cancelled = a.status === "annule";
  const source = a.source ? SOURCE[a.source] ?? (a.source === "interne" || a.source === "manuel" ? null : a.source) : null;
  const link = cancelled ? null : safeUrl(a.meeting_url);
  return (
    <li className="flex items-start gap-3.5 py-3.5">
      <span className={cn("flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5", isToday ? "bg-mk-today text-mk-today-fg" : "bg-mk-chip text-mk-strong")}>
        <span className="text-[11px] font-semibold uppercase leading-tight">{part({ month: "short" }, start).replace(".", "")}</span>
        <span className="text-[19px] font-semibold leading-tight tabular">{part({ day: "numeric" }, start)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("break-words text-[15px] font-medium leading-snug text-mk-strong", cancelled && "text-mk-sub line-through")}>{a.title || "Rendez-vous"}</p>
        <p className="mt-0.5 text-[13px] text-mk-sub first-letter:uppercase">{isToday ? "Aujourd'hui" : part({ weekday: "long" }, start)} · {hour(start)} – {hour(end)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={cn(CHIP, STATUS_CHIP[a.status] ?? "bg-mk-chip text-mk-text")}>{APPOINTMENT_STATUS[a.status] ?? a.status}</span>
          {a.result && a.result !== "a_venir" ? <span className={cn(CHIP, "bg-mk-chip text-mk-text")}>{CALL_RESULT[a.result]}</span> : null}
          {source ? <span className="text-[12px] text-mk-sub">{source}</span> : null}
          {link ? <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-mk-link hover:underline"><Video className="size-3.5" />Rejoindre</a> : null}
        </div>
      </div>
      {onCancel ? <button type="button" onClick={onCancel} aria-label="Annuler ce rendez-vous" title="Annuler ce rendez-vous" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-mk-sub transition hover:bg-mk-chip hover:text-mk-danger"><X className="size-[18px]" /></button> : null}
    </li>
  );
}

function BookDialog({ open, onOpenChange, prospectId, slots, slotMinutes, timezone }: { open: boolean; onOpenChange: (o: boolean) => void; prospectId: string; slots: { start: string; end: string }[]; slotMinutes: number | null; timezone: string }) {
  const { exec, pending } = useAction();
  const [choice, setChoice] = React.useState("");
  const [manual, setManual] = React.useState("");
  const [meeting, setMeeting] = React.useState("");
  const book = () => {
    let startIso = choice;
    if (!startIso && manual) { const d = new Date(manual); if (!Number.isNaN(d.getTime())) startIso = d.toISOString(); }
    if (!startIso) return;
    const endIso = new Date(Date.parse(startIso) + (slotMinutes ?? 30) * 60_000).toISOString();
    void exec(() => bookAppointment({ prospect_id: prospectId, starts_at: startIso, ends_at: endIso, meeting_url: meeting.trim() || null }), {
      success: "Rendez-vous confirmé.", onSuccess: () => { onOpenChange(false); setChoice(""); setManual(""); setMeeting(""); },
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Prendre un rendez-vous" description="Choisis un créneau proposé, ou saisis une date précise.">
        <div className="space-y-4">
          {slots.length ? (
            <div>
              <label htmlFor="rdv-creneau" className="mb-1.5 block text-[13px] font-medium text-mk-sub">Créneaux disponibles</label>
              <Select id="rdv-creneau" value={choice} onChange={(e) => { setChoice(e.target.value); setManual(""); }}>
                <option value="">Choisir un créneau</option>
                {slots.map((s) => <option key={s.start} value={s.start}>{formatSlot(s.start, timezone)}</option>)}
              </Select>
            </div>
          ) : <p className="rounded-lg bg-mk-chip px-3 py-2 text-[13px] text-mk-sub">Aucun créneau proposé : les disponibilités ne sont pas réglées. Saisis une date à la main.</p>}
          <div>
            <label htmlFor="rdv-manuel" className="mb-1.5 block text-[13px] font-medium text-mk-sub">Ou date et heure</label>
            <input id="rdv-manuel" type="datetime-local" value={manual} onChange={(e) => { setManual(e.target.value); setChoice(""); }} className={INPUT} />
          </div>
          <div>
            <label htmlFor="rdv-visio" className="mb-1.5 block text-[13px] font-medium text-mk-sub">Lien visio (facultatif)</label>
            <input id="rdv-visio" value={meeting} onChange={(e) => setMeeting(e.target.value)} placeholder="https://…" maxLength={400} className={INPUT} />
          </div>
        </div>
        <DialogFooter>
          <button type="button" className={BTN_SECONDARY} onClick={() => onOpenChange(false)}>Annuler</button>
          <button type="button" className={BTN_PRIMARY} disabled={pending || (!choice && !manual)} onClick={book}>{pending ? <Loader2 className="animate-spin" /> : null}Confirmer le rendez-vous</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
