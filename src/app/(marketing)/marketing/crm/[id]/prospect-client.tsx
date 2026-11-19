"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, ListPlus, Loader2, MessageSquare, Pencil, Phone, Tag, Trash2, type LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from "@/components/ui/dropdown";
import { MkHeaderActions } from "@/components/marketing/chrome";
import { useAction } from "@/lib/hooks/use-action";
import { deleteProspectsAction, updateProspectAction } from "@/lib/actions/marketing-crm";
import type { ProspectPatch } from "@/lib/marketing/crm";
import { CALL_RESULT, OUTCOME, STAGE_KIND, type Appointment, type CallResult, type Contact, type MarketingTask, type Member, type Outcome, type Prospect, type ProspectEvent, type Stage, type StageKind } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { STAGE_COLORS, euro, stageHex } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";
import { EmailDialog, TaskDialog, type LeadRef, type MailContext } from "../lead-dialogs";
import { AppointmentsTab, NotesTab, TasksTab } from "./prospect-tabs";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, Select, TEXTAREA } from "./fiche-ui";

type TabKey = "infos" | "taches" | "remarques" | "rdv" | "historique";
const TAB_LABEL: Record<TabKey, string> = { infos: "Informations", taches: "Tâches", remarques: "Remarques", rdv: "Rendez-vous", historique: "Historique" };
const PIPELINE = "IconFlow — Ventes";
const HEADER_H = 64; // en-tête du téléphone (h-16)

export interface FichePerms { remove: boolean; assign: boolean; tasks: boolean; calendar: boolean; contacts: boolean }
export interface ProspectViewProps {
  prospect: Prospect; contact: Contact | null; stages: Stage[]; members: Member[]; names: Record<string, string>;
  tasks: MarketingTask[]; notes: ProspectEvent[]; appointments: Appointment[];
  slots: { start: string; end: string }[]; slotMinutes: number | null; canBook: boolean; bookingUrl: string | null;
  timezone: string; today: string; now: string; me: string; perms: FichePerms; mail: MailContext;
  /** Chronologie, rendue côté serveur. */
  history: React.ReactNode;
  /** Proposition de création du client dans Studio (administrateur, après une signature). */
  proposal?: React.ReactNode;
}

/* ─────────────────────────── Formulaire « Modifier » ─────────────────────────── */

interface Form { title: string; stage: string; value: string; setter: string; closer: string; result: string; outcome: string; amount: string; callNote: string; besoin: string; budget: string; nextDay: string; nextNote: string }
const num = (v: number | null | undefined) => (v == null ? "" : String(v));
const formOf = (p: Prospect, name: string): Form => ({
  title: p.title ?? name, stage: p.stage_id ?? "", value: num(p.value), setter: p.setter_id ?? "", closer: p.closer_id ?? "",
  result: p.call_result ?? "", outcome: p.outcome ?? "", amount: num(p.signed_amount), callNote: p.call_note ?? "",
  besoin: p.besoin ?? "", budget: p.budget ?? "", nextDay: p.next_action_at ? p.next_action_at.slice(0, 10) : "", nextNote: p.next_action_note ?? "",
});
/** « 4 000 », « 4000,50 » → nombre ; vide → null ; illisible → undefined. */
const parseAmount = (s: string): number | null | undefined => { const t = s.replace(/[\s €]/g, "").replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : undefined; };

