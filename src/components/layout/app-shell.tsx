"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, ChevronsLeft, LogOut, Menu, PanelLeft, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/providers/theme-toggle";
import { useLocalPref } from "@/lib/hooks/use-local-pref";
import { CommandPalette, type PaletteItem } from "./command-palette";

export interface ShellUser { name: string; email: string; title?: string | null; avatar?: string | null }

export function AppShell({ nav, user, children, workspaceLabel, badges = {}, demo, paletteItems = [], accountHref, quickCreate }: {
  nav: NavGroup[]; user: ShellUser; children: React.ReactNode; workspaceLabel: string; badges?: Record<string, number>; demo?: boolean;
  paletteItems?: PaletteItem[]; accountHref: string; quickCreate?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navPref, setNavPref] = useLocalPref("iconflow-nav", "open");
  const collapsed = navPref === "collapsed";
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  // Ferme le tiroir mobile à chaque navigation (pattern "state from props" sans effet).
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); if (mobileOpen) setMobileOpen(false); }
  const toggleCollapsed = React.useCallback(() => setNavPref(collapsed ? "open" : "collapsed"), [collapsed, setNavPref]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggleCollapsed(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  const current = nav.flatMap((g) => g.items).filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0];
  const totalInbox = Object.values(badges).reduce((a, b) => a + b, 0);

  const sidebar = (
    <aside className={cn("flex h-full flex-col border-r border-border bg-surface/70 backdrop-blur-xl transition-[width] duration-200", collapsed ? "w-[68px]" : "w-[248px]")}>
      <div className={cn("flex h-14 items-center gap-2.5 px-3", collapsed && "justify-center px-0")}>
        <Link href={nav[0].items[0].href} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-surface-2" aria-label="Accueil">
          <Image src="/brand/iconflow-logo-96.png" alt="" width={30} height={30} className="rounded-[9px] shadow-soft" priority />
          {!collapsed ? <span className="text-[17px] font-semibold tracking-tight">iconflow<span className="text-accent-2">.</span></span> : null}
        </Link>
        {!collapsed ? (
          <Tooltip label={<span className="flex items-center gap-2">Replier <Kbd className="bg-bg/20 text-bg border-bg/20">⌘\</Kbd></span>}>
            <button onClick={toggleCollapsed} className="ml-auto hidden rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg lg:inline-flex" aria-label="Replier la navigation"><ChevronsLeft className="size-4" /></button>
          </Tooltip>
        ) : null}
        <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-md p-1.5 text-muted lg:hidden" aria-label="Fermer le menu"><X className="size-4" /></button>
      </div>
      {!collapsed ? <div className="px-5 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-2">{workspaceLabel}</div> : null}
      <nav className="flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Navigation principale">
        {nav.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-4")}>
            {group.label && !collapsed ? <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">{group.label}</div> : group.label ? <div className="mx-auto my-2 h-px w-6 bg-border" /> : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
                const count = item.badgeKey ? badges[item.badgeKey] : undefined;
                const link = (
                  <Link href={item.href} aria-current={active ? "page" : undefined}
                    className={cn("group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors", active ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg", collapsed && "justify-center px-0")}>
                    {active ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" /> : null}
                    <item.icon className={cn("size-[17px] shrink-0", active ? "text-accent-2" : "text-muted group-hover:text-fg-2")} />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {count ? <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular leading-5", active ? "bg-accent text-accent-fg" : "bg-surface-3 text-fg-2", collapsed && "absolute -right-0.5 -top-0.5 ml-0 h-4 min-w-4 px-1 text-[10px] leading-4 bg-accent text-accent-fg")}>{count}</span> : null}
                  </Link>
                );
                return <li key={item.href}>{collapsed ? <Tooltip label={item.label} side="right">{link}</Tooltip> : link}</li>;
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn("border-t border-border p-2.5", collapsed && "flex justify-center")}>
        {collapsed ? (
          <Tooltip label="Déplier" side="right"><button onClick={toggleCollapsed} className="rounded-md p-2 text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Déplier la navigation"><PanelLeft className="size-4" /></button></Tooltip>
        ) : (
          <Link href={accountHref} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
            <Avatar name={user.name} src={user.avatar} size={30} />
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{user.name}</span><span className="block truncate text-[11.5px] text-muted">{user.title || user.email}</span></span>
          </Link>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-dvh">
      <div className="sticky top-0 hidden h-dvh lg:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] animate-[rise_.25s_ease] shadow-pop">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border glass px-3 sm:px-5">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu /></Button>
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="hidden text-muted sm:inline">{workspaceLabel}</span>
            <span className="hidden text-muted-2 sm:inline">/</span>
            <span className="truncate font-medium">{current?.label ?? "Studio"}</span>
          </div>
          {demo ? <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning md:inline-flex"><Sparkles className="size-3" />Démo · données fictives</span> : null}
          <div className="ml-auto flex items-center gap-1">
            {quickCreate}
            <button onClick={() => setPaletteOpen(true)} className="hidden h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-muted transition hover:border-border-strong hover:text-fg sm:inline-flex" aria-label="Rechercher">
              <Search className="size-3.5" /><span>Rechercher…</span><Kbd>⌘K</Kbd>
            </button>
            <Button variant="ghost" size="icon-sm" className="sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Rechercher"><Search /></Button>
            <Tooltip label={totalInbox ? `${totalInbox} éléments à traiter` : "Rien à traiter"}>
              <Link href={nav[0].items[1]?.href ?? "#"} className="relative inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Notifications">
                <Bell className="size-4" />
                {totalInbox ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-surface" /> : null}
              </Link>
            </Tooltip>
            <ThemeToggle />
            <Dropdown>
              <DropdownTrigger asChild>
                <button className="ml-1 rounded-full ring-offset-2 ring-offset-surface transition hover:ring-2 hover:ring-border-strong" aria-label="Menu du compte"><Avatar name={user.name} src={user.avatar} size={30} /></button>
              </DropdownTrigger>
              <DropdownContent className="min-w-[220px]">
                <DropdownLabel>{user.email}</DropdownLabel>
                <DropdownItem asChild><Link href={accountHref}>Mon compte</Link></DropdownItem>
                <DropdownSeparator />
                <form action="/auth/signout" method="post"><DropdownItem asChild danger><button type="submit" className="w-full"><LogOut />Se déconnecter</button></DropdownItem></form>
              </DropdownContent>
            </Dropdown>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} items={paletteItems} />
    </div>
  );
}
