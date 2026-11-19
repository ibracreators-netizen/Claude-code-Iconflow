"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight, CalendarClock, CalendarDays, Check, ChevronDown, ClipboardPen, Flag, ListTodo, Phone, PhoneCall, Plus, Repeat, Search, UserRound, Video, X,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/misc";
import { MkFab } from "@/components/marketing/chrome";
import { MkInitials, MkPrimaryButton, MkSearchField } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { closeTaskAction, updateProspectAction } from "@/lib/actions/marketing-crm";
import { addTaskAction, editTaskAction, searchTaskProspectsAction, type TaskProspectHit } from "@/lib/actions/marketing-tasks";
import { zonedTimeToUtc } from "@/lib/marketing/slots";
import { TASK_KIND, type MarketingRole, type TaskKind } from "@/lib/marketing/types";
import type { TodoItem } from "@/lib/marketing/todo-server";
import { cn } from "@/lib/utils";

export type TasksTab = "a-faire" | "toutes" | "terminees";
interface MemberOpt { id: string; name: string; role: string }
interface Props {
  tab: TasksTab; items: TodoItem[]; capped: boolean; me: string; who: string; today: string; tz: string; members: MemberOpt[];
  canPickMember: boolean; sales: boolean; role: MarketingRole | null; unassigned: number;
  filters: { responsable: string; type: string; q: string }; openNew: boolean; preset: { id: string; name: string } | null;
}

const TABS: Array<{ key: TasksTab; label: string }> = [{ key: "a-faire", label: "Éléments à faire" }, { key: "toutes", label: "Toutes les tâches" }, { key: "terminees", label: "Terminées" }];
const KINDS = Object.keys(TASK_KIND) as TaskKind[];
const KIND_ICON: Record<string, LucideIcon> = { a_appeler: PhoneCall, relance: Repeat, resultat: ClipboardPen, autre: ListTodo, action: Flag, rdv: CalendarClock };
const SECTIONS: Array<{ key: string; title: string; has: (day: string | null, today: string) => boolean }> = [
  { key: "retard", title: "En retard", has: (d, t) => !!d && d < t },
  { key: "jour", title: "Aujourd'hui", has: (d, t) => d === t },
  { key: "venir", title: "À venir", has: (d, t) => !!d && d > t },
  { key: "sans", title: "Sans date", has: (d) => !d },
];
/** Colonnes du tableau (ordinateur) : rond · tâche · prospect · échéance · responsable · actions. */
const GRID = "lg:grid lg:grid-cols-[40px_minmax(0,2fr)_minmax(0,1.2fr)_168px_minmax(0,1fr)_84px] lg:gap-4";
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const tabHref = (t: TasksTab, who: string, me: string) => (t !== "a-faire" ? `/marketing/taches?onglet=${t}` : who !== me ? `/marketing/taches?membre=${who}` : "/marketing/taches");

