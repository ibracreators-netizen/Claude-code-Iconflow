"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, CalendarSync, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, ExternalLink, Grid2x2, List, Plus, RefreshCw, type LucideIcon, UserRound, Users } from "lucide-react";
import { MkFab, MkHeaderActions } from "@/components/marketing/chrome";
import { MkEmpty, MkInitials } from "@/components/marketing/ui";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { BookDialog, type Booked, type FreeSlot } from "./book-dialog";
import { addDays, addMonths, daysBetween, daysInMonth, fmt, hhmm, isWeekend, monthStart, sameMonth, spanLabel, weekday, type CalView } from "./dates";
import { GooglePanel, type GoogleProps } from "./google-panel";
import { Sheet, SheetOption } from "./sheet";

export type Tone = "ok" | "warn" | "bad" | "muted" | "info";
/** Un élément du calendrier : rendez-vous de l'app (« a-… ») ou événement d'un agenda Google (« g-… »). Heures en minutes, dans le fuseau des réglages. */
export interface CalItem {
  id: string; kind: "rdv" | "bloque"; title: string; subtitle: string; status: { label: string; tone: Tone } | null;
  day: string; start: number; minutes: number; allDay: boolean;
  /** Membres concernés (closer, setter, propriétaire de l'agenda) : sert au choix du membre. */
  members: string[]; href: string | null; external: string | null;
}
export interface CalMember { id: string; name: string }

interface Props {
  view: CalView; day: string; today: string; nowMinutes: number; first: string; last: string;
  items: CalItem[]; members: CalMember[]; me: CalMember; pickMember: boolean; member: string;
  timezone: string; canBook: boolean; slotMinutes: number | null; slots: FreeSlot[];
  google: GoogleProps; flash: { tone: "ok" | "warn"; text: string } | null;
}

