"use client";
import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { MkFieldLabel, MkInitials } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { cn } from "@/lib/utils";
import { bookFromCalendarAction, searchBookingProspectsAction, type BookingHit } from "./actions";
import { fmt, hhmm } from "./dates";
import { Sheet } from "./sheet";

/** Créneau libre déjà traduit dans le fuseau des réglages. */
export interface FreeSlot { day: string; time: string; minutes: number }
export interface Booked { day: string; members: string[] }

const DURATIONS = [15, 30, 45, 60, 90];
const FIELD = "h-12 w-full rounded-[10px] border border-mk-input bg-surface px-3.5 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 lg:h-10 lg:rounded-[8px] lg:text-[14px]";

/**
 * « Nouveau rendez-vous » : choisir le prospect, puis le jour et l'heure (fuseau des réglages).
 * Feuille du bas sur téléphone, fenêtre centrée sur ordinateur. Rendu à neuf à chaque ouverture (`key` côté parent).
 */
export function BookDialog({ open, onOpenChange, day, today, nowMinutes, timezone, slotMinutes, slots, onBooked }: {
  open: boolean; onOpenChange: (o: boolean) => void; day: string; today: string; nowMinutes: number; timezone: string;
  slotMinutes: number | null; slots: FreeSlot[]; onBooked: (r: Booked) => void;
}) {
  const { exec, pending } = useAction();
  const [prospect, setProspect] = React.useState<BookingHit | null>(null);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<BookingHit[] | null>(null);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(day < today ? today : day);
  // Aujourd'hui : l'heure pleine qui suit ; un autre jour : 10:00.
  const [time, setTime] = React.useState(() => (date === today ? hhmm(Math.min(23 * 60, (Math.floor(nowMinutes / 60) + 1) * 60)) : "10:00"));
  const [minutes, setMinutes] = React.useState(slotMinutes && DURATIONS.includes(slotMinutes) ? slotMinutes : 30);
  const [visio, setVisio] = React.useState("");
  const free = slots.filter((s) => s.day === date);

  // Recherche des prospects (les plus récents sans texte), avec un court délai pendant la frappe.
  React.useEffect(() => {
    if (!open || prospect) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      const res = await searchBookingProspectsAction(q);
      if (!alive) return;
      setHits(res.ok ? res.data : []);
      setSearchError(res.ok ? null : res.error);
    }, q ? 250 : 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q, prospect, open]);

  const ok = !!prospect && !!date && /^\d{2}:\d{2}$/.test(time);
  const submit = () => {
    if (!prospect || !ok) return;
    void exec(() => bookFromCalendarAction({ prospect_id: prospect.id, day: date, time, minutes, meeting_url: visio.trim() || null }), {
      success: `Rendez-vous confirmé : ${fmt(date, { weekday: "short", day: "numeric", month: "short" })} à ${time}.`,
      onSuccess: (r) => { onOpenChange(false); onBooked(r); },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} dialog title="Nouveau rendez-vous" description={`Heures de ${timezone.replace(/^.*\//, "").replace(/_/g, " ")} (${timezone}).`}
      footer={<>
        <button type="button" onClick={() => onOpenChange(false)} className="hidden h-10 items-center rounded-[8px] border border-mk-input bg-surface px-4 text-[14px] font-medium text-mk-strong transition hover:bg-bg lg:inline-flex">Annuler</button>
        <button type="button" onClick={submit} disabled={!ok || pending} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] bg-accent text-[16px] font-semibold text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 lg:h-10 lg:flex-none lg:rounded-[8px] lg:px-4 lg:text-[14px] lg:font-medium">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}Confirmer le rendez-vous
        </button>
      </>}>
      <div className="space-y-5 px-3 pb-3 pt-1">
        <div>
          <MkFieldLabel required htmlFor="rdv-prospect">Prospect</MkFieldLabel>
          {prospect ? (
            <div className="flex items-center gap-3 rounded-[10px] border border-mk-input px-3 py-2.5 lg:rounded-[8px]">
              <MkInitials name={prospect.name} size={40} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-semibold text-mk-strong lg:text-[14px]">{prospect.name}</span>{prospect.sub ? <span className="block truncate text-[13px] text-mk-sub">{prospect.sub}</span> : null}</span>
              <button type="button" onClick={() => { setProspect(null); setHits(null); }} className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[14px] font-semibold text-accent-2 transition hover:bg-accent-soft">Changer</button>
            </div>
          ) : (
            <>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-mk-sub lg:size-4" strokeWidth={1.8} aria-hidden />
                <input id="rdv-prospect" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, email ou téléphone" autoComplete="off" className={cn(FIELD, "pl-11 lg:pl-9")} />
              </label>
              <ul aria-label="Prospects trouvés" className="mt-2 max-h-[248px] overflow-y-auto rounded-[10px] border border-mk-line lg:max-h-[220px] lg:rounded-[8px]">
                {hits === null ? <li className="flex items-center gap-2 px-3 py-3 text-[14px] text-mk-sub"><Loader2 className="size-4 animate-spin" />Recherche…</li>
                  : searchError ? <li className="px-3 py-3 text-[14px] text-mk-danger">{searchError}</li>
                  : hits.length === 0 ? <li className="px-3 py-3 text-[14px] text-mk-sub">{q.trim() ? "Aucun prospect ne correspond." : "Aucun prospect pour l'instant."}</li>
                  : hits.map((h) => (
                    <li key={h.id} className="border-b border-mk-line last:border-b-0">
                      <button type="button" onClick={() => setProspect(h)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-mk-chip/60 active:bg-mk-chip">
                        <MkInitials name={h.name} size={36} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-mk-strong lg:text-[14px]">{h.name}</span>{h.sub ? <span className="block truncate text-[13px] text-mk-sub">{h.sub}</span> : null}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><MkFieldLabel required htmlFor="rdv-jour">Jour</MkFieldLabel><input id="rdv-jour" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className={FIELD} /></div>
          <div><MkFieldLabel required htmlFor="rdv-heure">Heure</MkFieldLabel><input id="rdv-heure" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={FIELD} /></div>
        </div>
        {free.length ? (
          <div>
            <p className="mb-2 text-[14px] font-medium text-mk-text">Créneaux libres ce jour-là</p>
            <div className="flex flex-wrap gap-2">
              {free.map((s) => (
                <button key={s.time} type="button" aria-pressed={time === s.time} onClick={() => { setTime(s.time); setMinutes(s.minutes); }}
                  className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] font-medium tabular transition", time === s.time ? "border-accent bg-accent-soft text-accent-2" : "border-mk-input text-mk-strong hover:bg-mk-chip")}>{s.time}</button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <p id="rdv-duree" className="mb-1.5 text-[15px] font-medium text-mk-text">Durée</p>
          <div role="radiogroup" aria-labelledby="rdv-duree" className="flex flex-wrap gap-2">
            {[...new Set([...DURATIONS, minutes])].sort((a, b) => a - b).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}
                className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] font-medium tabular transition", minutes === m ? "border-accent bg-accent-soft text-accent-2" : "border-mk-input text-mk-strong hover:bg-mk-chip")}>{m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`}</button>
            ))}
          </div>
        </div>
        <div>
          <MkFieldLabel htmlFor="rdv-visio">Lien visio (facultatif)</MkFieldLabel>
          <input id="rdv-visio" type="url" inputMode="url" value={visio} onChange={(e) => setVisio(e.target.value)} placeholder="https://meet.google.com/…" maxLength={400} className={FIELD} />
        </div>
      </div>
    </Sheet>
  );
}