export function TasksView(p: Props) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<{ n: number; item: TodoItem | null } | null>(p.openNew ? { n: 0, item: null } : null);
  const [done, setDone] = React.useState<Set<string>>(() => new Set());
  const [q, setQ] = React.useState(p.filters.q);
  // Filtre « responsable » lu dans l'adresse : « moi », « aucun » ou un membre connu (sinon, tous).
  const [resp, setResp] = React.useState(() => {
    const r = p.filters.responsable;
    return p.sales || !r ? "" : r === p.me ? "moi" : r === "moi" || r === "aucun" || p.members.some((m) => m.id === r) ? r : "";
  });
  const [type, setType] = React.useState(KINDS.includes(p.filters.type as TaskKind) ? p.filters.type : "");
  const name = (id: string | null) => p.members.find((m) => m.id === id)?.name ?? null;
  const whoName = p.who !== p.me ? name(p.who) ?? "ce membre" : null;

  // ?nouveau=1 (lien de l'Accueil) ouvre la fenêtre ; l'adresse redevient ensuite celle de l'onglet.
  React.useEffect(() => {
    if (!p.openNew) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("nouveau"); url.searchParams.delete("prospect");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [p.openNew]);
  // Les filtres restent dans l'adresse (retour arrière, lien partagé), sans recharger la page.
  React.useEffect(() => {
    if (p.tab === "a-faire") return;
    const url = new URL(window.location.href);
    for (const [k, v] of [["q", q.trim()], ["responsable", resp], ["type", type]] as const) { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); }
    if (url.search !== window.location.search) window.history.replaceState(null, "", url.pathname + url.search);
  }, [p.tab, q, resp, type]);

  const rows = React.useMemo(() => {
    if (p.tab === "a-faire") return p.items;
    const needle = norm(q.trim());
    return p.items.filter((it) => (!type || it.taskKind === type)
      && (!resp || (resp === "moi" ? it.assigneeId === p.me : resp === "aucun" ? !it.assigneeId : it.assigneeId === resp))
      && (!needle || norm(`${it.title} ${it.prospectName ?? ""} ${it.note ?? ""}`).includes(needle)));
  }, [p.items, p.tab, p.me, q, resp, type]);
  const groups = p.tab === "terminees"
    ? [{ key: "tout", title: null as string | null, items: rows }]
    : SECTIONS.map((s) => ({ key: s.key, title: s.title as string | null, items: rows.filter((it) => s.has(it.day, p.today)) })).filter((g) => g.items.length);

  const mark = (key: string, on: boolean) => setDone((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  /** Cocher : la tâche est terminée tout de suite, avec quelques secondes pour annuler. Dans « Terminées », cocher rouvre. */
  const toggle = async (it: TodoItem) => {
    const reopen = it.status !== "ouverte";
    mark(it.key, true);
    const res = it.kind === "action"
      ? await updateProspectAction(it.prospectId ?? "", { next_action_at: null, next_action_note: null })
      : await closeTaskAction(it.taskId ?? "", reopen ? "ouverte" : "faite");
    if (!res.ok) { mark(it.key, false); toast.error(res.error); return; }
    router.refresh();
    toast.success(it.kind === "action" ? "Prochaine action faite." : reopen ? "Tâche rouverte." : "Tâche terminée.", {
      duration: 6000,
      action: {
        label: "Annuler",
        onClick: async () => {
          const back = it.kind === "action"
            ? await updateProspectAction(it.prospectId ?? "", { next_action_at: it.nextAt, next_action_note: it.nextNote })
            : await closeTaskAction(it.taskId ?? "", reopen ? (it.status === "annulee" ? "annulee" : "faite") : "ouverte");
          if (!back.ok) { toast.error(back.error); return; }
          mark(it.key, false);
          router.refresh();
        },
      },
    });
  };
  const openNew = () => setDialog((d) => ({ n: (d?.n ?? 0) + 1, item: null }));

  const description = p.tab === "toutes" ? "Toutes les tâches ouvertes de l'équipe, par échéance." : p.tab === "terminees" ? "Les 100 dernières tâches terminées ou annulées."
    : whoName ? `Ce qui attend ${whoName} : tâches, relances, rendez-vous et résultats d'appel à saisir.`
    : p.role === "setter" ? "Tes leads à appeler, tes relances et tes tâches, par échéance."
    : p.role === "closer" ? "Tes rendez-vous du jour, les résultats d'appel à saisir et tes tâches."
    : "Ce qui t'attend : tâches, relances, rendez-vous du jour et résultats d'appel à saisir.";
  const picker = p.canPickMember && p.tab === "a-faire" ? <MemberPicker members={p.members} value={p.who} me={p.me} /> : null;

  return (
    <>
      <PageHeader title="Tâches" description={description} className="hidden lg:flex"
        actions={<>{picker}<button type="button" onClick={openNew} className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg shadow-soft transition hover:brightness-110"><Plus className="size-4" strokeWidth={2.2} />Ajouter une tâche</button></>} />

      {/* Onglets : pastilles qui défilent sur téléphone, soulignés sur ordinateur. */}
      <nav aria-label="Vues des tâches" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key, p.who, p.me)} scroll={false} aria-current={t.key === p.tab ? "page" : undefined}
            className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[14px] font-semibold transition", t.key === p.tab ? "border-transparent bg-mk-pill text-mk-ink" : "border-mk-input text-mk-text active:bg-mk-chip")}>{t.label}</Link>
        ))}
      </nav>
      <nav aria-label="Vues des tâches" className="mb-5 hidden gap-6 border-b border-mk-line lg:flex">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key, p.who, p.me)} scroll={false} aria-current={t.key === p.tab ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-0.5 pb-3 pt-1 text-[14px] font-medium transition", t.key === p.tab ? "border-accent text-accent-2" : "border-transparent text-mk-sub hover:text-mk-strong")}>{t.label}</Link>
        ))}
      </nav>
      {picker ? <div className="mb-3 lg:hidden">{picker}</div> : null}

      {p.tab !== "a-faire" ? (
        <div className="mb-3 space-y-3 lg:mb-4 lg:flex lg:items-center lg:gap-2 lg:space-y-0">
          <MkSearchField icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une tâche ou un prospect" aria-label="Rechercher une tâche" className="lg:hidden" />
          <label className="relative hidden lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mk-sub" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une tâche ou un prospect" aria-label="Rechercher une tâche"
              className="h-9 w-80 rounded-lg border border-mk-input bg-surface pl-9 pr-3 text-[14px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
            {!p.sales ? (
              <PillSelect label="Responsable" value={resp} onChange={setResp}>
                <option value="">Tous les responsables</option><option value="moi">Moi</option><option value="aucun">Sans responsable</option>
                {p.members.filter((m) => m.id !== p.me).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </PillSelect>
            ) : null}
            <PillSelect label="Type" value={type} onChange={setType}>
              <option value="">Tous les types</option>{KINDS.map((k) => <option key={k} value={k}>{TASK_KIND[k]}</option>)}
            </PillSelect>
            <span className="shrink-0 whitespace-nowrap pl-1 text-[13px] text-mk-sub tabular lg:ml-auto">{plural(rows.length, "tâche", "tâches")}</span>
          </div>
        </div>
      ) : null}

      {p.tab === "a-faire" && p.unassigned > 0 && !p.sales ? (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-mk-chip px-3 py-2.5 text-[14px] text-mk-text lg:mb-4">
          <UserRound className="size-4 shrink-0 text-mk-icon" aria-hidden />
          <span className="min-w-0 flex-1">{plural(p.unassigned, "tâche ouverte n'a", "tâches ouvertes n'ont")} pas de responsable.</span>
          <Link href="/marketing/taches?onglet=toutes&responsable=aucun" className="shrink-0 font-medium text-accent-2 hover:underline">Les voir</Link>
        </p>
      ) : null}

      <div className="max-lg:-mx-4 max-lg:border-t max-lg:border-mk-line lg:overflow-hidden lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:shadow-soft">
        {rows.length ? (
          <>
            <div aria-hidden className={cn("hidden h-11 items-center border-b border-mk-line bg-bg pl-3 pr-5 text-[12px] font-medium text-mk-icon", GRID)}>
              <span /><span>Tâche</span><span>Prospect</span><span>{p.tab === "terminees" ? "État" : "Échéance"}</span><span>Responsable</span><span />
            </div>
            {groups.map((g) => (
              <section key={g.key} aria-label={g.title ?? "Tâches terminées"}>
                {g.title ? (
                  <h2 className={cn("sticky top-16 z-[5] flex items-center gap-2 border-b border-mk-line bg-mk-chip px-4 py-2 text-[13px] font-semibold lg:static lg:bg-surface lg:px-5 lg:pb-2 lg:pt-4",
                    g.key === "retard" ? "text-mk-danger" : "text-mk-strong")}>
                    {g.key === "retard" ? <span className="size-2 rounded-full bg-mk-danger" aria-hidden /> : null}{g.title}
                    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular", g.key === "retard" ? "bg-mk-danger/10" : "bg-mk-strip text-mk-text lg:bg-mk-chip")}>{g.items.length}</span>
                  </h2>
                ) : null}
                <ul>
                  {g.items.map((it) => (
                    <TaskRow key={it.key} it={it} today={p.today} pending={done.has(it.key)} assignee={name(it.assigneeId)} showAssignee={p.tab !== "a-faire"}
                      onToggle={() => toggle(it)} onEdit={() => setDialog((d) => ({ n: (d?.n ?? 0) + 1, item: it }))} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <Empty tab={p.tab} filtered={!!(q.trim() || resp || type)} whoName={whoName} onAdd={openNew} />
        )}
      </div>
      {p.capped && p.tab === "toutes" ? <p className="mt-3 text-[13px] text-mk-sub">Seules les 1 000 tâches les plus proches de leur échéance sont chargées : termine ou annule les plus anciennes pour voir la suite.</p> : null}

      <MkFab onClick={openNew} label="Ajouter une tâche" />
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        {dialog ? (
          <DialogContent title={dialog.item ? "Modifier la tâche" : "Ajouter une tâche"} description={dialog.item ? undefined : "Une tâche est rattachée à un prospect, avec une échéance et un responsable."}
            id="tache-fenetre" onOpenAutoFocus={(e) => { e.preventDefault(); focusForm(); }}
            className="[&>div:last-child]:min-h-0 max-lg:inset-0 max-lg:left-0 max-lg:top-0 max-lg:h-dvh max-lg:max-h-none max-lg:w-full max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-none max-lg:border-0">
            <TaskForm key={dialog.n} item={dialog.item} members={p.members} me={p.me} sales={p.sales} today={p.today} tz={p.tz}
              defaultAssignee={p.tab === "a-faire" ? p.who : p.me} preset={dialog.n === 0 ? p.preset : null} onDone={() => setDialog(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

/** À l'ouverture de la fenêtre : sur ordinateur, on tape tout de suite le prospect ; sur téléphone, pas de clavier qui surgit. */
function focusForm() {
  requestAnimationFrame(() => {
    const input = document.getElementById("tache-prospect");
    if (input && window.matchMedia("(min-width: 1024px)").matches) input.focus();
    else document.getElementById("tache-fenetre")?.focus();
  });
}

/* ─────────────── Une ligne ─────────────── */

function TaskRow({ it, today, pending, assignee, showAssignee, onToggle, onEdit }: { it: TodoItem; today: string; pending: boolean; assignee: string | null; showAssignee: boolean; onToggle: () => void; onEdit: () => void }) {
  const late = it.status === "ouverte" && !!it.day && it.day < today;
  const KindIcon = KIND_ICON[it.kind === "tache" ? it.taskKind ?? "autre" : it.kind] ?? ListTodo;
  const prospect = it.prospectId ? `/marketing/crm/${it.prospectId}` : null;
  const titleCls = cn("block max-w-full truncate text-left text-[15px] font-medium text-mk-strong hover:underline", pending && it.status === "ouverte" && "text-mk-sub line-through");
  const roundBtn = "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-mk-input bg-surface text-mk-icon transition hover:border-accent hover:text-accent-2 lg:size-9 [&_svg]:size-[18px] lg:[&_svg]:size-4";
  return (
    <li className={cn("flex items-center gap-1.5 border-b border-mk-line pl-2 pr-3 transition-opacity last:border-b-0 lg:min-h-[60px] lg:items-center lg:pl-3 lg:pr-5", GRID, pending && "opacity-60")}>
      <Lead it={it} pending={pending} onToggle={onToggle} />
      <div className="min-w-0 flex-1 py-3 lg:py-2.5">
        {it.kind === "tache" ? <button type="button" onClick={onEdit} className={titleCls} title="Modifier la tâche">{it.title}</button>
          : prospect ? <Link href={prospect} className={titleCls}>{it.title}</Link> : <span className={titleCls}>{it.title}</span>}
        {/* Téléphone : échéance, prospect et type sur une ligne. */}
        <div className="mt-1 flex min-w-0 items-center gap-2 lg:hidden">
          <Due it={it} late={late} today={today} compact />
          <span className="min-w-0 truncate text-[13px] text-mk-sub">
            {it.prospectName && prospect ? <Link href={prospect} className="font-medium text-mk-text">{it.prospectName}</Link> : null}
            {(it.prospectName ? " · " : "") + [it.label, showAssignee ? assignee ?? "sans responsable" : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        {/* Ordinateur : type et note sous le titre. */}
        <p className="mt-0.5 hidden min-w-0 items-center gap-1.5 text-[13px] text-mk-sub lg:flex">
          <KindIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden /><span className="truncate">{[it.label, it.note, it.origin === "automatisation" ? "créée par une automatisation" : it.origin === "source" ? "créée par l'outil de réservation" : null].filter(Boolean).join(" · ")}</span>
        </p>
      </div>
      <div className="hidden min-w-0 lg:block">
        {it.prospectName && prospect ? <Link href={prospect} className="block truncate text-[14px] font-medium text-mk-link hover:underline">{it.prospectName}</Link> : <span className="text-[14px] text-mk-sub">—</span>}
        {it.phone ? <span className="block truncate text-[13px] text-mk-sub tabular">{it.phone}</span> : null}
      </div>
      <div className="hidden lg:block"><Due it={it} late={late} today={today} /></div>
      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        {it.assigneeId ? <><Avatar name={assignee ?? "Membre"} size={28} /><span className="truncate text-[14px] text-mk-text">{assignee ?? "Membre"}</span></>
          : <><span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-mk-input text-mk-sub"><UserRound className="size-3.5" /></span><span className="truncate text-[14px] text-mk-sub">Sans responsable</span></>}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {it.kind === "rdv" && it.meetingUrl ? <a href={it.meetingUrl} target="_blank" rel="noopener noreferrer" aria-label="Rejoindre l'appel" title="Rejoindre l'appel" className={roundBtn}><Video /></a> : null}
        {it.phone ? <a href={`tel:${it.phone.replace(/[^\d+]/g, "")}`} aria-label={`Appeler ${it.prospectName ?? "le prospect"}`} title={`Appeler ${it.phone}`} className={roundBtn}><Phone /></a> : null}
        {prospect ? <Link href={prospect} aria-label="Ouvrir le prospect" title="Ouvrir le prospect" className={cn(roundBtn, "max-lg:hidden")}><ArrowUpRight /></Link> : null}
      </div>
    </li>
  );
}

/** Rond à cocher (tâche, prochaine action) ou pastille (rendez-vous, résultat à saisir : ils se règlent sur la fiche du prospect). */
function Lead({ it, pending, onToggle }: { it: TodoItem; pending: boolean; onToggle: () => void }) {
  if (it.kind === "rdv" || it.kind === "resultat") {
    const Icon = it.kind === "rdv" ? CalendarClock : ClipboardPen;
    return <span className="flex size-10 shrink-0 items-center justify-center" aria-hidden><span className="flex size-[24px] items-center justify-center rounded-full bg-mk-chip text-mk-icon"><Icon className="size-3.5" strokeWidth={2} /></span></span>;
  }
  const cancelled = it.status === "annulee", checked = pending ? it.status === "ouverte" : it.status !== "ouverte";
  const label = it.status === "ouverte" ? `Terminer « ${it.title} »` : `Rouvrir « ${it.title} »`;
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} title={it.status === "ouverte" ? "Terminer" : "Rouvrir"} disabled={pending} onClick={onToggle}
      className="group/check flex size-10 shrink-0 items-center justify-center rounded-full disabled:cursor-default">
      <span className={cn("flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition",
        checked && cancelled ? "border-mk-strip bg-mk-strip text-mk-sub" : checked ? "border-accent bg-accent text-accent-fg" : "border-mk-input text-transparent group-hover/check:border-accent group-hover/check:text-accent-2")}>
        {checked && cancelled ? <X className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Pastille d'échéance : rouge en retard. `compact` (téléphone) : dans « Aujourd'hui », l'heure seule (la section dit le jour). */
function Due({ it, late, today, compact }: { it: TodoItem; late: boolean; today: string; compact?: boolean }) {
  if (it.status !== "ouverte") return <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-mk-chip px-2 text-[12px] font-medium text-mk-sub whitespace-nowrap">{it.doneWhen}</span>;
  const isToday = it.day === today;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium whitespace-nowrap tabular",
      late ? "bg-mk-danger/10 text-mk-danger" : isToday ? "bg-mk-today text-mk-today-fg" : "bg-mk-chip text-mk-text")}>
      <CalendarDays className="size-3.5" strokeWidth={2} aria-hidden />{compact && isToday && it.time ? it.time : it.when}
    </span>
  );
}

function Empty({ tab, filtered, whoName, onAdd }: { tab: TasksTab; filtered: boolean; whoName: string | null; onAdd: () => void }) {
  const [title, text] = tab === "a-faire"
    ? ["Tout est à jour", whoName ? `${whoName} n'a rien à faire pour l'instant.` : "Rien ne t'attend : aucune tâche, relance, rendez-vous ni résultat d'appel à saisir."]
    : filtered ? ["Aucune tâche", "Aucune tâche ne correspond à ces filtres."]
    : tab === "toutes" ? ["Aucune tâche ouverte", "Une tâche se crée ici ou depuis la fiche d'un prospect."] : ["Aucune tâche terminée", "Les tâches terminées ou annulées s'afficheront ici."];
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center lg:py-16">
      <span className={cn("flex size-12 items-center justify-center rounded-full", tab === "a-faire" ? "bg-mk-success-soft text-mk-success" : "bg-mk-chip text-mk-icon")}>{tab === "a-faire" ? <Check className="size-6" strokeWidth={2.2} /> : <ListTodo className="size-6" strokeWidth={1.8} />}</span>
      <p className="mt-3 text-[16px] font-semibold text-mk-strong">{title}</p>
      <p className="mt-1 max-w-sm text-[14px] text-mk-sub">{text}</p>
      {tab !== "terminees" && !filtered ? <button type="button" onClick={onAdd} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent-2 hover:underline"><Plus className="size-4" strokeWidth={2.2} />Ajouter une tâche</button> : null}
    </div>
  );
}

/** Liste déroulante en pastille (filtres, choix du membre). */
function PillSelect({ label, value, onChange, children, className, active = !!value }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string; active?: boolean }) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 max-w-[70vw] appearance-none truncate rounded-full border bg-surface pl-3.5 pr-8 text-[14px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent/25 lg:max-w-[260px] lg:rounded-lg lg:font-medium",
          active ? "border-transparent bg-mk-pill text-mk-ink lg:border-accent lg:bg-accent-soft lg:text-accent-2" : "border-mk-input text-mk-strong")}>
        {children}
      </select>
      <ChevronDown className={cn("pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2", active ? "text-mk-ink lg:text-accent-2" : "text-mk-icon")} aria-hidden />
    </span>
  );
}

/** Administrateur : voir les éléments à faire d'un membre de l'équipe. */
function MemberPicker({ members, value, me }: { members: MemberOpt[]; value: string; me: string }) {
  const router = useRouter();
  const list = members.some((m) => m.id === me) ? members : [{ id: me, name: "Moi", role: "" }, ...members];
  return (
    <label className="flex min-w-0 items-center gap-2 text-[14px] text-mk-sub">
      <span className="shrink-0">Éléments de</span>
      <PillSelect label="Éléments de" value={value} active={value !== me} onChange={(v) => router.push(v === me ? "/marketing/taches" : `/marketing/taches?membre=${encodeURIComponent(v)}`)} className="min-w-0">
        {list.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `Moi${m.name !== "Moi" ? ` (${m.name})` : ""}` : m.name}{m.role ? ` · ${m.role}` : ""}</option>)}
      </PillSelect>
    </label>
  );
}

/* ─────────────── Fenêtre : ajouter ou modifier une tâche ─────────────── */

const FIELD = "h-12 w-full rounded-lg border border-mk-input bg-surface px-3 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 lg:h-10 lg:text-[14px]";
/** Titre proposé quand on laisse le champ vide : « Appeler Karim », « Relancer Karim »… */
const autoTitle = (kind: TaskKind, prospect: string | null) => {
  const first = prospect?.trim().split(/\s+/)[0] ?? "";
  return kind === "a_appeler" ? `Appeler ${first}`.trim() : kind === "relance" ? `Relancer ${first}`.trim() : kind === "resultat" ? "Saisir le résultat de l'appel" : "Tâche";
};
const toUtc = (date: string, time: string, tz: string) => {
  const [y, mo, d] = date.split("-").map(Number), [h, mi] = (time || "09:00").split(":").map(Number);
  return zonedTimeToUtc(y, mo, d, h || 0, mi || 0, tz).toISOString();
};
function Label({ children, required, htmlFor }: { children: React.ReactNode; required?: boolean; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-[15px] font-medium text-mk-text lg:text-[14px]">{children}{required ? <span className="ml-0.5 text-mk-required">*</span> : null}</label>;
}
function SelectBox({ id, value, onChange, children }: { id: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <span className="relative block">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(FIELD, "appearance-none pr-9")}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mk-icon" aria-hidden />
    </span>
  );
}

function TaskForm({ item, members, me, sales, today, tz, defaultAssignee, preset, onDone }: {
  item: TodoItem | null; members: MemberOpt[]; me: string; sales: boolean; today: string; tz: string; defaultAssignee: string; preset: { id: string; name: string } | null; onDone: () => void;
}) {
  const { exec, pending } = useAction();
  const [picked, setPicked] = React.useState<{ id: string; name: string } | null>(item?.prospectId ? { id: item.prospectId, name: item.prospectName ?? "Prospect" } : preset);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<TaskProspectHit[] | null>(null);
  const [kind, setKind] = React.useState<TaskKind>(item?.taskKind ?? "a_appeler");
  const [title, setTitle] = React.useState(item?.title ?? "");
  const [date, setDate] = React.useState(item ? item.date ?? "" : today);
  const [time, setTime] = React.useState(item ? item.time ?? "09:00" : "09:00");
  const [assignee, setAssignee] = React.useState(item ? item.assigneeId ?? "" : members.some((m) => m.id === defaultAssignee) ? defaultAssignee : me);
  const [note, setNote] = React.useState(item?.note ?? "");
  const [error, setError] = React.useState<string | null>(null);

  // Recherche du prospect (par le serveur : la liste peut être longue, et chacun ne voit que ses prospects).
  React.useEffect(() => {
    if (item || picked) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      const res = await searchTaskProspectsAction(query);
      if (alive) setHits(res.ok ? res.data : []);
    }, query ? 250 : 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, [query, picked, item]);

  const save = () => {
    if (!item && !picked) { setError("Choisis le prospect de la tâche."); return; }
    setError(null);
    const due_at = date ? toUtc(date, time, tz) : null;
    void exec(() => (item?.taskId
      ? editTaskAction(item.taskId, { title, note: note.trim() || null, due_at, ...(sales ? {} : { assignee_id: assignee || null }) })
      : addTaskAction({ prospect_id: picked?.id ?? "", kind, title: title.trim() || autoTitle(kind, picked?.name ?? null), note: note.trim() || undefined, assignee_id: sales ? undefined : assignee || null, due_at })),
    { success: item ? "Tâche modifiée." : "Tâche ajoutée.", onSuccess: onDone });
  };
  const cancelTask = () => { if (item?.taskId) void exec(() => closeTaskAction(item.taskId ?? "", "annulee"), { success: "Tâche annulée.", onSuccess: onDone }); };

  return (
    <form className="flex min-h-full flex-col" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="flex-1 space-y-4 pt-1">
        <div>
          <Label htmlFor="tache-prospect" required={!item}>Prospect</Label>
          {picked ? (
            <div className={cn(FIELD, "flex items-center gap-2.5 px-2.5")}>
              <MkInitials name={picked.name} size={30} />
              {item ? <Link href={`/marketing/crm/${picked.id}`} className="min-w-0 flex-1 truncate font-medium text-mk-link hover:underline">{picked.name}</Link> : <span className="min-w-0 flex-1 truncate font-medium">{picked.name}</span>}
              {!item ? <button type="button" onClick={() => { setPicked(null); setHits(null); }} aria-label="Changer de prospect" className="inline-flex size-8 items-center justify-center rounded-full text-mk-icon hover:bg-mk-chip"><X className="size-4" /></button> : null}
            </div>
          ) : (
            <>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-mk-sub lg:size-4" aria-hidden />
                <input id="tache-prospect" type="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, email ou téléphone" className={cn(FIELD, "pl-10 lg:pl-9")} />
              </span>
              <div className="mt-2 overflow-hidden rounded-lg border border-mk-line">
                {hits === null ? <p className="px-3 py-3 text-[14px] text-mk-sub">Recherche…</p>
                  : hits.length === 0 ? <p className="px-3 py-3 text-[14px] text-mk-sub">{query.trim() ? "Aucun prospect ne correspond." : "Aucun prospect pour l'instant."}</p>
                  : (
                    <ul className="max-h-56 overflow-y-auto">
                      {hits.map((h) => (
                        <li key={h.id} className="border-b border-mk-line last:border-b-0">
                          <button type="button" onClick={() => { setPicked({ id: h.id, name: h.name }); setError(null); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-mk-chip">
                            <MkInitials name={h.name} size={32} />
                            <span className="min-w-0"><span className="block truncate text-[15px] font-medium text-mk-strong lg:text-[14px]">{h.name}</span>{h.sub ? <span className="block truncate text-[13px] text-mk-sub">{h.sub}</span> : null}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </>
          )}
          {error ? <p role="alert" className="mt-1.5 text-[13px] text-mk-danger">{error}</p> : null}
        </div>

        {item ? (
          <p className="flex items-center gap-2 text-[14px] text-mk-sub"><span className="font-medium text-mk-text">Type :</span>{item.label}</p>
        ) : (
          <div>
            <Label htmlFor="tache-type">Type</Label>
            <SelectBox id="tache-type" value={kind} onChange={(v) => setKind(v as TaskKind)}>{KINDS.map((k) => <option key={k} value={k}>{TASK_KIND[k]}</option>)}</SelectBox>
          </div>
        )}
        <div>
          <Label htmlFor="tache-titre" required={!!item}>Titre</Label>
          <input id="tache-titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={item ? "" : `${autoTitle(kind, picked?.name ?? null)} (si tu laisses vide)`} className={FIELD} />
        </div>
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
          <div><Label htmlFor="tache-jour">Échéance</Label><input id="tache-jour" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} /></div>
          <div><Label htmlFor="tache-heure">Heure</Label><input id="tache-heure" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} className={cn(FIELD, "disabled:opacity-50")} /></div>
        </div>
        {!sales ? (
          <div>
            <Label htmlFor="tache-responsable">Responsable</Label>
            <SelectBox id="tache-responsable" value={assignee} onChange={setAssignee}>
              <option value="">Personne pour l&apos;instant</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `Moi (${m.name})` : m.name}{m.role ? ` · ${m.role}` : ""}</option>)}
            </SelectBox>
          </div>
        ) : null}
        <div>
          <Label htmlFor="tache-note">Description</Label>
          <textarea id="tache-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Ce qu'il faut savoir (facultatif)"
            className={cn(FIELD, "h-auto min-h-[96px] resize-y py-2.5 leading-relaxed lg:h-auto")} />
        </div>
        {item ? <button type="button" onClick={cancelTask} disabled={pending} className="text-[14px] font-medium text-mk-danger hover:underline disabled:opacity-50">Annuler cette tâche</button> : null}
      </div>

      {/* Téléphone : grand bouton en bas ; ordinateur : boutons à droite. */}
      <div className="sticky -bottom-6 -mx-6 -mb-6 mt-6 border-t border-mk-line bg-surface px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 lg:hidden">
        <MkPrimaryButton type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</MkPrimaryButton>
      </div>
      <div className="mt-6 hidden items-center justify-end gap-2 lg:flex">
        <button type="button" onClick={onDone} className="inline-flex h-10 items-center rounded-lg border border-mk-input bg-surface px-4 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip">Annuler</button>
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}
