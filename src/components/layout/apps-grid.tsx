"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowLeftRight, BookOpenText, Brain, Building2, CalendarDays, CheckSquare, Clapperboard, ClipboardList, Contact, FileText, FolderOpen, Gauge, Home, Inbox, LayoutDashboard, LineChart, ListChecks, LogOut, Mail, Megaphone,
  MessageSquare, NotebookPen, PhoneCall, Plus, Receipt, Repeat, Rows3, Search, Settings, Sparkles, Target, Trophy, Upload, UserPlus, UserRound, Users, UsersRound, Zap, type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ICON = {
  home: Home, crm: Target, liste: Rows3, contacts: Contact, taches: ListChecks, calendrier: CalendarDays, kpi: Gauge, setters: PhoneCall, closers: Trophy, suivi: NotebookPen, acquisition: LineChart, publicite: Megaphone,
  equipe: Users, inviter: UserPlus, ressources: BookOpenText, reglages: Settings, automatisations: Zap, reception: Inbox, emails: Mail, import: Upload, plus: Plus,
  dashboard: LayoutDashboard, inbox: Inbox, clients: Building2, pipeline: ClipboardList, messages: MessageSquare, briefs: FileText, livrables: Clapperboard, check: CheckSquare, performance: LineChart, avatars: UsersRound,
  ia: Sparkles, brain: Brain, documents: BookOpenText, fichiers: FolderOpen, factures: Receipt, revenus: Repeat,
} satisfies Record<string, LucideIcon>;
export type AppIcon = keyof typeof ICON;
export type AppTone = "accent" | "info" | "violet" | "warning";
export interface AppItem { label: string; href: string; icon: AppIcon; words?: string }
export interface AppGroup { title: string; tone: AppTone; apps: AppItem[] }
/** Une teinte par famille : on repère sa page à la couleur avant de lire. */
const TONE: Record<AppTone, { tile: string; dot: string }> = {
  accent: { tile: "bg-accent-soft text-accent-2", dot: "bg-accent" },
  info: { tile: "bg-info/15 text-info", dot: "bg-info" },
  violet: { tile: "bg-violet/15 text-violet", dot: "bg-violet" },
  warning: { tile: "bg-warning/15 text-warning", dot: "bg-warning" },
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Tile({ app, tone, solid }: { app: AppItem; tone: AppTone; solid?: boolean }) {
  const Icon = ICON[app.icon];
  return (
    <li>
      <Link href={app.href} className="group flex flex-col items-center gap-2 rounded-2xl px-1 py-1.5 text-center transition active:scale-95">
        <span className={cn("flex size-[60px] items-center justify-center rounded-[20px] shadow-soft transition group-hover:scale-105", solid ? "bg-accent text-accent-fg" : TONE[tone].tile)}><Icon className="size-[26px]" strokeWidth={1.8} /></span>
        <span className="text-[12.5px] font-semibold leading-tight text-fg">{app.label}</span>
      </Link>
    </li>
  );
}

/** Écran « Applications » : toutes les pages d'un espace, en grille par famille, avec une recherche. */
export function AppsGrid({ groups, quick, account }: {
  groups: AppGroup[]; quick: AppItem[];
  account: { name: string; email: string; href: string; other?: { label: string; href: string } | null };
}) {
  const [q, setQ] = React.useState("");
  const t = norm(q.trim());
  const shown = t ? groups.map((g) => ({ ...g, apps: g.apps.filter((a) => norm(`${a.label} ${a.words ?? ""} ${g.title}`).includes(t)) })).filter((g) => g.apps.length) : groups;
  const grid = "grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-6 lg:grid-cols-8";
  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
        <span className="sr-only">Rechercher une application</span>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une application" className="h-12 rounded-2xl pl-11 text-[15px]" />
      </label>
      {!t && quick.length ? (
        <section className="card border-accent/30 p-4" aria-label="Actions rapides">
          <h2 className="mb-3 flex items-center gap-2 px-1 text-[15px] font-semibold"><span className="size-2 rounded-full bg-brand" />Actions rapides</h2>
          <ul className={grid}>{quick.map((a, i) => <Tile key={a.href} app={a} tone="accent" solid={i === 0} />)}</ul>
        </section>
      ) : null}
      {shown.length === 0 ? <p className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucune application ne correspond à « {q} ».</p> : shown.map((g) => (
        <section key={g.title} className="card p-4" aria-label={g.title}>
          <h2 className="mb-3 flex items-center gap-2 px-1 text-[15px] font-semibold"><span className={cn("size-2 rounded-full", TONE[g.tone].dot)} />{g.title}<span className="text-[12px] font-normal text-muted">{g.apps.length}</span></h2>
          <ul className={grid}>{g.apps.map((a) => <Tile key={a.href} app={a} tone={g.tone} />)}</ul>
        </section>
      ))}
      {!t ? (
        <section className="card divide-y divide-border overflow-hidden" aria-label="Compte">
          <Link href={account.href} className="flex items-center gap-3 px-4 py-4 transition active:bg-surface-2"><span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-fg-2"><UserRound className="size-5" strokeWidth={1.7} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold">{account.name}</span><span className="block truncate text-[12px] text-muted">{account.email}</span></span><span className="text-[12.5px] font-medium text-accent-2">Mon compte</span></Link>
          {account.other ? <Link href={account.other.href} className="flex items-center gap-3 px-4 py-4 text-[14.5px] font-semibold transition active:bg-surface-2"><span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-2"><ArrowLeftRight className="size-5" strokeWidth={1.7} /></span>{account.other.label}</Link> : null}
          <form action="/auth/signout" method="post"><button type="submit" className="flex w-full items-center gap-3 px-4 py-4 text-left text-[14.5px] font-semibold text-danger transition active:bg-surface-2"><span className="flex size-10 items-center justify-center rounded-xl bg-danger/10"><LogOut className="size-5" strokeWidth={1.7} /></span>Se déconnecter</button></form>
        </section>
      ) : null}
    </div>
  );
}
