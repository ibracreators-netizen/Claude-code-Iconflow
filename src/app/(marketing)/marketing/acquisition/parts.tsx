import Link from "next/link";
import { ChevronRight, ExternalLink, MessageSquare, MessagesSquare, Phone, PhoneIncoming, Repeat, Send, Video, type LucideIcon } from "lucide-react";
import type { Person, UpcomingCall } from "@/lib/marketing/dashboard-server";
import type { KpiField } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { Delta, PanelEmpty, ScrollHint, StatCard, TABLE, TD, TH, THEAD, TR } from "../_components/dash-ui";
import { PERSON_ROLE, type Change, type RankRow } from "./perf";

/*
 * Briques du Tableau de bord (pages serveur) : cartes des performances, classement, saisies manquantes,
 * appels à venir. Couleurs : uniquement des jetons de l'espace Marketing.
 */

const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
export const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);
const CHIP = "inline-flex h-5 shrink-0 items-center rounded-full bg-mk-chip px-2 text-[11.5px] font-medium text-mk-sub";

/** Écart avec la période d'avant, ou « Rien … » si elle était vide. */
export function ChangeLine({ change, suffix, nothingBefore }: { change: Change | null; suffix: string; nothingBefore: string }) {
  if (!change) return null;
  if (change.kind === "new") return <span className="text-mk-sub">{nothingBefore}</span>;
  return <Delta value={change.value} unit={change.kind === "pct" ? "%" : "pt"} suffix={suffix} />;
}

const ICONS: Record<string, LucideIcon> = { appels: Phone, decroches: PhoneIncoming, messages: MessageSquare, conversations: MessagesSquare, relances: Repeat, propositions: Send };
const GRID: Record<number, string> = { 6: "grid-cols-2 @min-[640px]:grid-cols-3", 4: "grid-cols-2 @min-[880px]:grid-cols-4", 2: "grid-cols-2" };

export interface CardFigure { field: KpiField; value: number; change: Change | null; rate?: { label: string; value: number | null; change: Change | null } }
/** Cartes chiffres des indicateurs déclarés : total de la période, écart avec la période d'avant, taux quand il y en a un. */
export function PerfCards({ cards, suffix, nothingBefore }: { cards: CardFigure[]; suffix: string; nothingBefore: string }) {
  return (
    <div className={cn("grid gap-3 lg:gap-4", GRID[cards.length] ?? "grid-cols-2 @min-[640px]:grid-cols-3")}>
      {cards.map((c) => (
        <StatCard key={c.field.key} label={c.field.label} value={fr(c.value)} icon={ICONS[c.field.key] ?? Phone} tone="accent"
          hint={<>
            {c.rate ? (
              <span className="block">
                <span className="text-mk-text">{c.rate.label}&nbsp;: <b className="whitespace-nowrap font-semibold text-mk-strong tabular-nums">{pct(c.rate.value)}</b></span>
                {c.rate.change && c.rate.change.kind === "pt" && c.rate.change.value !== 0 ? <span className={cn("ml-1.5 whitespace-nowrap tabular-nums", c.rate.change.value > 0 ? "text-mk-success" : "text-mk-danger")}>{c.rate.change.value > 0 ? "+" : "−"}{String(Math.abs(c.rate.change.value)).replace(".", ",")} pt</span> : null}
              </span>
            ) : null}
            <span className={cn("block", c.rate && "mt-1")}><ChangeLine change={c.change} suffix={suffix} nothingBefore={nothingBefore} />{c.change ? null : <span>Rien à comparer {suffix.replace(/^vs /, "avec ")}</span>}</span>
          </>} />
      ))}
    </div>
  );
}

/** Nom d'une personne, avec son rôle et « par lien » si elle saisit par son lien personnel. */
export function PersonName({ person, me }: { person: Person; me?: boolean }) {
  const name = person.href ? <Link href={person.href} className="transition hover:text-accent-2 hover:underline">{person.name}</Link> : person.name;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 truncate font-medium text-mk-strong">{name}{me ? <span className="font-normal text-mk-sub"> (toi)</span> : null}</span>
      <span className={CHIP}>{PERSON_ROLE[person.role]}</span>
      {person.viaLink ? <span className={CHIP} title="Saisit avec son lien personnel, sans compte">par lien</span> : null}
    </span>
  );
}

/** Intitulés courts des colonnes (le libellé complet et la règle se lisent au survol). */
const SHORT: Record<string, string> = { appels: "Appels", decroches: "Décrochés", messages: "Messages", conversations: "Conversations", relances: "Relances", propositions: "Propositions" };