const VIEWS: Array<{ key: CalView; label: string; short: string; icon: LucideIcon }> = [
  { key: "mois", label: "Vue mensuelle", short: "Mois", icon: Grid2x2 },
  { key: "semaine", label: "Vue hebdomadaire", short: "Semaine", icon: CalendarRange },
  { key: "liste", label: "Liste", short: "Liste", icon: List },
];
const WD = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const PILL: Record<Tone, string> = {
  ok: "bg-mk-success-soft text-mk-success",
  warn: "bg-mk-warn-soft text-mk-warn",
  bad: "bg-[color-mix(in_oklab,var(--mk-danger)_14%,transparent)] text-mk-danger",
  muted: "bg-mk-chip text-mk-sub",
  info: "bg-[color-mix(in_oklab,var(--mk-link)_14%,transparent)] text-mk-link",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LONG: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
const timeOf = (i: CalItem) => (i.allDay ? "Toute la journée" : `${hhmm(i.start)} – ${hhmm(i.start + i.minutes)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/* Boutons de la barre d'outils (ordinateur), au style LeadConnector. */
const BTN = "inline-flex h-9 items-center gap-2 rounded-[8px] border border-mk-input bg-surface px-3.5 text-[14px] font-medium text-mk-strong shadow-soft transition hover:bg-bg";
const ICON_BTN = "inline-flex size-9 items-center justify-center rounded-[8px] border border-mk-input bg-surface text-mk-icon shadow-soft transition hover:bg-bg hover:text-mk-strong";

/**
 * Calendrier Marketing au style LeadConnector.
 * Téléphone : vue mensuelle (ou hebdomadaire, ou liste), membre affiché, agenda du jour choisi, bouton + pour réserver.
 * Ordinateur : barre d'outils, grande grille du mois (ou semaine en heures, ou liste), et à droite l'agenda du jour et Google.
 * Le jour choisi et le membre restent dans l'adresse ; changer de mois recharge les données côté serveur.
 */
export function CalendarView(p: Props) {
  const router = useRouter();
  const [navPending, startNav] = React.useTransition();
  const [refreshing, startRefresh] = React.useTransition();
  const [selected, setSelected] = React.useState(p.day);
  const [member, setMember] = React.useState(p.member);
  const [sheet, setSheet] = React.useState<null | "vue" | "membre" | "google">(null);
  const [book, setBook] = React.useState({ open: false, n: 0 });

  const shown = React.useMemo(() => (member ? p.items.filter((i) => i.members.includes(member)) : p.items), [p.items, member]);
  const byDay = React.useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const i of shown) { const l = m.get(i.day); if (l) l.push(i); else m.set(i.day, [i]); }
    for (const l of m.values()) l.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title, "fr"));
    return m;
  }, [shown]);
  const dayItems = byDay.get(selected) ?? [];

  const urlFor = (o: { vue?: CalView; jour?: string; membre?: string }) => {
    const q = new URLSearchParams();
    const v = o.vue ?? p.view, j = o.jour ?? selected, m = o.membre ?? member;
    if (v !== "mois") q.set("vue", v);
    if (j !== p.today) q.set("jour", j);
    if (m) q.set("membre", m);
    const s = q.toString();
    return `/marketing/calendrier${s ? `?${s}` : ""}`;
  };
  const go = (o: { vue?: CalView; jour?: string; membre?: string }) => startNav(() => router.push(urlFor(o), { scroll: false }));
  const remember = (o: { jour?: string; membre?: string }) => window.history.replaceState(null, "", urlFor(o));
  // Un jour déjà chargé s'affiche tout de suite ; sinon (autre mois, autre semaine) la page relit les données.
  const loaded = (d: string) => p.view !== "liste" && d >= p.first && d <= p.last && (p.view !== "mois" || sameMonth(d, p.day));
  const select = (d: string) => { if (loaded(d)) { setSelected(d); remember({ jour: d }); } else go({ jour: d }); };
  const goToday = () => { if (loaded(p.today)) select(p.today); else if (!(p.view === "liste" && p.first === p.today)) go({ jour: p.today }); };
  const shift = (dir: -1 | 1) => {
    if (p.view === "mois") { const target = addMonths(p.day, dir); go({ jour: sameMonth(target, p.today) ? p.today : target }); }
    else if (p.view === "semaine") go({ jour: addDays(selected, 7 * dir) });
    else go({ jour: addDays(p.first, 30 * dir) });
  };
  const changeView = (v: CalView) => { setSheet(null); if (v !== p.view) go({ vue: v }); };
  const pick = (m: string) => { setSheet(null); setMember(m); remember({ membre: m }); };
  const openBook = () => setBook((b) => ({ open: true, n: b.n + 1 }));
  const onBooked = (r: Booked) => {
    const m = member && !r.members.includes(member) ? "" : member;   // sinon le nouveau rendez-vous serait masqué par le filtre
    if (m !== member) setMember(m);
    if (loaded(r.day)) { setSelected(r.day); remember({ jour: r.day, membre: m }); }
    else if (!(p.view === "liste" && r.day >= p.first && r.day <= p.last)) go({ jour: r.day, membre: m });
  };

  // Retour de Google (?google=…) : le message reste affiché, l'adresse redevient propre ; sur téléphone, la feuille Google s'ouvre.
  const hasFlash = !!p.flash;
  React.useEffect(() => {
    if (!hasFlash) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.pathname + url.search);
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    const t = window.setTimeout(() => setSheet("google"), 0);
    return () => window.clearTimeout(t);
  }, [hasFlash]);

  const memberName = member ? p.members.find((m) => m.id === member)?.name ?? "Membre" : p.pickMember ? "Toute l'équipe" : p.me.name;
  const current = VIEWS.find((v) => v.key === p.view) ?? VIEWS[0];
  const title = p.view === "mois" ? cap(fmt(p.day, { month: "long", year: "numeric" })) : spanLabel(p.first, p.last);
  const busy = cn("transition-opacity duration-150", navPending && "pointer-events-none opacity-55");

  const chip = (
    <span className="inline-flex h-[34px] min-w-0 items-center gap-1.5 rounded-lg bg-mk-chip px-2.5 text-[14px] font-semibold text-mk-strong">
      {member || !p.pickMember ? <UserRound className="size-4 shrink-0 text-accent-2" strokeWidth={2} /> : <Users className="size-4 shrink-0 text-accent-2" strokeWidth={2} />}
      <span className="truncate">{memberName}</span>
    </span>
  );

  return (
    <>
      <h1 className="sr-only">Calendrier</h1>
      <MkHeaderActions>
        <button type="button" onClick={() => startRefresh(() => router.refresh())} aria-label="Actualiser" className="inline-flex size-11 items-center justify-center rounded-full text-mk-text transition hover:bg-mk-chip">
          <RefreshCw className={cn("size-[22px]", refreshing && "animate-spin")} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={() => setSheet("google")} aria-label="Agenda Google" className="inline-flex size-11 items-center justify-center rounded-full text-mk-text transition hover:bg-mk-chip">
          <CalendarSync className="size-[22px]" strokeWidth={1.8} />
        </button>
      </MkHeaderActions>

      {p.flash ? <p role="status" className={cn("mb-3 rounded-[10px] border px-3 py-2.5 text-[14px] lg:mb-4", p.flash.tone === "ok" ? "border-mk-success/30 bg-mk-success-soft text-mk-success" : "border-mk-warn/30 bg-mk-warn-soft text-mk-warn")}>{p.flash.text}</p> : null}

      {/* ─────────────── Téléphone ─────────────── */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setSheet("vue")} aria-label={`Affichage : ${current.label}. Changer`} className="-ml-1 inline-flex h-11 min-w-0 items-center gap-1 rounded-lg px-1 text-[18px] font-semibold text-mk-text transition active:bg-mk-chip">
            <current.icon className="mr-1 size-[22px] shrink-0 text-mk-icon" strokeWidth={1.7} /><span className="truncate">{current.label}</span><ChevronDown className="size-[18px] shrink-0 text-mk-icon" strokeWidth={2} />
          </button>
          <button type="button" onClick={goToday} className="inline-flex h-10 shrink-0 items-center rounded-full bg-mk-today px-3.5 text-[17px] font-semibold text-mk-today-fg transition active:scale-[0.97]">Aujourd&apos;hui</button>
        </div>
        {p.pickMember ? (
          <button type="button" onClick={() => setSheet("membre")} aria-label={`Membre affiché : ${memberName}. Changer`} className="mt-3 flex min-h-[52px] w-full items-center gap-2 rounded-xl border border-mk-input p-2 text-left shadow-[inset_0_1px_2px_rgb(16_24_40/0.05)] transition active:bg-mk-chip/60">
            {chip}<ChevronDown className="ml-auto mr-1 size-5 shrink-0 text-mk-icon" strokeWidth={2} />
          </button>
        ) : <div className="mt-3 flex min-h-[52px] items-center rounded-xl border border-mk-input p-2 shadow-[inset_0_1px_2px_rgb(16_24_40/0.05)]">{chip}</div>}

        <div className={busy} aria-busy={navPending}>
          {p.view === "mois" ? <PhoneMonth month={p.day} selected={selected} today={p.today} byDay={byDay} onSelect={select} onShift={shift} />
            : p.view === "semaine" ? <PhoneWeek first={p.first} selected={selected} today={p.today} byDay={byDay} onSelect={select} onShift={shift} />
            : <PhoneList first={p.first} last={p.last} today={p.today} byDay={byDay} />}
          {p.view !== "liste" ? (
            <section aria-label={`Agenda du ${fmt(selected, LONG)}`} className="-mx-4 mt-2 border-t border-mk-line px-4 pt-4">
              <h2 className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-[19px] font-semibold text-accent-fg">{fmt(selected, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</h2>
              <div className="mt-3 space-y-2">{dayItems.length ? dayItems.map((i) => <AgendaRow key={i.id} i={i} />) : <MkEmpty icon={Clock}>Rien de planifié.</MkEmpty>}</div>
            </section>
          ) : null}
        </div>
      </div>

      {/* ─────────────── Ordinateur ─────────────── */}
      <div className="hidden lg:block">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={goToday} className={BTN}>Aujourd&apos;hui</button>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => shift(-1)} aria-label={p.view === "mois" ? "Mois précédent" : p.view === "semaine" ? "Semaine précédente" : "Période précédente"} className={ICON_BTN}><ChevronLeft className="size-[18px]" /></button>
            <button type="button" onClick={() => shift(1)} aria-label={p.view === "mois" ? "Mois suivant" : p.view === "semaine" ? "Semaine suivante" : "Période suivante"} className={ICON_BTN}><ChevronRight className="size-[18px]" /></button>
          </div>
          <h2 className="text-[20px] font-semibold text-mk-strong" aria-live="polite">{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            <div role="radiogroup" aria-label="Affichage" className="inline-flex h-9 items-center gap-0.5 rounded-[8px] border border-mk-input bg-surface p-[3px] shadow-soft">
              {VIEWS.map((v) => (
                <button key={v.key} type="button" role="radio" aria-checked={p.view === v.key} onClick={() => changeView(v.key)}
                  className={cn("inline-flex h-full items-center rounded-[6px] px-3 text-[14px] font-medium transition", p.view === v.key ? "bg-accent-soft text-accent-2" : "text-mk-text hover:bg-bg hover:text-mk-strong")}>{v.short}</button>
              ))}
            </div>
            {p.pickMember ? (
              <Dropdown>
                <DropdownTrigger asChild>
                  <button type="button" className={cn(BTN, "max-w-[240px]")} aria-label={`Membre affiché : ${memberName}`}>
                    {member ? <UserRound className="size-4 shrink-0 text-mk-icon" /> : <Users className="size-4 shrink-0 text-mk-icon" />}<span className="truncate">{memberName}</span><ChevronDown className="size-4 shrink-0 text-mk-icon" />
                  </button>
                </DropdownTrigger>
                <DropdownContent align="end" className="max-h-80 w-64 overflow-y-auto">
                  <DropdownLabel>Afficher l&apos;agenda de</DropdownLabel>
                  <DropdownItem onSelect={() => pick("")} className="text-[14px]"><Users />Toute l&apos;équipe{!member ? <Check className="ml-auto !text-accent-2" /> : null}</DropdownItem>
                  <DropdownSeparator />
                  {p.members.map((m) => (
                    <DropdownItem key={m.id} onSelect={() => pick(m.id)} className="text-[14px]"><UserRound /><span className="truncate">{m.name}{m.id === p.me.id ? " (moi)" : ""}</span>{member === m.id ? <Check className="ml-auto !text-accent-2" /> : null}</DropdownItem>
                  ))}
                </DropdownContent>
              </Dropdown>
            ) : <span className={cn(BTN, "cursor-default hover:bg-surface")}><UserRound className="size-4 text-mk-icon" />{p.me.name}</span>}
            {p.canBook ? <button type="button" onClick={openBook} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-accent px-4 text-[14px] font-medium text-accent-fg shadow-soft transition hover:brightness-110"><Plus className="size-4" strokeWidth={2.2} />Nouveau rendez-vous</button> : null}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-6">
          <div className={cn("min-w-0 flex-1", busy)} aria-busy={navPending}>
            {p.view === "mois" ? <DeskMonth month={p.day} first={p.first} last={p.last} selected={selected} today={p.today} byDay={byDay} onSelect={select} />
              : p.view === "semaine" ? <DeskWeek first={p.first} selected={selected} today={p.today} byDay={byDay} onSelect={select} />
              : <DeskList first={p.first} last={p.last} today={p.today} byDay={byDay} />}
          </div>
          <aside className="w-[320px] shrink-0 space-y-4 xl:w-[340px]" aria-label="Jour choisi et agenda Google">
            <section className="overflow-hidden rounded-xl border border-mk-line bg-surface shadow-soft">
              <div className="flex items-center gap-2 border-b border-mk-line px-4 py-3">
                <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-mk-strong">{cap(fmt(selected, LONG))}</h2>
                {selected === p.today ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent-2">Aujourd&apos;hui</span> : null}
                <span className="shrink-0 text-[13px] text-mk-sub tabular">{plural(dayItems.length, "élément")}</span>
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">{dayItems.length ? dayItems.map((i) => <AgendaRow key={i.id} i={i} dense />) : <MkEmpty icon={Clock} className="py-4 [&>span:last-child]:text-[14px]">Rien de planifié.</MkEmpty>}</div>
              {p.canBook ? <div className="border-t border-mk-line p-2"><button type="button" onClick={openBook} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] text-[14px] font-medium text-accent-2 transition hover:bg-accent-soft"><Plus className="size-4" />Ajouter un rendez-vous</button></div> : null}
            </section>
            <GooglePanel {...p.google} />
          </aside>
        </div>
      </div>

      {p.canBook ? <MkFab onClick={openBook} label="Nouveau rendez-vous" /> : null}
      {p.canBook ? <BookDialog key={book.n} open={book.open} onOpenChange={(o) => setBook((b) => ({ ...b, open: o }))} day={selected} today={p.today} nowMinutes={p.nowMinutes} timezone={p.timezone} slotMinutes={p.slotMinutes} slots={p.slots} onBooked={onBooked} /> : null}

      {/* Feuilles du téléphone */}
      <Sheet open={sheet === "vue"} onOpenChange={(o) => setSheet(o ? "vue" : null)} title="Affichage">
        <div role="radiogroup" aria-label="Affichage">
          {VIEWS.map((v) => <SheetOption key={v.key} selected={p.view === v.key} onSelect={() => changeView(v.key)} leading={<v.icon className="size-5 text-mk-icon" strokeWidth={1.8} />} label={v.label} />)}
        </div>
      </Sheet>
      {p.pickMember ? (
        <Sheet open={sheet === "membre"} onOpenChange={(o) => setSheet(o ? "membre" : null)} title="Afficher l'agenda de">
          <div role="radiogroup" aria-label="Membre affiché">
            <SheetOption selected={!member} onSelect={() => pick("")} leading={<span className="flex size-10 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><Users className="size-5" strokeWidth={1.8} /></span>} label="Toute l'équipe" meta={p.items.length} />
            {p.members.map((m) => <SheetOption key={m.id} selected={member === m.id} onSelect={() => pick(m.id)} leading={<MkInitials name={m.name.replace(/[()]/g, "")} size={40} />} label={`${m.name}${m.id === p.me.id ? " (moi)" : ""}`} meta={p.items.filter((i) => i.members.includes(m.id)).length} />)}
          </div>
        </Sheet>
      ) : null}
      <Sheet open={sheet === "google"} onOpenChange={(o) => setSheet(o ? "google" : null)} title="Agenda Google">
        <GooglePanel {...p.google} bare />
      </Sheet>
    </>
  );
}

/* ─────────────────────────── Éléments communs ─────────────────────────── */

function StatusPill({ s, className }: { s: { label: string; tone: Tone }; className?: string }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[12px] font-semibold", PILL[s.tone], className)}>{s.label}</span>;
}

/** Ligne d'agenda (LeadConnector) : filet de couleur à gauche, fond gris, heure, nom, statut. Mène à la fiche du prospect. */
function AgendaRow({ i, dense }: { i: CalItem; dense?: boolean }) {
  const inner = (
    <>
      <span className="flex items-center gap-2">
        <span className={cn("font-medium text-mk-sub tabular", dense ? "text-[13px]" : "text-[14px]")}>{timeOf(i)}</span>
        {i.status ? <StatusPill s={i.status} className="ml-auto" /> : null}
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate font-semibold text-mk-strong", dense ? "text-[14px]" : "text-[16px]")}>{i.title}</span>
        {i.external && !i.href ? <ExternalLink className="size-3.5 shrink-0 text-mk-sub" aria-label="(s'ouvre dans Google)" /> : null}
      </span>
      {i.subtitle ? <span className={cn("mt-0.5 block truncate text-mk-sub", dense ? "text-[13px]" : "text-[14px]")}>{i.subtitle}</span> : null}
    </>
  );
  const cls = cn("block rounded-r-xl border-l-4 bg-mk-agenda transition", dense ? "px-3 py-2.5" : "px-4 py-3", i.kind === "rdv" ? "border-accent" : "border-mk-input", (i.href || i.external) && "hover:bg-mk-chip active:bg-mk-chip");
  if (i.href) return <Link href={i.href} className={cls}>{inner}</Link>;
  if (i.external) return <a href={i.external} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
  return <div className={cls}>{inner}</div>;
}

/** Titre centré entre deux flèches (« ‹ novembre 2026 › »). */
function NavTitle({ title, onShift, prev, next }: { title: string; onShift: (d: -1 | 1) => void; prev: string; next: string }) {
  return (
    <div className="mx-auto grid max-w-[310px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
      <button type="button" onClick={() => onShift(-1)} aria-label={prev} className="inline-flex size-11 items-center justify-center rounded-full text-mk-icon transition active:bg-mk-chip"><ChevronLeft className="size-6" strokeWidth={1.8} /></button>
      <h2 className="truncate text-center text-[20px] font-semibold text-mk-strong" aria-live="polite">{title}</h2>
      <button type="button" onClick={() => onShift(1)} aria-label={next} className="inline-flex size-11 items-center justify-center rounded-full text-mk-icon transition active:bg-mk-chip"><ChevronRight className="size-6" strokeWidth={1.8} /></button>
    </div>
  );
}

const dayLabel = (d: string, n: number) => `${fmt(d, { weekday: "long", day: "numeric", month: "long" })}${n ? `, ${plural(n, "élément")}` : ", rien de planifié"}`;
const numberTone = (d: string, sel: boolean, today: string) => (sel ? "bg-accent text-accent-fg" : d === today ? "text-accent-2" : isWeekend(d) ? "text-mk-sub/80" : "text-mk-strong");

/* ─────────────────────────── Téléphone ─────────────────────────── */

type ByDay = Map<string, CalItem[]>;

function PhoneMonth({ month, selected, today, byDay, onSelect, onShift }: { month: string; selected: string; today: string; byDay: ByDay; onSelect: (d: string) => void; onShift: (d: -1 | 1) => void }) {
  const first = monthStart(month), lead = (weekday(first) + 6) % 7;
  const cells: Array<string | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth(month) }, (_, i) => addDays(first, i))];
  return (
    <section className="mt-4" aria-label="Mois">
      <NavTitle title={fmt(first, { month: "long", year: "numeric" })} onShift={onShift} prev="Mois précédent" next="Mois suivant" />
      <div className="-mx-4 mt-2 grid grid-cols-7 text-center text-[14px] font-medium text-mk-sub" aria-hidden>{WD.map((w) => <span key={w} className="py-1">{w}</span>)}</div>
      <div className="-mx-4 grid grid-cols-7">
        {cells.map((d, k) => {
          if (!d) return <span key={`v${k}`} className="h-[52px]" aria-hidden />;
          const n = byDay.get(d)?.length ?? 0, sel = d === selected;
          return (
            <button key={d} type="button" onClick={() => onSelect(d)} aria-pressed={sel} aria-current={d === today ? "date" : undefined} aria-label={dayLabel(d, n)} className="relative flex h-[52px] items-center justify-center">
              <span className={cn("flex h-9 w-[calc(100%-4px)] max-w-[54px] items-center justify-center rounded-full text-[17px] font-semibold tabular transition", numberTone(d, sel, today))}>{Number(d.slice(8))}</span>
              {n ? <span aria-hidden className="absolute left-[calc(50%+11px)] top-[calc(50%-17px)] size-[7px] rounded-full bg-accent ring-2 ring-surface" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PhoneWeek({ first, selected, today, byDay, onSelect, onShift }: { first: string; selected: string; today: string; byDay: ByDay; onSelect: (d: string) => void; onShift: (d: -1 | 1) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  return (
    <section className="mt-4" aria-label="Semaine">
      <NavTitle title={spanLabel(days[0], days[6])} onShift={onShift} prev="Semaine précédente" next="Semaine suivante" />
      <div className="-mx-4 mt-2 grid grid-cols-7 border-y border-mk-line">
        {days.map((d, k) => {
          const list = byDay.get(d) ?? [], sel = d === selected, more = list.length > 4 ? list.length - 3 : 0;
          return (
            <button key={d} type="button" onClick={() => onSelect(d)} aria-pressed={sel} aria-current={d === today ? "date" : undefined} aria-label={dayLabel(d, list.length)}
              className={cn("flex min-h-[132px] min-w-0 flex-col items-stretch gap-1 px-[3px] pb-2 pt-2 text-left transition", k > 0 && "border-l border-mk-line", sel && "bg-mk-agenda")}>
              <span className="text-center text-[13px] font-medium text-mk-sub">{WD[k]}</span>
              <span className={cn("mx-auto mb-1 flex h-8 w-[calc(100%-2px)] max-w-[44px] items-center justify-center rounded-full text-[16px] font-semibold tabular", numberTone(d, sel, today))}>{Number(d.slice(8))}</span>
              {(more ? list.slice(0, 3) : list).map((i) => (
                <span key={i.id} className={cn("block rounded-[6px] px-1 py-[3px]", i.kind === "rdv" ? "bg-accent-soft" : "bg-mk-chip")}>
                  <span className={cn("block text-[11px] font-semibold leading-tight tabular", i.kind === "rdv" ? "text-accent-2" : "text-mk-sub")}>{i.allDay ? "Jour" : hhmm(i.start)}</span>
                  <span className="block truncate text-[11px] leading-tight text-mk-text">{i.title.split(/\s+/)[0]}</span>
                </span>
              ))}
              {more ? <span className="text-center text-[12px] font-semibold text-accent-2">+{more}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PhoneList({ first, last, today, byDay }: { first: string; last: string; today: string; byDay: ByDay }) {
  const days = [...byDay.keys()].filter((d) => d >= first && d <= last).sort();
  return (
    <section className="mt-4" aria-label="À venir">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-semibold text-mk-strong">À venir</h2>
        <span className="text-[14px] text-mk-sub">{spanLabel(first, last)}</span>
      </div>
      {days.length === 0 ? <MkEmpty className="mt-3">Rien de planifié sur ces 30 jours.</MkEmpty> : days.map((d) => (
        <div key={d} className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-mk-strong">{cap(fmt(d, LONG))}{d === today ? <span className="rounded-full bg-mk-today px-2 py-0.5 text-[12px] font-semibold text-mk-today-fg">Aujourd&apos;hui</span> : null}</h3>
          <div className="space-y-2">{(byDay.get(d) ?? []).map((i) => <AgendaRow key={i.id} i={i} />)}</div>
        </div>
      ))}
    </section>
  );
}

/* ─────────────────────────── Ordinateur ─────────────────────────── */

/** Petite étiquette d'une case du mois : « • 10:00 Julie Martin ». */
function MonthChip({ i }: { i: CalItem }) {
  // Case étroite : le prénom seul ; case large (grand écran) : le nom complet.
  const firstName = i.title.split(/\s+/)[0];
  const body = (
    <>
      <span className={cn("shrink-0 font-semibold tabular", i.kind === "rdv" ? "text-accent-2" : "text-mk-sub")}>{i.allDay ? "Jour" : hhmm(i.start)}</span>
      <span className="min-w-0 truncate font-medium text-mk-strong">{firstName === i.title ? i.title : <><span className="@min-[150px]:hidden">{firstName}</span><span className="hidden @min-[150px]:inline">{i.title}</span></>}</span>
    </>
  );
  const cls = cn("flex h-[22px] w-full min-w-0 items-center gap-1 rounded-[6px] px-1.5 text-[12px] transition", i.kind === "rdv" ? "bg-accent-soft/70 hover:bg-accent-soft" : "bg-mk-chip hover:bg-mk-strip");
  const label = `${timeOf(i)} · ${i.title}${i.subtitle ? ` · ${i.subtitle}` : ""}${i.status ? ` · ${i.status.label}` : ""}`;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (i.href) return <Link href={i.href} onClick={stop} className={cls} title={label}>{body}</Link>;
  if (i.external) return <a href={i.external} onClick={stop} target="_blank" rel="noopener noreferrer" className={cls} title={label}>{body}</a>;
  return <span className={cls} title={label}>{body}</span>;
}

function DeskMonth({ month, first, last, selected, today, byDay, onSelect }: { month: string; first: string; last: string; selected: string; today: string; byDay: ByDay; onSelect: (d: string) => void }) {
  const n = daysBetween(first, last) + 1, days = Array.from({ length: n }, (_, i) => addDays(first, i));
  // Six semaines : des cases un peu moins hautes, pour que le mois tienne à l'écran.
  const cellH = n > 35 ? "min-h-[106px]" : "min-h-[124px]";
  return (
    <div className="overflow-hidden rounded-xl border border-mk-line bg-surface shadow-soft">
      <div className="grid grid-cols-7 border-b border-mk-line bg-bg">{WD.map((w) => <div key={w} className="px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-mk-sub">{w}.</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d, k) => {
          const list = byDay.get(d) ?? [], out = !sameMonth(d, month), sel = d === selected;
          const visible = list.length > 3 ? list.slice(0, 2) : list, more = list.length - visible.length;
          return (
            // La case entière choisit le jour à la souris ; le numéro est le bouton accessible au clavier.
            <div key={d} onClick={() => onSelect(d)} className={cn("@container min-w-0 cursor-pointer border-mk-line p-1.5 transition", cellH, k % 7 !== 6 && "border-r", k < n - 7 && "border-b",
              sel ? "bg-accent-soft/60" : out ? "bg-bg/70 hover:bg-mk-agenda" : "hover:bg-mk-agenda")}>
              <div className="flex items-center gap-1 pb-1">
                <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(d); }} aria-pressed={sel} aria-current={d === today ? "date" : undefined} aria-label={dayLabel(d, list.length)}
                  className={cn("inline-flex size-7 items-center justify-center rounded-full text-[13px] font-semibold tabular transition", d === today ? "bg-accent text-accent-fg" : sel ? "text-accent-2" : out ? "text-mk-sub/70 hover:bg-mk-chip" : "text-mk-strong hover:bg-mk-chip")}>{Number(d.slice(8))}</button>
                {d.endsWith("-01") ? <span className="text-[12px] font-medium text-mk-sub">{fmt(d, { month: "short" })}</span> : null}
              </div>
              <ul className="space-y-[3px]">
                {visible.map((i) => <li key={i.id}><MonthChip i={i} /></li>)}
                {more ? <li><button type="button" onClick={(e) => { e.stopPropagation(); onSelect(d); }} className="rounded-[6px] px-1.5 py-0.5 text-[12px] font-semibold text-accent-2 transition hover:bg-accent-soft">+{more} autres</button></li> : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FIRST_HOUR = 7, LAST_HOUR = 21, PX_PER_MIN = 0.8;
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
    const entry = { i, col, cols: 1, end: i.start + Math.max(i.minutes, 20) };
    group.push(entry); out.push(entry); groupEnd = Math.max(groupEnd, entry.end);
  }
  if (group.length) close();
  return out;
}

function DeskWeek({ first, selected, today, byDay, onSelect }: { first: string; selected: string; today: string; byDay: ByDay; onSelect: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, k) => FIRST_HOUR + k);
  const height = (LAST_HOUR - FIRST_HOUR + 1) * 60 * PX_PER_MIN;
  const outside = days.flatMap((d) => byDay.get(d) ?? []).filter((i) => !i.allDay && (i.start < FIRST_HOUR * 60 || i.start >= (LAST_HOUR + 1) * 60)).length;
  return (
    <div className="overflow-hidden rounded-xl border border-mk-line bg-surface shadow-soft">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-mk-line bg-bg">
            <div />
            {days.map((d, k) => {
              const allDay = (byDay.get(d) ?? []).filter((i) => i.allDay), sel = d === selected;
              return (
                <div key={d} className={cn("min-w-0 border-l border-mk-line px-1.5 pb-1.5 pt-2", sel && "bg-accent-soft/60")}>
                  <button type="button" onClick={() => onSelect(d)} aria-pressed={sel} aria-current={d === today ? "date" : undefined} aria-label={dayLabel(d, (byDay.get(d) ?? []).length)} className="flex w-full flex-col items-center gap-0.5 rounded-[8px] py-0.5 transition hover:bg-mk-chip">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-mk-sub">{WD[k]}.</span>
                    <span className={cn("inline-flex size-8 items-center justify-center rounded-full text-[18px] font-semibold tabular", d === today ? "bg-accent text-accent-fg" : sel ? "text-accent-2" : "text-mk-strong")}>{Number(d.slice(8))}</span>
                  </button>
                  {allDay.map((i) => <div key={i.id} className={cn("mt-1 truncate rounded-[6px] border-l-[3px] px-1.5 py-0.5 text-[11.5px] font-medium text-mk-strong", i.kind === "rdv" ? "border-accent bg-accent-soft" : "border-mk-input bg-mk-chip")} title={`${i.title} · journée entière`}>{i.title}</div>)}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
            <div className="relative" style={{ height }}>
              {hours.map((h) => <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-mk-sub tabular" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MIN }}>{h === FIRST_HOUR ? "" : `${String(h).padStart(2, "0")}:00`}</span>)}
            </div>
            {days.map((d) => (
              <div key={d} className={cn("relative border-l border-mk-line", d === selected && "bg-accent-soft/25")} style={{ height }}>
                {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-mk-line/70" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MIN }} aria-hidden />)}
                {layout((byDay.get(d) ?? []).filter((i) => !i.allDay && i.start >= FIRST_HOUR * 60 && i.start < (LAST_HOUR + 1) * 60)).map(({ i, col, cols }) => {
                  const top = (i.start - FIRST_HOUR * 60) * PX_PER_MIN, h = Math.max(22, Math.min(i.minutes, (LAST_HOUR + 1) * 60 - i.start) * PX_PER_MIN - 2);
                  const style: React.CSSProperties = { top, height: h, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` };
                  const cls = cn("absolute overflow-hidden rounded-[6px] border-l-[3px] px-1.5 py-1 transition hover:z-10 hover:shadow-pop", i.kind === "rdv" ? "border-accent bg-accent-soft" : "border-mk-input bg-mk-chip");
                  const label = `${timeOf(i)} · ${i.title}${i.subtitle ? ` · ${i.subtitle}` : ""}${i.status ? ` · ${i.status.label}` : ""}`;
                  const body = (
                    <>
                      <span className="block truncate text-[12px] font-semibold leading-tight text-mk-strong">{i.title}</span>
                      {h >= 34 ? <span className="block truncate text-[11px] leading-tight text-mk-text tabular">{timeOf(i)}</span> : null}
                    </>
                  );
                  return i.href ? <Link key={i.id} href={i.href} className={cls} style={style} title={label}>{body}</Link>
                    : i.external ? <a key={i.id} href={i.external} target="_blank" rel="noopener noreferrer" className={cls} style={style} title={label}>{body}</a>
                    : <div key={i.id} className={cls} style={style} title={label}>{body}</div>;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {outside ? <p className="border-t border-mk-line px-4 py-2 text-[13px] text-mk-sub">{plural(outside, "élément")} avant {FIRST_HOUR} h ou après {LAST_HOUR + 1} h : à voir dans la vue Liste.</p> : null}
    </div>
  );
}

