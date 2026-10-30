"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft, ChevronRight, LogOut, Menu, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { portalNav, studioNav, type NavGroup } from "./nav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/providers/theme-toggle";
import { useLocalPref } from "@/lib/hooks/use-local-pref";
import { CommandPalette, type PaletteItem } from "./command-palette";
import { loadPalette } from "@/lib/actions/palette";

export interface ShellUser { name: string; email: string; title?: string | null; avatar?: string | null }

/**
 * Shell Iconflow : rail vert sombre (icônes) + panneau de navigation clair (libellés), topbar épurée.
 * Replié : seul le rail reste visible. Mobile : tiroir avec les deux.
 */
export function AppShell({ variant, user, children, workspaceLabel, badges = {}, demo, paletteItems = [], accountHref, quickCreate, allowedModules }: {
  variant: "studio" | "portal"; user: ShellUser; children: React.ReactNode; workspaceLabel: string; badges?: Record<string, number>; demo?: boolean;
  paletteItems?: PaletteItem[]; accountHref: string; quickCreate?: React.ReactNode; allowedModules?: string[];
}) {
  const baseNav: NavGroup[] = variant === "studio" ? studioNav : portalNav;
  // Droits par membre : seules les entrées autorisées apparaissent (la garde serveur reste l'autorité).
  const nav: NavGroup[] = React.useMemo(() => {
    if (!allowedModules) return baseNav;
    return baseNav.map((g) => ({ ...g, items: g.items.filter((i) => !i.module || allowedModules.includes(i.module)) })).filter((g) => g.items.length);
  }, [baseNav, allowedModules]);
  const pathname = usePathname();
  const [navPref, setNavPref] = useLocalPref("iconflow-nav", "open");
  const collapsed = navPref === "collapsed";
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  // Les éléments de recherche (clients, briefs, livrables, documents) ne sont chargés qu'à la première ouverture.
  const [lazyItems, setLazyItems] = React.useState<PaletteItem[] | null>(null);
  const [loadingItems, setLoadingItems] = React.useState(false);
  const loadingRef = React.useRef(false);
  const openPalette = React.useCallback((next: boolean | ((o: boolean) => boolean)) => {
    setPaletteOpen((o) => {
      const value = typeof next === "function" ? next(o) : next;
      if (value && variant === "studio" && !paletteItems.length && !loadingRef.current && lazyItems === null) {
        loadingRef.current = true;
        setLoadingItems(true);
        loadPalette().then((items) => setLazyItems(items)).catch(() => setLazyItems([])).finally(() => setLoadingItems(false));
      }
      return value;
    });
  }, [variant, paletteItems.length, lazyItems]);
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); if (mobileOpen) setMobileOpen(false); }
  const toggleCollapsed = React.useCallback(() => setNavPref(collapsed ? "open" : "collapsed"), [collapsed, setNavPref]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette((o) => !o); }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggleCollapsed(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed, openPalette]);

  const isActive = (item: NavGroup["items"][number]) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));
  const current = nav.flatMap((g) => g.items).filter(isActive).sort((a, b) => b.href.length - a.href.length)[0];
  // Le compteur « à traiter » est fourni par le layout (déjà filtré par les droits) ; sinon somme des badges.
  const totalInbox = badges.inbox ?? Object.values(badges).reduce((a, b) => a + b, 0);
  const home = nav[0].items[0].href;
  const inboxHref = nav.flatMap((g) => g.items).find((i) => i.badgeKey === "inbox" || i.badgeKey === "validations")?.href ?? home;
  const dense = nav.reduce((n, g) => n + g.items.length, 0) > 12;

  /* Rail sombre flottant : logo, icônes, avatar */
  const rail = (
    <div className="flex h-full shrink-0 py-3 pl-3">
      <div className="flex h-full w-[64px] flex-col items-center rounded-[34px] bg-rail py-4 text-rail-fg shadow-[0_18px_50px_-24px_rgb(0_0_0/.55),inset_0_1px_0_rgb(255_255_255/.06)]">
        <Tooltip label={collapsed ? "Déplier la navigation" : "Replier la navigation"} side="right">
          <button onClick={toggleCollapsed} className="group relative mb-5 hidden rounded-[18px] bg-white/8 p-1 ring-1 ring-white/10 transition hover:bg-white/14 lg:block" aria-label="Replier ou déplier la navigation" aria-expanded={!collapsed}>
            <Image src="/brand/iconflow-logo-96.png" alt="" width={40} height={40} className="rounded-[14px]" priority />
            <span className="absolute -right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[#06220f] opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100">{collapsed ? <ChevronRight className="size-3" /> : <ChevronLeft className="size-3" />}</span>
          </button>
        </Tooltip>
        <Link href={home} className="mb-5 rounded-[18px] bg-white/8 p-1 ring-1 ring-white/10 lg:hidden" aria-label="Accueil"><Image src="/brand/iconflow-logo-96.png" alt="" width={40} height={40} className="rounded-[14px]" priority /></Link>
        <nav className={cn("flex w-full flex-1 flex-col items-center overflow-y-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", dense ? "gap-1" : "gap-3")} aria-label="Sections">
          {nav.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 ? <span className={cn("h-px w-5 shrink-0 bg-white/10", dense ? "my-0" : "my-0.5")} aria-hidden /> : null}
              {group.items.map((item) => {
                const active = isActive(item);
                const count = item.badgeKey ? badges[item.badgeKey] : undefined;
                const link = (
                  <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={item.label}
                    className={cn("relative flex items-center justify-center rounded-[14px] transition", dense ? "size-9" : "size-11", active ? "bg-white/14 text-white shadow-[inset_0_1px_0_rgb(255_255_255/.1)]" : "text-rail-muted hover:bg-white/8 hover:text-white")}>
                    {active ? <span className="absolute -left-[13px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-rail-muted" /> : null}
                    <item.icon className={dense ? "size-[17px]" : "size-5"} strokeWidth={1.6} />
                    {count ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-[#06220f]">{count}</span> : null}
                  </Link>
                );
                return <div key={item.href}>{collapsed ? <Tooltip label={item.label} side="right">{link}</Tooltip> : link}</div>;
              })}
            </React.Fragment>
          ))}
        </nav>
        <span className="my-3 h-px w-8 shrink-0 bg-white/10" aria-hidden />
        <Link href={accountHref} className="rounded-full ring-2 ring-white/10 transition hover:ring-brand/70" aria-label="Mon compte"><Avatar name={user.name} src={user.avatar} size={40} className="!bg-[#e9efe6] !text-[#1b261a]" /></Link>
      </div>
    </div>
  );

  /* Panneau clair : libellés par groupe */
  const panel = (
    <div className={cn("flex h-full w-[232px] shrink-0 flex-col bg-bg transition-[width,opacity] duration-200", collapsed && "lg:w-0 lg:overflow-hidden lg:opacity-0")}>
      <div className="px-5 pb-2 pt-7">
        <Link href={home} className="text-[26px] font-semibold tracking-[-0.035em] text-fg">iconflow<span className="text-accent-2">.</span></Link>
        <div className="mt-1 text-[13px] text-muted">{variant === "studio" ? "L'espace de l'agence" : "Ton espace client"}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-3" aria-label="Navigation principale">
        {nav.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-5")}>
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{group.label ?? "Espace de travail"}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const count = item.badgeKey ? badges[item.badgeKey] : undefined;
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? "page" : undefined}
                      className={cn("flex h-11 items-center gap-3 rounded-[16px] px-3.5 text-[14px] font-medium transition", active ? "bg-surface text-accent-2 shadow-soft ring-1 ring-accent/25" : "text-fg-2 hover:bg-surface/70 hover:text-fg")}>
                      <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent-2" : "text-muted")} strokeWidth={1.7} />
                      <span className="truncate">{item.label}</span>
                      {count ? <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular leading-5", active ? "bg-accent-soft text-accent-2" : "bg-surface-3 text-fg-2")}>{count}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mx-4 border-t border-border py-3">
        <Link href={accountHref} className="flex items-center gap-3 rounded-[14px] px-1 py-1.5 transition hover:bg-surface">
          <Avatar name={user.name} src={user.avatar} size={34} />
          <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{user.name}</span><span className="block truncate text-[12px] text-muted">{workspaceLabel}</span></span>
          <span className="pr-1 text-[16px] leading-none tracking-widest text-muted">···</span>
        </Link>
      </div>
    </div>
  );

  const sidebar = <div className="flex h-full">{rail}{panel}</div>;

  return (
    <div className="flex min-h-dvh bg-bg">
      <div className="no-print sticky top-0 hidden h-dvh lg:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex animate-[rise_.25s_ease] shadow-pop">{sidebar}
            <button onClick={() => setMobileOpen(false)} className="absolute right-2 top-3 rounded-md p-1.5 text-muted" aria-label="Fermer le menu"><X className="size-4" /></button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:py-3 lg:pr-3">
        <div className="flex min-h-full flex-1 flex-col overflow-hidden bg-surface lg:rounded-[22px] lg:border lg:border-border lg:shadow-soft">
          <header className="no-print sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-xl sm:px-6">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu /></Button>
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="hidden text-muted sm:inline">{workspaceLabel}</span>
              <span className="hidden text-muted-2 sm:inline">/</span>
              <span className="truncate font-medium text-fg">{current?.label ?? "Studio"}</span>
            </div>
            {demo ? <span className="ml-3 hidden items-center gap-1.5 text-[11.5px] text-muted md:inline-flex"><Sparkles className="size-3 text-accent-2" />Projet de démonstration · données fictives</span> : null}
            <div className="ml-auto flex items-center gap-1.5">
              {quickCreate}
              <Dropdown>
                <DropdownTrigger asChild>
                  <button className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-surface-2 sm:inline-flex" aria-label="Menu du compte"><Avatar name={user.name} src={user.avatar} size={28} /><span className="text-[13px] font-semibold">{user.name.split(" ")[0]}</span></button>
                </DropdownTrigger>
                <DropdownContent className="min-w-[220px]">
                  <DropdownLabel>{user.email}</DropdownLabel>
                  <DropdownItem asChild><Link href={accountHref}>Mon compte</Link></DropdownItem>
                  <DropdownSeparator />
                  <form action="/auth/signout" method="post"><DropdownItem asChild danger><button type="submit" className="w-full"><LogOut />Se déconnecter</button></DropdownItem></form>
                </DropdownContent>
              </Dropdown>
              <button onClick={() => openPalette(true)} className="hidden h-9 items-center gap-2 rounded-full px-3 text-[13px] text-muted transition hover:bg-surface-2 hover:text-fg sm:inline-flex" aria-label="Rechercher">
                <Search className="size-4" /><span>Rechercher</span><Kbd>⌘ K</Kbd>
              </button>
              <Button variant="ghost" size="icon-sm" className="sm:hidden" onClick={() => openPalette(true)} aria-label="Rechercher"><Search /></Button>
              <Tooltip label={totalInbox ? `${totalInbox} éléments à traiter` : "Rien à traiter"}>
                <Link href={inboxHref} className="relative inline-flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Notifications">
                  <Bell className="size-4" />
                  {totalInbox ? <span className="absolute right-2 top-2 size-2 rounded-full bg-brand ring-2 ring-surface" /> : null}
                </Link>
              </Tooltip>
              <ThemeToggle />
            </div>
          </header>
          <main id="main" className="flex-1 px-4 py-6 sm:px-8 lg:py-9">
            <div className="mx-auto w-full max-w-[1320px]">{children}</div>
          </main>
          <footer className="no-print flex items-center justify-between gap-4 border-t border-border px-4 py-4 text-[12px] text-muted sm:px-8">
            <span>Un espace pour créer. De l&apos;idée à la livraison.</span>
            <span className="hidden sm:inline">icon-flow.fr</span>
          </footer>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={openPalette} nav={nav} items={paletteItems.length ? paletteItems : lazyItems ?? []} loading={loadingItems} />
    </div>
  );
}