/** Classement par personne : jours saisis sur la période, totaux et taux. Membres et personnes « par lien » ensemble. */
export function RankingTable({ rows, fields, periodDays, me }: { rows: RankRow[]; fields: KpiField[]; periodDays: number; me: string }) {
  if (!rows.length) return <PanelEmpty className="border-t border-mk-line">Personne n&apos;a saisi ses chiffres sur la période.</PanelEmpty>;
  const cols: Array<{ key: string; label: string; rule: string; value: (r: RankRow) => string; strong?: boolean }> = [];
  for (const f of fields) {
    cols.push({ key: f.key, label: SHORT[f.key] ?? f.label, rule: `${f.label} : ${f.hint.charAt(0).toLowerCase()}${f.hint.slice(1)}`, value: (r) => (r.totals[f.key] ? fr(r.totals[f.key]) : "—"), strong: f.key === "appels" || f.key === "propositions" });
    if (f.key === "decroches") cols.push({ key: "pickup", label: "% décroché", rule: "Taux de décroché : appels décrochés ÷ appels passés", value: (r) => pct(r.pickup) });
    if (f.key === "conversations") cols.push({ key: "conversation", label: "% conversation", rule: "Taux de conversation : conversations ÷ appels décrochés", value: (r) => pct(r.conversation) });
  }
  return (
    <>
      <ScrollHint />
      <div className="overflow-x-auto">
        <table className={cn(TABLE, cols.length > 4 ? "min-w-[920px]" : "min-w-[560px]")}>
          <thead className={THEAD}>
            <tr>
              <th scope="col" className={cn(TH, "w-10")}>Rang</th>
              <th scope="col" className={TH}>Personne</th>
              <th scope="col" className={cn(TH, "text-right")} title="Jours où la personne a saisi ses chiffres, sur la période">Jours saisis</th>
              {cols.map((c) => <th key={c.key} scope="col" className={cn(TH, "text-right")}><span title={c.rule} className="cursor-help underline decoration-mk-input decoration-dotted underline-offset-4">{c.label}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.person.who} className={cn(TR, r.person.who === `m:${me}` && "bg-accent-soft/40 hover:bg-accent-soft/60")}>
                <td className={cn(TD, "text-mk-sub")}>{i + 1}</td>
                <th scope="row" className={cn(TD, "min-w-[220px] text-left font-normal")}><PersonName person={r.person} me={r.person.who === `m:${me}`} /></th>
                <td className={cn(TD, "whitespace-nowrap text-right")}>{r.days} <span className="text-mk-sub">sur {periodDays}</span></td>
                {cols.map((c) => <td key={c.key} className={cn(TD, "whitespace-nowrap text-right", c.strong && "font-semibold text-mk-strong")}>{c.value(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Qui n'a pas saisi aujourd'hui : nom, rôle, et dessous la dernière saisie connue. */
export function MissingList({ people, sinceOf }: { people: Person[]; sinceOf: (p: Person) => string }) {
  return (
    <ul className="-my-1">
      {people.map((p) => (
        <li key={p.who} className="border-b border-mk-line py-2.5 text-[14px] last:border-b-0">
          <PersonName person={p} />
          <span className="mt-0.5 block text-[13px] text-mk-sub">{sinceOf(p)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────── Appels à venir ─────────────────────────── */

const SOURCE_LABEL: Record<UpcomingCall["source"], string> = { app: "Rendez-vous de l'app", google: "Agenda Google" };

/** Une journée d'appels : en-tête du jour, puis une ligne par appel (heure, qui, membre, source, lien). */
export function CallDay({ label, calls, timeOf, showMember }: { label: string; calls: UpcomingCall[]; timeOf: (iso: string) => string; showMember: boolean }) {
  return (
    <section aria-label={label}>
      <h3 className="flex items-center justify-between gap-3 border-y border-mk-line bg-surface-2 px-4 py-2 text-[13px] font-semibold text-mk-strong lg:px-5">
        <span>{label}</span><span className="font-normal text-mk-sub tabular-nums">{calls.length} appel{calls.length > 1 ? "s" : ""}</span>
      </h3>
      <ul>
        {calls.map((c) => {
          const meta = [showMember && c.memberName ? c.memberName : null, c.detail].filter(Boolean).join(" · ");
          const body = (
            <>
              <span className="w-[52px] shrink-0 pt-0.5 text-[14px] font-semibold text-mk-strong tabular-nums lg:w-[110px]">
                {timeOf(c.startsAt)}<span className="hidden font-normal text-mk-sub lg:inline"> – {timeOf(c.endsAt)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-mk-strong">{c.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-mk-sub">
                  <span className={cn(CHIP, c.source === "google" ? "bg-mk-teal-soft text-mk-teal" : "")}>{SOURCE_LABEL[c.source]}</span>
                  {meta ? <span className="min-w-0 truncate">{meta}</span> : null}
                </span>
              </span>
            </>
          );
          const cls = "flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 pr-3 lg:pl-5 lg:pr-4";
          const end = c.href ? <ChevronRight className="mt-0.5 size-5 shrink-0 text-mk-icon" aria-hidden /> : c.external ? <ExternalLink className="mt-1 size-4 shrink-0 text-mk-icon" aria-hidden /> : null;
          return (
            <li key={c.id} className="flex items-stretch border-b border-mk-line last:border-b-0">
              {c.href ? <Link href={c.href} className={cn(cls, "transition hover:bg-surface-2")}>{body}{end}</Link>
                : c.external ? <a href={c.external} target="_blank" rel="noopener noreferrer" title="Ouvrir dans Google Agenda" className={cn(cls, "transition hover:bg-surface-2")}>{body}{end}</a>
                : <div className={cls}>{body}</div>}
              {c.joinUrl ? (
                <a href={c.joinUrl} target="_blank" rel="noopener noreferrer" aria-label={`Rejoindre l'appel avec ${c.title}`} title="Rejoindre l'appel"
                  className="flex w-12 shrink-0 items-center justify-center border-l border-mk-line text-accent-2 transition hover:bg-surface-2"><Video className="size-[18px]" strokeWidth={1.9} aria-hidden /></a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