/** Seuls les champs modifiés partent : aucune ligne inutile dans l'historique. */
function patchOf(before: Form, f: Form, canAssign: boolean): ProspectPatch | string {
  const patch: ProspectPatch = {};
  if (!f.title.trim()) return "Donne un nom au prospect.";
  if (f.title.trim() !== before.title.trim()) patch.title = f.title.trim();
  if (f.stage && f.stage !== before.stage) patch.stage_id = f.stage;
  if (f.value !== before.value) { const v = parseAmount(f.value); if (v === undefined) return "La valeur doit être un nombre, par exemple 4000."; patch.value = v; }
  if (f.amount !== before.amount) { const v = parseAmount(f.amount); if (v === undefined) return "Le montant signé doit être un nombre, par exemple 4000."; patch.signed_amount = v; }
  if (canAssign && f.setter !== before.setter) patch.setter_id = f.setter || null;
  if (canAssign && f.closer !== before.closer) patch.closer_id = f.closer || null;
  if (f.result !== before.result) patch.call_result = (f.result || null) as CallResult | null;
  if (f.outcome !== before.outcome) patch.outcome = (f.outcome || null) as Outcome | null;
  if (f.callNote !== before.callNote) patch.call_note = f.callNote;
  if (f.besoin !== before.besoin) patch.besoin = f.besoin;
  if (f.budget !== before.budget) patch.budget = f.budget;
  if (f.nextDay !== before.nextDay) patch.next_action_at = f.nextDay ? new Date(`${f.nextDay}T09:00:00Z`).toISOString() : null;
  if (f.nextNote !== before.nextNote) patch.next_action_note = f.nextNote;
  return patch;
}

/* ─────────────────────────── « Masquer les champs vides » (mémorisé dans ce navigateur) ─────────────────────────── */

