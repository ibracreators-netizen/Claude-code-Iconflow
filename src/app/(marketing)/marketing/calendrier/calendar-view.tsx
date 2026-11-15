"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface CalItem {
  id: string; kind: "rdv" | "bloque"; title: string; subtitle: string;
  starts_at: string; ends_at: string; day: string; start: number; minutes: number; allDay: boolean;
  member: string | null; calendar: string; href: string | null; external: string | null;
}
interface Week { monday: string; days: string[]; prev: string; next: string; today: string }

const FIRST_HOUR = 7, LAST_HOUR = 21, PX_PER_MIN = 1;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
// Texte toujours en couleur de texte : la couleur du type est portée par le fond et le liseré, jamais seule (un libellé l'accompagne).
const TONE: Record<CalItem["kind"], string> = { rdv: "border-l-accent bg-accent-soft", bloque: "border-l-border-strong bg-surface-2" };
const KIND: Record<CalItem["kind"], string> = { rdv: "Rendez-vous", bloque: "Créneau bloqué" };

export function CalendarView({ items, members, view, week, timezone }: { items: CalItem[]; members: Array<{ id: string; name: string }>; view: "semaine" | "liste"; week: Week; timezone: string }) {
  const router = useRouter();
  const [member, setMember] = React.useState("");
  const [calendar, setCalendar] = React.useState("");
  const [kind, setKind] = React.useState<"" | CalItem["kind"]>("");
  const calendars = React.useMemo(() => [...new Set(items.map((i) => i.calendar))].sort((a, b) => a.localeCompare(b, "fr")), [items]);
  const shown = React.useMemo(() => items.filter((i) => (!member || i.member === member) && (!calendar || i.calendar === calendar) && (!kind || i.kind === kind)), [items, member, calendar, kind]);
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
  const go = (params: Record<string, string>) => router.push(`/marketing/calendrier?${new URLSearchParams(params).toString()}`);
  const dayLabel = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }), []);
  const range = `${dayLabel.format(new Date(`${week.days[0]}T12:00:00Z`))} au ${dayLabel.format(new Date(`${week.days[6]}T12:00:00Z`))}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl value={view} onChange={(v) => go(v === "liste" ? { vue: "liste" } : { semaine: week.monday })} options={[{ value: "semaine", label: "Semaine" }, { value: "liste", label: "Liste" }]} />
        {view === "semaine" ? (
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="Semaine précédente" onClick={() => go({ semaine: week.prev })}><ChevronLeft /></Button>
            <Button size="sm" variant="ghost" onClick={() => go({})}>Cette semaine</Button>
            <Button size="icon-sm" variant="ghost" aria-label="Semaine suivante" onClick={() => go({ semaine: week.next })}><ChevronRight /></Button>
            <span className="ml-1 text-[13px] text-fg-2">{range}</span>
          </div>
        ) : <span className="text-[13px] text-fg-2">Les 30 prochains jours</span>}
        <span className="ml-auto text-[12px] text-muted">Fuseau {timezone}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Filtrer par membre" value={member} onChange={(e) => setMember(e.target.value)} className="h-9 w-auto"><option value="">Toute l&apos;équipe</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
        <NativeSelect aria-label="Filtrer par agenda" value={calendar} onChange={(e) => setCalendar(e.target.value)} className="h-9 w-auto max-w-[240px]"><option value="">Tous les agendas</option>{calendars.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
        <NativeSelect aria-label="Filtrer par type" value={kind} onChange={(e) => setKind(e.target.value as "" | CalItem["kind"])} className="h-9 w-auto"><option value="">Tous les types</option><option value="rdv">Rendez-vous</option><option value="bloque">Créneaux bloqués</option></NativeSelect>
        <span className="ml-auto flex items-center gap-3 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-l-2 border-l-accent bg-accent-soft" />Rendez-vous</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-l-2 border-l-border-strong bg-surface-2" />Créneau bloqué</span>
          <span className="tabular">{shown.length} élément{shown.length > 1 ? "s" : ""}</span>
        </span>
      </div>
      {view === "liste" ? <ListView items={shown} name={name} /> : <WeekView items={shown} week={week} name={name} />}
    </div>
  );
}

function ItemBody({ i, name, compact }: { i: CalItem; name: (id: string | null) => string | null; compact?: boolean }) {
  const time = i.allDay ? "Journée entière" : `${hhmm(i.start)} – ${hhmm((i.start + i.minutes) % 1440)}`;
  // Créneau court dans la grille : une seule ligne, l'heure puis le nom.
  if (compact && i.minutes < 45) return <span className="block truncate text-[11.5px] leading-tight text-fg"><span className="tabular text-fg-2">{hhmm(i.start)}</span> <span className="font-medium">{i.title}</span></span>;
  return (
    <>
      <span className={cn("block truncate font-medium text-fg", compact ? "text-[11.5px] leading-tight" : "text-[13.5px]")}>{i.title}</span>
      <span className={cn("block truncate text-fg-2", compact ? "text-[10.5px] leading-tight" : "text-[12.5px]")}>{compact ? time : [time, KIND[i.kind], name(i.member), i.subtitle].filter(Boolean).join(" · ")}</span>
      {compact && i.minutes >= 50 ? <span className="block truncate text-[10.5px] leading-tight text-muted">{[name(i.member), i.subtitle].filter(Boolean).join(" · ")}</span> : null}
    </>
  );
}

function ListView({ items, name }: { items: CalItem[]; name: (id: string | null) => string | null }) {
  const long = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }), []);
  if (!items.length) return <div className="card px-4 py-10 text-center text-[13.5px] text-muted">Rien de prévu sur cette période avec ces filtres.</div>;
  const days = [...new Set(items.map((i) => i.day))];
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <section key={d} className="card overflow-hidden">
          <h3 className="border-b border-border bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold first-letter:uppercase">{long.format(new Date(`${d}T12:00:00Z`))}</h3>
          <ul className="divide-y divide-border">
            {items.filter((i) => i.day === d).map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn("h-9 w-1 shrink-0 rounded-full", i.kind === "rdv" ? "bg-accent" : "bg-border-strong")} aria-hidden />
                <div className="min-w-0 flex-1">{i.href ? <Link href={i.href} className="block hover:underline"><ItemBody i={i} name={name} /></Link> : <ItemBody i={i} name={name} />}</div>
                {i.external ? <a href={i.external} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted hover:text-fg"><ExternalLink className="size-3.5" />Ouvrir dans Google</a> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Répartit en colonnes les éléments qui se chevauchent dans une même journée. */
function layout(day: CalItem[]): Array<{ i: CalItem; col: number; cols: number }> {
  const sorted = [...day].sort((a, b) => a.start - b.start || b.minutes - a.minutes);
  const out: Array<{ i: CalItem; col: number; cols: number; end: number }> = [];
  let group: typeof out = [], groupEnd = -1;
  const close = () => { const cols = Math.max(1, ...group.map((g) => g.col + 1)); group.forEach((g) => (g.cols = cols)); group = []; };
  for (const i of sorted) {
    if (i.start >= groupEnd && group.length) close();
    const used = new Set(group.filter((g) => g.end > i.start).map((g) => g.col));
    let col = 0; while (used.has(col)) col++;
    const entry = { i, col, cols: 1, end: i.start + i.minutes };
    group.push(entry); out.push(entry); groupEnd = Math.max(groupEnd, entry.end);
  }
  if (group.length) close();
  return out;
}

function WeekView({ items, week, name }: { items: CalItem[]; week: Week; name: (id: string | null) => string | null }) {
  const head = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }), []);
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, k) => FIRST_HOUR + k);
  const height = (LAST_HOUR - FIRST_HOUR + 1) * 60 * PX_PER_MIN;
  const early = items.filter((i) => !i.allDay && (i.start < FIRST_HOUR * 60 || i.start >= (LAST_HOUR + 1) * 60)).length;
  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-border">
          <div />
          {week.days.map((d) => {
            const allDay = items.filter((i) => i.day === d && i.allDay);
            return (
              <div key={d} className={cn("border-l border-border px-2 py-2", d === week.today && "bg-accent-soft/40")}>
                <div className={cn("text-[12px] font-semibold first-letter:uppercase", d === week.today ? "text-accent-2" : "text-fg-2")}>{head.format(new Date(`${d}T12:00:00Z`))}{d === week.today ? " · aujourd'hui" : ""}</div>
                {allDay.map((i) => <div key={i.id} className={cn("mt-1 truncate rounded border-l-2 px-1.5 py-0.5 text-[11px] text-fg", TONE[i.kind])} title={`${i.title} · journée entière`}>{i.title}</div>)}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height }}>
            {hours.map((h) => <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] text-muted tabular" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MIN }}>{h === FIRST_HOUR ? "" : `${String(h).padStart(2, "0")}:00`}</span>)}
          </div>
          {week.days.map((d) => (
            <div key={d} className={cn("relative border-l border-border", d === week.today && "bg-accent-soft/20")} style={{ height }}>
              {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MIN }} aria-hidden />)}
              {layout(items.filter((i) => i.day === d && !i.allDay && i.start >= FIRST_HOUR * 60 && i.start < (LAST_HOUR + 1) * 60)).map(({ i, col, cols }) => {
                const top = (i.start - FIRST_HOUR * 60) * PX_PER_MIN, h = Math.max(22, Math.min(i.minutes, (LAST_HOUR + 1) * 60 - i.start) * PX_PER_MIN - 2);
                const style: React.CSSProperties = { top, height: h, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` };
                const cls = cn("absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 transition hover:z-10 hover:shadow-pop", TONE[i.kind]);
                const label = `${i.title} · ${hhmm(i.start)} · ${KIND[i.kind]}${name(i.member) ? ` · ${name(i.member)}` : ""}`;
                return i.href
                  ? <Link key={i.id} href={i.href} className={cls} style={style} title={label}><ItemBody i={i} name={name} compact /></Link>
                  : i.external ? <a key={i.id} href={i.external} target="_blank" rel="noopener noreferrer" className={cls} style={style} title={label}><ItemBody i={i} name={name} compact /></a>
                  : <div key={i.id} className={cls} style={style} title={label}><ItemBody i={i} name={name} compact /></div>;
              })}
            </div>
          ))}
        </div>
      </div>
      {early ? <p className="border-t border-border px-4 py-2 text-[12px] text-muted">{early} élément{early > 1 ? "s" : ""} avant {FIRST_HOUR} h ou après {LAST_HOUR + 1} h : à voir dans la vue Liste.</p> : null}
    </div>
  );
}
