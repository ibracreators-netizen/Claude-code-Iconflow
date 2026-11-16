"use client";
import * as React from "react";
import Link from "next/link";
import { BookOpenText, CalendarDays, Contact, Gauge, Inbox, LineChart, ListChecks, LogOut, Mail, Megaphone, NotebookPen, PhoneCall, Plus, Rows3, Search, Settings, Target, Trophy, Upload, UserPlus, UserRound, Users, Workflow, Zap, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

export type AppIcon = "crm" | "liste" | "contacts" | "taches" | "calendrier" | "kpi" | "setters" | "closers" | "suivi" | "acquisition" | "publicite" | "equipe" | "inviter" | "ressources" | "reglages" | "automatisations" | "reception" | "emails" | "import";
export interface AppGroup { title: string; apps: Array<{ label: string; href: string; icon: AppIcon; words: string }> }
const ICON: Record<AppIcon, LucideIcon> = {
  crm: Target, liste: Rows3, contacts: Contact, taches: ListChecks, calendrier: CalendarDays, kpi: Gauge, setters: PhoneCall, closers: Trophy, suivi: NotebookPen, acquisition: LineChart, publicite: Megaphone,
  equipe: Users, inviter: UserPlus, ressources: BookOpenText, reglages: Settings, automatisations: Zap, reception: Inbox, emails: Mail, import: Upload,
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Tile({ href, label, icon: Icon, accent }: { href: string; label: string; icon: LucideIcon; accent?: boolean }) {
  return (
    <li>
      <Link href={href} className="group flex flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center transition active:bg-surface-2">
        <span className={accent ? "flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-soft transition group-hover:brightness-110" : "flex size-14 items-center justify-center rounded-full border border-border bg-surface text-fg-2 transition group-hover:border-accent/50 group-hover:text-accent-2"}><Icon className="size-[22px]" strokeWidth={1.6} /></span>
        <span className="text-[12px] font-medium leading-tight text-fg-2">{label}</span>
      </Link>
    </li>
  );
}

export function AppsGrid({ groups, canCreateLead, canTrack, account }: { groups: AppGroup[]; canCreateLead: boolean; canTrack: boolean; account: { name: string; email: string; href: string; studio: boolean } }) {
  const [q, setQ] = React.useState("");
  const t = norm(q.trim());
  const shown = t ? groups.map((g) => ({ ...g, apps: g.apps.filter((a) => norm(`${a.label} ${a.words} ${g.title}`).includes(t)) })).filter((g) => g.apps.length) : groups;
  const grid = "grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-6 lg:grid-cols-8";
  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <span className="sr-only">Rechercher une application</span>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une application" className="h-11 pl-10" />
      </label>
      {!t && (canCreateLead || canTrack) ? (
        <section className="card p-4" aria-label="Actions rapides">
          <h2 className="mb-2 px-1 text-[14px] font-semibold">Actions rapides</h2>
          <ul className={grid}>
            {canCreateLead ? <Tile href="/marketing/crm?nouveau=1" label="Nouveau lead" icon={Plus} accent /> : null}
            {canCreateLead ? <Tile href="/marketing/taches" label="Mes tâches" icon={ListChecks} /> : null}
            {canTrack ? <Tile href="/marketing/kpi?onglet=suivi" label="Saisir mon suivi" icon={NotebookPen} /> : null}
          </ul>
        </section>
      ) : null}
      {shown.length === 0 ? <p className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucune application ne correspond à « {q} ».</p> : shown.map((g) => (
        <section key={g.title} className="card p-4" aria-label={g.title}>
          <h2 className="mb-2 px-1 text-[14px] font-semibold">{g.title}</h2>
          <ul className={grid}>{g.apps.map((a) => <Tile key={a.href} href={a.href} label={a.label} icon={ICON[a.icon]} />)}</ul>
        </section>
      ))}
      {!t ? (
        <section className="card divide-y divide-border" aria-label="Compte">
          <Link href={account.href} className="flex items-center gap-3 px-4 py-3.5 transition active:bg-surface-2"><UserRound className="size-5 text-muted" strokeWidth={1.6} /><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{account.name}</span><span className="block truncate text-[12px] text-muted">{account.email}</span></span><span className="text-[12.5px] text-accent-2">Mon compte</span></Link>
          {account.studio ? <Link href="/studio" className="flex items-center gap-3 px-4 py-3.5 text-[14px] font-medium transition active:bg-surface-2"><Workflow className="size-5 text-muted" strokeWidth={1.6} />Passer à Studio</Link> : null}
          <form action="/auth/signout" method="post"><button type="submit" className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-medium text-danger transition active:bg-surface-2"><LogOut className="size-5" strokeWidth={1.6} />Se déconnecter</button></form>
        </section>
      ) : null}
    </div>
  );
}
