"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, Plus, Search, Sparkles, X, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterNav, isNavActive, portalNav, studioNav, type NavGroup, type NavItem, studioTabs, STUDIO_APPS_HREF } from "./nav";
import { useNavCollapsed } from "@/lib/hooks/use-local-pref";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/providers/theme-toggle";
import { CommandPalette, type PaletteItem } from "./command-palette";
import { Sidebar } from "./sidebar";
import type { SpaceLink } from "./space-switcher";
import { loadPalette } from "@/lib/actions/palette";

export interface ShellUser { name: string; email: string; title?: string | null; avatar?: string | null }
export type { SpaceLink };

/**
 * Shell de Studio et du portail client : une barre latérale noire unique (repliable en icônes), une barre du haut
 * épurée, et sur téléphone des onglets en bas (Studio) ou un tiroir (portail). L'espace Marketing a son propre shell.
 */
export function AppShell({ variant, user, children, workspaceLabel, badges = {}, demo, paletteItems = [], accountHref, quickCreate, allowedModules, spaces }: {
  variant: "studio" | "portal"; user: ShellUser; children: React.ReactNode; workspaceLabel: string; badges?: Record<string, number>; demo?: boolean;
  paletteItems?: PaletteItem[]; accountHref: string; quickCreate?: React.ReactNode; allowedModules?: string[]; spaces?: SpaceLink[];
}) {
  const baseNav: NavGroup[] = variant === "studio" ? studioNav : portalNav;
  const appName = variant === "studio" ? "Studio" : "Ton espace client";
  // Droits par membre : seules les entrées autorisées apparaissent (la garde serveur reste l'autorité).
  const nav: NavGroup[] = React.useMemo(() => filterNav(baseNav, allowedModules), [baseNav, allowedModules]);
  // Entrées utilitaires (Paramètres, Réglages) épinglées en bas, hors de la liste qui défile.
  const pinned = React.useMemo(() => nav.flatMap((g) => g.items).filter((i) => i.pinned), [nav]);
  const mainNav: NavGroup[] = React.useMemo(() => nav.map((g) => ({ ...g, items: g.items.filter((i) => !i.pinned) })).filter((g) => g.items.length), [nav]);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // Barre latérale repliable sur ordinateur (bouton en haut de la barre, ou Ctrl/Cmd + \\). Le choix est gardé dans le navigateur.
  const [collapsed, setCollapsed] = useNavCollapsed();
  const toggleCollapsed = React.useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);
  // Studio et Marketing sont deux applications au style différent : on rétablit celui de Studio si l'on arrive d'une page Marketing.
  React.useEffect(() => { document.documentElement.dataset.app = "studio"; }, []);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  // Les éléments de recherche (clients, briefs, livrables, documents) ne sont chargés qu'à la première ouverture.
  const [lazyItems, setLazyItems] = React.useState<PaletteItem[] | null>(null);
  const [loadingItems, setLoadingItems] = React.useState(false);
  const loadingRef = React.useRef(false);
  // Le menu se démonte au clic (Radix) avant l'envoi natif du formulaire : on soumet explicitement avant.
  const signoutFormRef = React.useRef<HTMLFormElement>(null);
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
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // AltGr (Ctrl + Alt sous Windows) sert à taper « \ » sur un clavier français : ce n'est pas un raccourci.
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.getModifierState?.("AltGraph")) return;
      if (e.key.toLowerCase() === "k") { e.preventDefault(); openPalette((o) => !o); }
      if (e.key === "\\") { e.preventDefault(); toggleCollapsed(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette, toggleCollapsed]);

  const isActive = (item: NavItem) => isNavActive(pathname, item);
  const current = nav.flatMap((g) => g.items).filter(isActive).sort((a, b) => b.href.length - a.href.length)[0];
  // Le compteur « à traiter » est fourni par le layout (déjà filtré par les droits) ; sinon somme des badges.
  const totalInbox = badges.inbox ?? Object.values(badges).reduce((a, b) => a + b, 0);
  const home = nav[0].items[0].href;
  const inboxItem = nav.flatMap((g) => g.items).find((i) => i.badgeKey === "inbox" || i.badgeKey === "validations");
  const inboxHref = inboxItem?.also?.find((x) => x.href.endsWith("/inbox"))?.href ?? inboxItem?.href ?? home;
  // Téléphone, Studio : onglets en bas (l'essentiel) + « Applications » (tout le reste). Le portail garde son tiroir.
  const appsHref = variant === "studio" ? STUDIO_APPS_HREF : null;
  const tabs = React.useMemo(() => (!appsHref ? [] : [...studioTabs.filter((t) => !allowedModules || !t.module || allowedModules.includes(t.module)).slice(0, 4), { href: appsHref, label: "Applications", icon: LayoutGrid } as NavItem]), [appsHref, allowedModules]);
  const onTab = (t: NavItem) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/"));
  // « Applications » reste allumé sur toute page qui n'a pas son propre onglet.
  const activeTab = tabs.slice(0, -1).find(onTab)?.href ?? appsHref;
  // Bouton + flottant (téléphone) : le geste de création le plus fréquent de l'espace.
  const can = (m: string) => !allowedModules || allowedModules.includes(m);
  const fab = variant === "studio" && can("clients") ? { href: "/studio/clients?new=1", label: "Nouveau client" } : null;

  const sidebarProps = { nav: mainNav, pinned, badges, home, accountHref, appName, spaces,
    user: { name: user.name, email: user.email, avatar: user.avatar } };

  return (
    <div className="flex min-h-dvh bg-bg">
      <div className="no-print sticky top-0 hidden h-dvh shrink-0 lg:block"><Sidebar {...sidebarProps} /></div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex max-w-[86vw] animate-[rise_.25s_ease] shadow-pop"><Sidebar {...sidebarProps} mobile />
            <button onClick={() => setMobileOpen(false)} className="absolute right-2 top-3 rounded-md p-1.5 text-side-muted" aria-label="Fermer le menu"><X className="size-4" /></button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:p-3">
        <div className="flex min-h-full flex-1 flex-col overflow-clip bg-surface lg:rounded-[22px] lg:border lg:border-border lg:shadow-soft">
          <header className="no-print sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-xl sm:px-6">
            {tabs.length ? <Link href={home} className="rounded-[12px] bg-[#1b261a] p-1 ring-1 ring-white/10 lg:hidden" aria-label="Accueil"><Image src="/brand/iconflow-logo-96.png" alt="" width={26} height={26} className="rounded-[8px]" /></Link> : <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu /></Button>}
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="hidden text-muted sm:inline">{workspaceLabel}</span>
              <span className="hidden text-muted-2 sm:inline">/</span>
              <span className="truncate font-medium text-fg">{current?.label ?? (pathname === appsHref ? "Applications" : "Studio")}</span>
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
                  <form ref={signoutFormRef} action="/auth/signout" method="post"><DropdownItem asChild danger onSelect={(event) => { event.preventDefault(); signoutFormRef.current?.requestSubmit(); }}><button type="submit" className="w-full"><LogOut />Se déconnecter</button></DropdownItem></form>
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
          <main id="main" className={cn("flex-1 px-4 py-6 sm:px-8 lg:py-9", tabs.length && "pb-28 lg:pb-9")}>
            <div className="mx-auto w-full max-w-[1320px]">{children}</div>
          </main>
          <footer className={cn("no-print items-center justify-between gap-4 border-t border-border px-4 py-4 text-[12px] text-muted sm:px-8", tabs.length ? "hidden lg:flex" : "flex")}>
            <span>Un espace pour créer. De l&apos;idée à la livraison.</span>
            <span className="hidden sm:inline">icon-flow.fr</span>
          </footer>
        </div>
      </div>
      {tabs.length && fab && !pathname.endsWith("/applications") ? (
        <Link href={fab.href} aria-label={fab.label} className="no-print fixed bottom-[calc(max(env(safe-area-inset-bottom),6px)+76px)] right-4 z-40 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-[0_10px_30px_-8px_rgb(0_0_0/.5)] transition active:scale-95 lg:hidden"><Plus className="size-6" strokeWidth={2.2} /></Link>
      ) : null}
      {tabs.length ? (
        <nav aria-label="Navigation rapide" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-xl lg:hidden">
          <ul className="mx-auto flex max-w-[520px] items-stretch justify-around px-1">
            {tabs.map((t) => {
              const active = t.href === activeTab, count = t.badgeKey ? badges[t.badgeKey] : undefined;
              return (
                <li key={t.href} className="min-w-0 flex-1">
                  <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("flex h-[54px] flex-col items-center justify-center gap-1 rounded-[14px] text-[10.5px] font-medium transition", active ? "text-accent-2" : "text-muted active:bg-surface-2")}>
                    <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition", active && "bg-accent-soft")}>
                      <t.icon className="size-[19px]" strokeWidth={1.7} />
                      {count ? <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-[#06220f]">{count}</span> : null}
                    </span>
                    <span className="max-w-full truncate px-0.5">{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      <CommandPalette open={paletteOpen} onOpenChange={openPalette} nav={nav} items={paletteItems.length ? paletteItems : lazyItems ?? []} loading={loadingItems} />
    </div>
  );
}
