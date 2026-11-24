"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, ChevronDown, LayoutGrid, RefreshCw, Search, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterNav, isNavActive, marketingNav, marketingTabs, MARKETING_APPS_HREF, type NavItem } from "@/components/layout/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { SpaceSwitcher, type SpaceLink } from "@/components/layout/space-switcher";
import { Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { useNavCollapsed } from "@/lib/hooks/use-local-pref";
import { MK_HEADER_SLOT, MkFab } from "./chrome";

export interface MarketingShellUser { name: string; email: string; avatar?: string | null }
const LOGO = "/brand/marketing-logo-96.png";

/**
 * Pages sans onglet : titre et page de retour affichés en haut sur téléphone (« ← Paramètres », comme LeadConnector).
 * Un préfixe qui finit par « / » ne vise que les sous-pages ; sinon la page elle-même et ses sous-pages. Le premier qui correspond l'emporte.
 */
const SUB_PAGES: Array<{ prefix: string; title: string; back: string }> = [
  { prefix: "/marketing/crm/nouveau", title: "Ajouter un prospect", back: "/marketing/crm" },
  { prefix: "/marketing/crm/", title: "Modifier le prospect", back: "/marketing/crm" },
  { prefix: "/marketing/contacts/nouveau", title: "Ajouter un contact", back: "/marketing/contacts" },
  { prefix: "/marketing/contacts/", title: "Contact", back: "/marketing/contacts" },
  { prefix: "/marketing/contacts", title: "Contacts", back: MARKETING_APPS_HREF },
  { prefix: "/marketing/paiements", title: "Paiements", back: MARKETING_APPS_HREF },
  { prefix: "/marketing/equipe/", title: "Membre", back: "/marketing/equipe" },
  { prefix: "/marketing/ressources/", title: "Ressource", back: "/marketing/ressources" },
  // Réglages : une page par rubrique ; sur téléphone, « ← » ramène à la liste des rubriques.
  { prefix: "/marketing/reglages/general", title: "Général", back: "/marketing/reglages" },
  { prefix: "/marketing/reglages/equipe", title: "Équipe et accès", back: "/marketing/reglages" },
  { prefix: "/marketing/reglages/pipeline", title: "Pipeline", back: "/marketing/reglages" },
  { prefix: "/marketing/reglages/integrations", title: "Intégrations", back: "/marketing/reglages" },
  { prefix: "/marketing/reglages/import", title: "Import GoHighLevel", back: "/marketing/reglages" },
  { prefix: "/marketing/reglages", title: "Réglages", back: "/marketing/parametres" },
  { prefix: "/marketing/notifications", title: "Notifications", back: "/marketing/accueil" },
  { prefix: "/marketing/parametres", title: "Paramètres", back: "/marketing/accueil" },
  { prefix: "/marketing/compte", title: "Mon profil", back: "/marketing/parametres" },
  { prefix: "/marketing/taches", title: "Tâches", back: MARKETING_APPS_HREF },
  { prefix: "/marketing/kpi", title: "KPI", back: MARKETING_APPS_HREF },
  { prefix: "/marketing/acquisition", title: "Tableau de bord", back: MARKETING_APPS_HREF },
  { prefix: "/marketing/equipe", title: "Équipe", back: MARKETING_APPS_HREF },
  { prefix: "/marketing/ressources", title: "Ressources", back: MARKETING_APPS_HREF },
];

const matches = (pathname: string, prefix: string) => (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(prefix + "/"));
/** Onglets dont l'en-tête du téléphone montre un titre plutôt que l'espace (comme « Opportunités » dans LeadConnector). */
const TITLED_TABS: Record<string, string> = { "/marketing/crm": "Prospects" };

/**
 * Shell de l'espace Marketing : une application à part de Studio, au style LeadConnector.
 * - Ordinateur : la barre latérale noire (repliable en icônes, l'Accueil en tête) et une barre du haut (recherche, Applications,
 *   notifications, paramètres).
 * - Téléphone : en-tête « logo · IconFlow ▾ · Marketing » avec la cloche et les paramètres, onglets en bas
 *   (Accueil, Prospects, Rechercher, Calendrier, Applications), bouton + pour créer.
 *   Une page peut remplacer la cloche et l'engrenage par ses propres boutons (`MkHeaderActions`, ex. « Enregistrer »).
 * Le thème (police Inter, couleurs) vient de <html data-app="marketing">, posé avant le premier affichage.
 */
export function MarketingShell({ user, accountHref, spaces, allowedModules, badges, alerts, demo, roleLabel, children }: {
  user: MarketingShellUser; accountHref: string; spaces?: SpaceLink[]; allowedModules: string[]; badges: Record<string, number>;
  alerts: number; demo: boolean; roleLabel: string; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = React.useTransition();
  React.useEffect(() => { document.documentElement.dataset.app = "marketing"; }, []);
  const nav = React.useMemo(() => filterNav(marketingNav, allowedModules), [allowedModules]);
  const mainNav = React.useMemo(() => nav.map((g) => ({ ...g, items: g.items.filter((i) => !i.pinned) })).filter((g) => g.items.length), [nav]);
  const pinned = React.useMemo(() => nav.flatMap((g) => g.items).filter((i) => i.pinned), [nav]);
  const can = (m?: string) => !m || allowedModules.includes(m);
  const tabs: NavItem[] = React.useMemo(() => [...marketingTabs.filter((t) => can(t.module)).slice(0, 4), { href: MARKETING_APPS_HREF, label: "Applications", icon: LayoutGrid }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedModules]);
  const activeTab = tabs.find((t) => pathname === t.href)?.href ?? tabs.slice(0, -1).find((t) => isNavActive(pathname, t))?.href ?? MARKETING_APPS_HREF;
  const isRoot = tabs.some((t) => pathname === t.href);
  const sub = isRoot ? null : SUB_PAGES.find((p) => matches(pathname, p.prefix));
  const titled = isRoot ? TITLED_TABS[pathname] : undefined;
  const current = nav.flatMap((g) => g.items).filter((i) => isNavActive(pathname, i)).sort((a, b) => b.href.length - a.href.length)[0];
  const title = sub?.title ?? current?.label ?? (pathname === MARKETING_APPS_HREF ? "Applications" : pathname.startsWith("/marketing/rechercher") ? "Rechercher" : pathname.startsWith("/marketing/accueil") ? "Accueil" : "Marketing");

  // ⌘K : la recherche de Marketing (applications, prospects, contacts), comme le champ « Rechercher » de la barre du haut.
  // Ctrl + \ : replier / déplier la barre latérale. AltGr (Ctrl + Alt sous Windows) tape « \ » sur un clavier français : on le laisse passer.
  const [collapsed, setCollapsed] = useNavCollapsed();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.getModifierState?.("AltGraph")) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        const field = document.querySelector<HTMLInputElement>('main input[type="search"]');
        if (pathname.startsWith("/marketing/rechercher") && field) { field.focus(); field.select(); } else router.push("/marketing/rechercher");
      }
      if (e.key === "\\") { e.preventDefault(); setCollapsed(!collapsed); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed, pathname, router]);

  const bell = (size: string) => (
    <Link href="/marketing/notifications" aria-label={alerts ? `Notifications : ${alerts} à traiter` : "Notifications"} className={cn("relative inline-flex items-center justify-center rounded-full text-mk-text transition hover:bg-mk-chip", size)}>
      <Bell className="size-6" strokeWidth={1.7} />
      {alerts ? <span className="absolute right-[7px] top-[6px] size-2.5 rounded-full bg-mk-danger ring-2 ring-surface" /> : null}
    </Link>
  );
  const gear = (size: string, href = "/marketing/parametres", label = "Paramètres") => (
    <Link href={href} aria-label={label} className={cn("inline-flex items-center justify-center rounded-full text-mk-text transition hover:bg-mk-chip", size)}>
      <Settings className="size-6" strokeWidth={1.7} />
    </Link>
  );
  const workspace = (
    <span className="flex min-w-0 items-center gap-3 text-left">
      <Image src={LOGO} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full" priority />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[17px] font-semibold leading-tight text-mk-strong">IconFlow{spaces && spaces.length > 1 ? <ChevronDown className="size-[18px] text-mk-icon" strokeWidth={2} /> : null}</span>
        <span className="block truncate text-[13px] leading-tight text-mk-sub">{roleLabel}</span>
      </span>
    </span>
  );

  return (
    <div className="flex min-h-dvh bg-bg">
      <div className="no-print sticky top-0 hidden h-dvh shrink-0 lg:block">
        <Sidebar nav={mainNav} pinned={pinned} badges={badges} home="/marketing" user={user} accountHref={accountHref} appName="Marketing" logo={LOGO} spaces={spaces} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Ordinateur : barre du haut */}
        <header className="no-print sticky top-0 z-30 hidden h-14 items-center gap-3 border-b border-mk-line bg-surface/95 px-6 backdrop-blur-xl lg:flex">
          <span className="truncate text-[16px] font-semibold text-mk-strong">{title}</span>
          {demo ? <span className="inline-flex items-center gap-1.5 text-[12px] text-mk-sub"><Sparkles className="size-3 text-accent-2" />Projet de démonstration · données fictives</span> : null}
          <div className="ml-auto flex items-center gap-1">
            <Link href="/marketing/rechercher" className="mr-1 inline-flex h-9 w-60 items-center gap-2 rounded-lg border border-mk-input bg-surface px-3 text-[14px] text-mk-sub transition hover:border-accent/60" aria-label="Rechercher">
              <Search className="size-4" /><span className="flex-1">Rechercher</span><Kbd>⌘ K</Kbd>
            </Link>
            <Tooltip label="Applications" side="bottom">
              <Link href={MARKETING_APPS_HREF} aria-label="Applications" aria-current={pathname === MARKETING_APPS_HREF ? "page" : undefined}
                className={cn("inline-flex size-10 items-center justify-center rounded-full text-mk-text transition hover:bg-mk-chip", pathname === MARKETING_APPS_HREF && "bg-mk-pill text-mk-ink hover:bg-mk-pill")}>
                <LayoutGrid className="size-6" strokeWidth={1.7} />
              </Link>
            </Tooltip>
            {bell("size-10")}
            {gear("size-10")}
          </div>
        </header>
        {/* Téléphone : en-tête LeadConnector (espace, cloche, paramètres) ou « ← Titre » sur les pages sans onglet */}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 bg-surface px-4 shadow-[0_6px_10px_-10px_rgb(16_24_40/0.45)] lg:hidden">
          {sub ? (
            <>
              <Link href={sub.back} aria-label="Retour" className="-ml-1 inline-flex size-10 items-center justify-center rounded-full text-mk-icon transition hover:bg-mk-chip"><ArrowLeft className="size-6" strokeWidth={1.8} /></Link>
              <span className="min-w-0 flex-1 truncate text-[18px] font-semibold text-mk-strong">{title}</span>
            </>
          ) : titled ? (
            <span className="min-w-0 flex-1 truncate text-[22px] font-semibold text-mk-strong">{titled}</span>
          ) : spaces && spaces.length > 1 ? (
            <SpaceSwitcher spaces={spaces}><button type="button" aria-label="Changer d'espace" className="-ml-1 flex min-w-0 flex-1 rounded-xl p-1">{workspace}</button></SpaceSwitcher>
          ) : (
            <Link href="/marketing/accueil" className="flex min-w-0 flex-1">{workspace}</Link>
          )}
          <div id={MK_HEADER_SLOT} className="ml-auto flex shrink-0 items-center gap-1 empty:hidden" />
          <div className="mk-default-actions ml-auto flex shrink-0 items-center gap-1">
            {titled ? (
              <>
                <button type="button" onClick={() => startRefresh(() => router.refresh())} aria-label="Actualiser" className="inline-flex size-11 items-center justify-center rounded-full text-mk-text transition hover:bg-mk-chip">
                  <RefreshCw className={cn("size-[22px]", refreshing && "animate-spin")} strokeWidth={1.8} />
                </button>
                {can("marketing_reglages") ? gear("size-11", "/marketing/reglages/pipeline", "Réglages du pipeline") : gear("size-11")}
              </>
            ) : <>{bell("size-11")}{pathname.startsWith("/marketing/parametres") ? null : gear("size-11")}</>}
          </div>
        </header>
        {demo ? <p className="flex items-center gap-1.5 bg-mk-chip px-4 py-1.5 text-[12px] text-mk-sub lg:hidden"><Sparkles className="size-3 text-accent-2" />Projet de démonstration · données fictives</p> : null}

        <main id="main" className="flex-1 bg-surface px-4 pb-32 pt-4 lg:bg-bg lg:px-8 lg:pb-10 lg:pt-7">
          <div className="mx-auto w-full max-w-[1320px]">{children}</div>
        </main>
      </div>

      <Fab pathname={pathname} can={can} />

      {/* Téléphone : onglets du bas */}
      <nav aria-label="Navigation rapide" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-mk-line bg-surface pb-[max(env(safe-area-inset-bottom),8px)] pt-2 lg:hidden">
        <ul className="mx-auto flex max-w-[560px] items-stretch justify-around px-1">
          {tabs.map((t) => {
            const active = t.href === activeTab;
            return (
              <li key={t.href} className="min-w-0 flex-1">
                <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 pb-0.5 text-[12px] transition", active ? "font-semibold text-mk-ink" : "font-medium text-mk-text")}>
                  <span className={cn("flex h-8 w-16 items-center justify-center rounded-full transition", active ? "bg-mk-pill" : "active:bg-mk-chip")}><t.icon className="size-6" strokeWidth={1.7} /></span>
                  <span className="max-w-full truncate max-[359px]:text-[10px] max-[359px]:tracking-[-0.01em]">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Bouton + flottant (téléphone) sur les listes Prospects et Contacts : ouvre la page d'ajout. Les autres pages posent le leur (`MkFab`). */
function Fab({ pathname, can }: { pathname: string; can: (m?: string) => boolean }) {
  if (pathname === "/marketing/crm" && can("marketing_prospects")) return <MkFab href="/marketing/crm/nouveau" label="Ajouter un prospect" />;
  if (pathname === "/marketing/contacts" && can("marketing_contacts")) return <MkFab href="/marketing/contacts/nouveau" label="Ajouter un contact" />;
  return null;
}