const HIDE_KEY = "iconflow-fiche-masquer-vides", HIDE_EVENT = "iconflow-fiche-masquer-vides-change";
const readHide = () => { try { return window.localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };
const subscribeHide = (cb: () => void) => { window.addEventListener(HIDE_EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(HIDE_EVENT, cb); window.removeEventListener("storage", cb); }; };
function useHideEmpty(): [boolean, (v: boolean) => void] {
  const stored = React.useSyncExternalStore(subscribeHide, readHide, () => false);
  // Si le stockage est bloqué, l'interrupteur marche quand même (pour cette visite).
  const [local, setLocal] = React.useState<boolean | null>(null);
  const set = React.useCallback((v: boolean) => { setLocal(v); try { window.localStorage.setItem(HIDE_KEY, v ? "1" : "0"); window.dispatchEvent(new Event(HIDE_EVENT)); } catch { /* stockage indisponible */ } }, []);
  return [local ?? stored, set];
}

/* ─────────────────────────── La fiche ─────────────────────────── */

/**
 * Fiche prospect au style LeadConnector « Modifier l'opportunité ».
 * - Téléphone : carte contact, actions rondes, onglets Informations · Tâches · Remarques · Rendez-vous · Historique.
 * - Ordinateur : à gauche la carte contact et les informations, à droite les onglets ; fil d'Ariane, suppression et changement d'étape en haut.
 */
export function ProspectView(props: ProspectViewProps) {
  const { prospect: p, contact, stages, members, perms, timezone } = props;
  const router = useRouter();
  const { exec, pending } = useAction();
  const { exec: execRemove, pending: removing } = useAction();
  const [tab, setTab] = React.useState<TabKey>("infos");
  const [form, setForm] = React.useState<Form | null>(null);
  const [emailFor, setEmailFor] = React.useState<LeadRef | null>(null);
  const [taskFor, setTaskFor] = React.useState<LeadRef | null>(null);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const anchor = React.useRef<HTMLDivElement>(null);

  const name = contact?.name ?? p.name ?? contact?.email ?? p.email ?? "Prospect";
  const phone = contact?.phone ?? p.phone ?? null, email = contact?.email ?? p.email ?? null;
  const lead: LeadRef = { id: p.id, name, email, company: contact?.company ?? p.marque ?? null, setter_id: p.setter_id ?? null, closer_id: p.closer_id ?? null, unsubscribed: !!p.unsubscribed_at };
  const stage = stages.find((s) => s.id === p.stage_id) ?? null;
  const contactHref = contact && perms.contacts ? `/marketing/contacts/${contact.id}` : null;
  const tabs = (["infos", "taches", "remarques", "rdv", "historique"] as TabKey[]).filter((t) => (t !== "taches" || perms.tasks) && (t !== "rdv" || perms.calendar));
  const sideTabs = tabs.filter((t) => t !== "infos");
  const side = tab === "infos" ? sideTabs[0] : tab;

  // Téléphone : en changeant d'onglet plus bas dans la page, on remonte juste sous l'en-tête.
  const pick = (t: TabKey) => {
    setTab(t);
    const el = anchor.current; if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_H;
    if (window.scrollY > top) window.scrollTo({ top });
  };
  const save = () => {
    if (!form) return;
    const patch = patchOf(formOf(p, name), form, perms.assign);
    if (typeof patch === "string") { toast.error(patch); return; }
    if (!Object.keys(patch).length) { setForm(null); return; }
    void exec(() => updateProspectAction(p.id, patch), { success: "Prospect enregistré.", onSuccess: () => setForm(null) });
  };
  const moveTo = (s: Stage) => { if (s.id !== p.stage_id) void exec(() => updateProspectAction(p.id, { stage_id: s.id }), { success: `Déplacé vers « ${s.name} ».` }); };
  const remove = () => void execRemove(() => deleteProspectsAction([p.id]), { success: "Prospect supprimé.", refresh: false, onSuccess: () => { setConfirmRemove(false); router.push("/marketing/crm"); } });

  const content = (t: TabKey | undefined) => {
    switch (t) {
      case "taches": return <TasksTab tasks={props.tasks} members={members} timezone={timezone} today={props.today} onAdd={() => setTaskFor(lead)} />;
      case "remarques": return <NotesTab prospectId={p.id} notes={props.notes} sheetNote={p.notes} names={props.names} timezone={timezone} />;
      case "rdv": return <AppointmentsTab prospectId={p.id} appointments={props.appointments} slots={props.slots} slotMinutes={props.slotMinutes} timezone={timezone} now={props.now} today={props.today} canBook={props.canBook} bookingUrl={props.bookingUrl} />;
      case "historique": return props.history;
      default: return null;
    }
  };

  return (
    <div>
      {/* Téléphone : boutons de l'en-tête (corbeille, ou « Enregistrer » pendant la modification) */}
      <MkHeaderActions>
        {form ? (
          <button type="button" onClick={save} disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[16px] font-semibold text-accent-2 transition active:bg-mk-chip disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" /> : null}Enregistrer</button>
        ) : perms.remove ? (
          <button type="button" onClick={() => setConfirmRemove(true)} aria-label="Supprimer le prospect" className="inline-flex size-11 items-center justify-center rounded-full text-mk-text transition hover:bg-mk-chip"><Trash2 className="size-[22px]" strokeWidth={1.8} /></button>
        ) : null}
      </MkHeaderActions>

      {/* Ordinateur : fil d'Ariane, suppression, changement d'étape */}
      <div className="mb-5 hidden items-center gap-3 lg:flex">
        <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1.5 text-[14px]">
          <Link href="/marketing/crm" className="font-medium text-mk-sub transition hover:text-mk-strong">Prospects</Link>
          <ChevronRight className="size-4 shrink-0 text-mk-sub" aria-hidden />
          <span className="truncate font-semibold text-mk-strong" aria-current="page">{name}</span>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {perms.remove ? <button type="button" onClick={() => setConfirmRemove(true)} className={cn(BTN_SECONDARY, "h-9 px-3.5 text-mk-danger hover:text-mk-danger")}><Trash2 />Supprimer</button> : null}
          <StageMenu stages={stages} current={stage} pending={pending} onPick={moveTo} />
        </div>
      </div>

      {props.proposal ? <div className="mb-4">{props.proposal}</div> : null}

      {/* Sur téléphone, la colonne de gauche « s'efface » (display: contents) : les onglets restent collés sous l'en-tête jusqu'en bas de la page. */}
      <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="max-lg:contents lg:space-y-4">
          <ContactCard name={name} phone={phone} email={email} href={contactHref}>
            <RoundAction icon={Phone} label="Appeler" href={phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : undefined} disabled={!phone} />
            <RoundAction icon={MessageSquare} label="Message" onClick={() => setEmailFor(lead)} />
            <RoundAction icon={Tag} label="Étiquettes" onClick={() => setTagsOpen(true)} />
            {perms.tasks ? <RoundAction icon={ListPlus} label="Tâche" onClick={() => setTaskFor(lead)} /> : null}
          </ContactCard>

          {/* Téléphone : onglets soulignés, collés sous l'en-tête. Le repère (non collant) donne leur place d'origine. */}
          <div ref={anchor} aria-hidden className="lg:hidden" />
          <div className="sticky top-16 z-20 -mx-4 mt-3 border-b border-mk-line bg-surface lg:hidden">
            <TabBar tabs={tabs} active={tab} onPick={pick} className="px-4" />
          </div>

          <div className={cn("max-lg:mt-4", tab !== "infos" && "max-lg:hidden")} role="tabpanel" aria-label={TAB_LABEL.infos}>
            <InfoPanel p={p} contact={contact} name={name} stage={stage} stages={stages} members={members} perms={perms} timezone={timezone} contactHref={contactHref}
              form={form} setForm={setForm} onEdit={() => setForm(formOf(p, name))} onSave={save} saving={pending} />
          </div>
        </div>

        <div className={cn("lg:overflow-hidden lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:shadow-soft", tab === "infos" && "max-lg:hidden")}>
          <div className="hidden border-b border-mk-line px-5 lg:block"><TabBar tabs={sideTabs} active={side} onPick={setTab} /></div>
          <div role="tabpanel" aria-label={side ? TAB_LABEL[side] : undefined} className="pt-4 lg:p-5">{content(side)}</div>
        </div>
      </div>

      <EmailDialog lead={emailFor} mail={props.mail} onClose={() => setEmailFor(null)} />
      {perms.tasks ? <TaskDialog lead={taskFor} members={members} canAssign={perms.assign} me={props.me} onClose={() => setTaskFor(null)} /> : null}
      <TagsSheet open={tagsOpen} onOpenChange={setTagsOpen} tags={contact?.tags ?? []} contactHref={contactHref} />
      {perms.remove ? (
        <ConfirmDialog open={confirmRemove} onOpenChange={setConfirmRemove} loading={removing} danger title={`Supprimer ${name} ?`}
          description="Le prospect disparaît avec son historique, ses tâches et ses rendez-vous. Sa fiche contact aussi, si elle n'a pas d'autre affaire. C'est définitif."
          confirmLabel="Supprimer" onConfirm={remove} />
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Onglets ─────────────────────────── */

function TabBar({ tabs, active, onPick, className }: { tabs: TabKey[]; active: TabKey | undefined; onPick: (t: TabKey) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Sections de la fiche" className={cn("flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {tabs.map((t) => {
        const on = t === active;
        return (
          <button key={t} type="button" role="tab" aria-selected={on} onClick={() => onPick(t)}
            className={cn("relative shrink-0 whitespace-nowrap py-3 text-[15px] font-medium transition lg:text-[14px]", on ? "text-accent-2" : "text-mk-sub hover:text-mk-strong")}>
            {TAB_LABEL[t]}
            {on ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Carte contact ─────────────────────────── */

function ContactCard({ name, phone, email, href, children }: { name: string; phone: string | null; email: string | null; href: string | null; children: React.ReactNode }) {
  const body = (
    <>
      <Avatar name={name} size={48} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-semibold leading-snug text-mk-strong">{name}</h1>
        {phone ? <p className="truncate text-[14px] text-mk-sub">{phone}</p> : null}
        {email ? <p className="truncate text-[14px] text-mk-sub">{email}</p> : null}
        {!phone && !email ? <p className="text-[14px] text-mk-sub">Ni téléphone ni e-mail</p> : null}
      </div>
      {href ? <ChevronRight className="size-5 shrink-0 text-mk-icon" aria-hidden /> : null}
    </>
  );
  const top = "flex items-center gap-3.5 px-4 pb-3 pt-4";
  return (
    <section className="rounded-xl border border-mk-line bg-surface lg:shadow-soft">
      {href ? <Link href={href} aria-label={`Ouvrir la fiche contact de ${name}`} className={cn(top, "rounded-t-xl transition hover:bg-mk-chip/60")}>{body}</Link> : <div className={top}>{body}</div>}
      <div className="flex items-start justify-around px-2 pb-4 pt-2">{children}</div>
    </section>
  );
}

function RoundAction({ icon: Icon, label, onClick, href, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      <span className="flex size-11 items-center justify-center rounded-full border border-mk-input bg-surface text-mk-icon transition group-hover:border-accent/60 group-hover:text-accent-2 group-active:scale-95"><Icon className="size-5" strokeWidth={1.8} /></span>
      <span className="text-[12px] font-medium text-mk-text">{label}</span>
    </>
  );
  const cls = cn("group flex min-w-16 flex-col items-center gap-1.5 rounded-xl py-1 outline-offset-2", disabled && "pointer-events-none opacity-40");
  if (href && !disabled) return <a href={href} className={cls}>{inner}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} aria-disabled={disabled || undefined} className={cls}>{inner}</button>;
}

/** Étiquettes de la fiche contact, en feuille qui monte du bas sur téléphone. */
function TagsSheet({ open, onOpenChange, tags, contactHref }: { open: boolean; onOpenChange: (o: boolean) => void; tags: string[]; contactHref: string | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Étiquettes" description="Les étiquettes de la fiche contact."
        className="max-lg:inset-x-0 max-lg:bottom-0 max-lg:left-0 max-lg:top-auto max-lg:w-full max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-2xl max-lg:pb-[env(safe-area-inset-bottom)]">
        {tags.length ? (
          <ul className="flex flex-wrap gap-2">{tags.map((t) => <li key={t} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-mk-input bg-surface px-3.5 text-[14px] font-medium text-mk-strong"><Tag className="size-3.5 text-mk-icon" />{t}</li>)}</ul>
        ) : <p className="text-[15px] text-mk-sub">Aucune étiquette sur ce contact pour l&apos;instant.</p>}
        {contactHref ? <Link href={contactHref} className="mt-5 inline-flex items-center gap-1 text-[15px] font-medium text-accent-2 hover:underline lg:text-[14px]">Modifier les étiquettes sur la fiche contact<ChevronRight className="size-4" /></Link> : null}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Changement d'étape rapide (ordinateur) ─────────────────────────── */

function StageMenu({ stages, current, pending, onPick }: { stages: Stage[]; current: Stage | null; pending: boolean; onPick: (s: Stage) => void }) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button type="button" disabled={pending} aria-label={`Étape : ${current?.name ?? "sans étape"}. Changer l'étape`} className={cn(BTN_SECONDARY, "h-9 min-w-[210px] justify-between gap-3 px-3")}>
          <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: current ? stageHex(current) : STAGE_COLORS.gris.hex }} /><span className="truncate text-mk-strong">{current?.name ?? "Sans étape"}</span></span>
          {pending ? <Loader2 className="animate-spin text-mk-sub" /> : <ChevronDown className="text-mk-sub" />}
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-64">
        <DropdownLabel>Déplacer vers l&apos;étape</DropdownLabel>
        {stages.map((s) => (
          <DropdownItem key={s.id} onSelect={() => onPick(s)} className="py-2 text-[14px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: stageHex(s) }} />
            <span className="flex-1 truncate">{s.name}</span>
            {s.id === current?.id ? <Check className="!text-accent-2" /> : null}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

/* ─────────────────────────── Informations ─────────────────────────── */

const STATUS_PILL: Record<StageKind, string> = { ouvert: "bg-mk-strip text-mk-text", gagne: "bg-mk-success-soft text-mk-success", perdu: "bg-[color-mix(in_oklab,var(--mk-danger)_14%,transparent)] text-mk-danger" };
function StatusPill({ kind }: { kind: StageKind }) {
  return <span className={cn("inline-flex h-7 items-center rounded-full px-3 text-[13px] font-medium", STATUS_PILL[kind])}>{STAGE_KIND[kind]}</span>;
}
function StageValue({ stage }: { stage: Stage | null }) {
  if (!stage) return null;
  return <span className="inline-flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: stageHex(stage) }} />{stage.name}</span>;
}

interface Row { key: string; label: string; required?: boolean; view: React.ReactNode; edit?: React.ReactNode; hint?: string }
interface Group { title?: string; rows: Row[]; readonly?: boolean }
const filled = (v: React.ReactNode) => v !== null && v !== undefined && v !== "" && v !== false;

function InfoPanel({ p, contact, name, stage, stages, members, perms, timezone, contactHref, form, setForm, onEdit, onSave, saving }: {
  p: Prospect; contact: Contact | null; name: string; stage: Stage | null; stages: Stage[]; members: Member[]; perms: FichePerms; timezone: string; contactHref: string | null;
  form: Form | null; setForm: (f: Form | null) => void; onEdit: () => void; onSave: () => void; saving: boolean;
}) {
  const [hideEmpty, setHideEmpty] = useHideEmpty();
  const editing = !!form;
  const memberName = (id: string | null | undefined) => (id ? members.find((m) => m.id === id)?.name ?? "Membre" : null);
  const day = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const f = form ?? formOf(p, name);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...f, [k]: e.target.value });
  const id = (k: string) => `fiche-${k}`;
  const people = (role: "setter" | "closer", current: string) => members.filter((m) => m.id === current || (m.marketing_role !== "media_buyer" && m.marketing_role !== (role === "setter" ? "closer" : "setter")));
  const assignHint = perms.assign ? undefined : "Attribué par l'administrateur";
  const formStage = stages.find((s) => s.id === f.stage) ?? (f.stage === p.stage_id ? stage : null);

  const groups: Group[] = [
    { rows: [
      { key: "contact", label: "Contact", view: contact ? (contactHref ? <Link href={contactHref} className="font-medium text-mk-link hover:underline">{contact.name ?? contact.email ?? "Fiche contact"}</Link> : contact.name ?? contact.email) : null },
      { key: "title", label: "Nom du prospect", required: true, view: p.title ?? name, edit: <input id={id("title")} value={f.title} onChange={set("title")} maxLength={160} required className={INPUT} /> },
      { key: "pipeline", label: "Pipeline", view: PIPELINE },
      { key: "stage", label: "Étape", view: <StageValue stage={stage} />, edit: (
        <Select id={id("stage")} value={f.stage} onChange={set("stage")}>
          {!f.stage || !stages.some((s) => s.id === f.stage) ? <option value={f.stage}>{stage?.name ?? "Sans étape"}</option> : null}
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      ) },
      { key: "status", label: "Statut", view: <StatusPill kind={(editing ? formStage : stage)?.kind ?? "ouvert"} />, hint: editing ? "Suit l'étape choisie" : undefined },
      { key: "value", label: "Valeur", view: p.value != null ? euro.format(p.value) : null, edit: <AmountInput id={id("value")} value={f.value} onChange={set("value")} /> },
      { key: "source", label: "Source", view: p.source },
      { key: "setter", label: "Setter", view: memberName(p.setter_id), hint: editing ? assignHint : undefined, edit: perms.assign ? (
        <Select id={id("setter")} value={f.setter} onChange={set("setter")}><option value="">Personne</option>{people("setter", f.setter).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
      ) : undefined },
      { key: "closer", label: "Closer", view: memberName(p.closer_id), hint: editing ? assignHint : undefined, edit: perms.assign ? (
        <Select id={id("closer")} value={f.closer} onChange={set("closer")}><option value="">Personne</option>{people("closer", f.closer).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
      ) : undefined },
      { key: "created", label: "Créé le", view: formatDateTimeInZone(p.created_at, timezone) },
      { key: "moved", label: "Changement d'étape", view: p.stage_changed_at ? formatDateTimeInZone(p.stage_changed_at, timezone) : null },
    ] },
    { title: "Appel", rows: [
      { key: "result", label: "Résultat d'appel", view: p.call_result ? CALL_RESULT[p.call_result] : null, edit: (
        <Select id={id("result")} value={f.result} onChange={set("result")}><option value="">Non renseigné</option>{(Object.keys(CALL_RESULT) as CallResult[]).map((k) => <option key={k} value={k}>{CALL_RESULT[k]}</option>)}</Select>
      ) },
      { key: "outcome", label: "Issue", view: p.outcome ? OUTCOME[p.outcome] : null, edit: (
        <Select id={id("outcome")} value={f.outcome} onChange={set("outcome")}><option value="">Non renseignée</option>{(Object.keys(OUTCOME) as Outcome[]).map((k) => <option key={k} value={k}>{OUTCOME[k]}</option>)}</Select>
      ) },
      { key: "amount", label: "Montant signé", view: p.signed_amount != null ? `${euro.format(p.signed_amount)} HT` : null, hint: editing ? "Hors taxes" : undefined, edit: <AmountInput id={id("amount")} value={f.amount} onChange={set("amount")} /> },
      { key: "callNote", label: "Note d'appel", view: p.call_note ? <span className="whitespace-pre-wrap">{p.call_note}</span> : null, edit: <textarea id={id("callNote")} value={f.callNote} onChange={set("callNote")} rows={3} maxLength={4000} className={TEXTAREA} /> },
    ] },
    { title: "Suivi", rows: [
      { key: "besoin", label: "Besoin", view: p.besoin ? <span className="whitespace-pre-wrap">{p.besoin}</span> : null, edit: <textarea id={id("besoin")} value={f.besoin} onChange={set("besoin")} rows={2} maxLength={2000} className={cn(TEXTAREA, "min-h-[72px]")} /> },
      { key: "budget", label: "Budget", view: p.budget, edit: <input id={id("budget")} value={f.budget} onChange={set("budget")} maxLength={200} placeholder="Ce que la personne annonce" className={INPUT} /> },
      { key: "next", label: "Prochaine action", view: p.next_action_at || p.next_action_note ? [p.next_action_at ? day(p.next_action_at) : null, p.next_action_note].filter(Boolean).join(" · ") : null, edit: (
        <span className="grid gap-2">
          <input id={id("next")} type="date" value={f.nextDay} onChange={set("nextDay")} aria-label="Date de la prochaine action" className={INPUT} />
          <input value={f.nextNote} onChange={set("nextNote")} maxLength={500} aria-label="Ce qu'il faut faire" placeholder="Ex. Envoyer l'étude de cas avant l'appel" className={INPUT} />
        </span>
      ) },
    ] },
  ];
  // Provenance : seulement ce qui a été relevé (aucun champ vide affiché).
  const origin: Row[] = ([
    ["optin", "Opt-in", p.opted_in_at ? formatDateTimeInZone(p.opted_in_at, timezone) : null],
    ["site", "Site", p.site], ["landing", "Page d'entrée", p.landing_page], ["referrer", "Site d'origine", p.referrer],
    ...Object.entries(p.utm ?? {}).map(([k, v]) => [`utm-${k}`, k, v] as const),
    ["unsub", "E-mails", p.unsubscribed_at ? `Désinscrit le ${formatDateTimeInZone(p.unsubscribed_at, timezone)}` : null],
  ] as Array<readonly [string, string, string | null | undefined]>).filter(([, , v]) => !!v).map(([key, label, v]) => ({ key, label, view: <span className="break-all">{v}</span> }));
  if (origin.length) groups.push({ title: "Provenance", rows: origin, readonly: true });

  const shown = groups.filter((g) => !(editing && g.readonly)).map((g) => ({ ...g, rows: g.rows.filter((r) => editing || !hideEmpty || filled(r.view)) })).filter((g) => g.rows.length);

  return (
    <section className="rounded-xl bg-mk-chip p-4 lg:border lg:border-mk-line lg:bg-surface lg:p-5 lg:shadow-soft" aria-label="Informations du prospect">
      <h2 className="mb-3 hidden text-[16px] font-semibold text-mk-strong lg:block">Informations</h2>
      <div className="flex min-h-10 items-center gap-3">
        {editing ? <p className="flex-1 text-[14px] font-medium text-mk-text">Modification en cours</p> : (
          <button type="button" role="switch" aria-checked={hideEmpty} onClick={() => setHideEmpty(!hideEmpty)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[14px] font-medium text-mk-text">
            <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", hideEmpty ? "bg-accent" : "bg-mk-input")}>
              <span className={cn("absolute top-0.5 size-4 rounded-full shadow-[0_1px_2px_rgb(16_24_40/0.25)] transition-all", hideEmpty ? "left-[18px] bg-accent-fg" : "left-0.5 bg-surface")} />
            </span>
            <span className="truncate">Masquer les champs vides</span>
          </button>
        )}
        {editing
          ? <button type="button" onClick={() => setForm(null)} className="text-[14px] font-medium text-mk-sub transition hover:text-mk-strong">Annuler</button>
          : <button type="button" onClick={onEdit} className={cn(BTN_PRIMARY, "h-9 gap-1 px-3.5 lg:px-3")}><Pencil className="max-lg:hidden" />Modifier</button>}
      </div>

      {/* Entrée dans un champ enregistre, comme le bouton du bas. */}
      <form className="mt-2" noValidate onSubmit={(e) => { e.preventDefault(); if (editing) onSave(); }}>
        {shown.map((g, gi) => {
          const List = editing ? "div" : "dl";
          const req = (r: Row) => (r.required ? <span className="ml-0.5 text-mk-required">*</span> : null);
          const value = (r: Row) => (filled(r.view) ? r.view : <span className="text-mk-sub">—</span>);
          return (
            <div key={g.title ?? gi} className={cn(gi > 0 && "mt-4 border-t border-mk-line pt-4")}>
              {g.title ? <h3 className="mb-1 text-[14px] font-semibold text-mk-strong">{g.title}</h3> : null}
              <List>
                {g.rows.map((r) => (
                  <div key={r.key} className="py-2.5">
                    {!editing ? (
                      <><dt className="text-[13px] font-medium text-mk-sub">{r.label}{req(r)}</dt><dd className="mt-0.5 break-words text-[15px] text-mk-strong">{value(r)}</dd></>
                    ) : r.edit ? (
                      <><label htmlFor={id(r.key)} className="mb-1.5 block text-[13px] font-medium text-mk-sub">{r.label}{req(r)}</label>{r.edit}</>
                    ) : (
                      <><p className="text-[13px] font-medium text-mk-sub">{r.label}{req(r)}</p><div className="mt-0.5 break-words text-[15px] text-mk-strong">{value(r)}</div></>
                    )}
                    {r.hint ? <p className="mt-1 text-[12px] text-mk-sub">{r.hint}</p> : null}
                  </div>
                ))}
              </List>
            </div>
          );
        })}
        {!shown.length ? <p className="py-3 text-[14px] text-mk-sub">Tous les champs sont vides. Désactive « Masquer les champs vides » pour les voir.</p> : null}

        {editing ? (
          <div className="mt-4 flex flex-col-reverse gap-2 border-t border-mk-line pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setForm(null)} className={cn(BTN_SECONDARY, "h-12 text-[16px] lg:h-10 lg:text-[14px]")}>Annuler</button>
            <button type="submit" disabled={saving} className={cn(BTN_PRIMARY, "h-12 text-[16px] lg:h-10 lg:text-[14px]")}>{saving ? <Loader2 className="animate-spin" /> : null}Enregistrer</button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function AmountInput({ id, value, onChange }: { id: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <span className="relative block">
      <input id={id} inputMode="decimal" value={value} onChange={onChange} placeholder="Ex. 4000" className={cn(INPUT, "pr-9")} />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] text-mk-sub" aria-hidden>€</span>
    </span>
  );
}