function DeskList({ first, last, today, byDay }: { first: string; last: string; today: string; byDay: ByDay }) {
  const days = [...byDay.keys()].filter((d) => d >= first && d <= last).sort();
  if (!days.length) return (
    <div className="rounded-xl border border-mk-line bg-surface px-6 py-16 text-center shadow-soft">
      <p className="text-[16px] font-semibold text-mk-strong">Rien de planifié</p>
      <p className="mt-1 text-[14px] text-mk-sub">Aucun rendez-vous du {fmt(first, { day: "numeric", month: "long" })} au {fmt(last, { day: "numeric", month: "long" })}.</p>
    </div>
  );
  return (
    <div className="overflow-hidden rounded-xl border border-mk-line bg-surface shadow-soft">
      {days.map((d, k) => {
        const list = byDay.get(d) ?? [];
        return (
          <section key={d} aria-label={fmt(d, LONG)} className={cn(k > 0 && "border-t border-mk-line")}>
            <h3 className="flex h-10 items-center gap-2 border-b border-mk-line bg-bg px-4 text-[13px] font-semibold text-mk-strong">
              {cap(fmt(d, LONG))}{d === today ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent-2">Aujourd&apos;hui</span> : null}
              <span className="ml-auto font-normal text-mk-sub">{plural(list.length, "élément")}</span>
            </h3>
            <ul>
              {list.map((i) => {
                const body = (
                  <>
                    <span className="text-[14px] font-medium text-mk-text tabular">{timeOf(i)}</span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2"><span className={cn("size-2 shrink-0 rounded-full", i.kind === "rdv" ? "bg-accent" : "bg-mk-sub")} aria-hidden /><span className="truncate text-[14px] font-semibold text-mk-strong">{i.title}</span>{i.external && !i.href ? <ExternalLink className="size-3.5 shrink-0 text-mk-sub" aria-label="(s'ouvre dans Google)" /> : null}</span>
                      {i.subtitle ? <span className="block truncate pl-4 text-[13px] text-mk-sub">{i.subtitle}</span> : null}
                    </span>
                    {i.status ? <StatusPill s={i.status} /> : <span />}
                  </>
                );
                const cls = "grid min-h-[60px] grid-cols-[132px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 transition hover:bg-mk-agenda";
                return (
                  <li key={i.id} className="border-b border-mk-line last:border-b-0">
                    {i.href ? <Link href={i.href} className={cls}>{body}</Link> : i.external ? <a href={i.external} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a> : <div className={cls}>{body}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
