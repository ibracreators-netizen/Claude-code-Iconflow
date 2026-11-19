"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, ChevronsUpDown, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { useNavCollapsed } from "@/lib/hooks/use-local-pref";
import { isNavActive, type NavGroup, type NavItem } from "./nav";
import { SpaceSwitcher, type SpaceLink } from "./space-switcher";

export interface SidebarUser { name: string; email: string; avatar?: string | null }

/**
 * Barre latérale unique, noire, pleine hauteur (Studio et Marketing).
 * Repliée : les icônes seules, centrées, avec le nom de la page au survol. Dépliée : chaque page sur une ligne,
 * l'icône devant le texte, et des titres de section. Elle ne se transforme jamais en pastille flottante.
 * Le repli est piloté par <html data-nav="collapsed"> (posé avant le premier affichage) : aucun saut au chargement.
 * Pour déplier : survoler le logo (il devient le bouton « déplier »), ou Ctrl/Cmd + \. Pour replier : le bouton à droite du nom.
 * Dans le tiroir du téléphone (`mobile`), elle est toujours dépliée.
 */
export function Sidebar({ nav, pinned, badges = {}, home, user, accountHref, appName, logo = "/brand/iconflow-logo-96.png", spaces, mobile = false }: {
  nav: NavGroup[]; pinned: NavItem[]; badges?: Record<string, number>; home: string; user: SidebarUser; accountHref: string;
  appName: string; logo?: string; spaces?: SpaceLink[]; mobile?: boolean;
}) {
  const pathname = usePathname();
  const [collapsedState, setCollapsed] = useNavCollapsed();
  const collapsed = !mobile && collapsedState;
  // Classes appliquées seulement quand la barre est repliée, et seulement sur ordinateur (le tiroir reste déplié).
  const c = (cls: string) => (mobile ? "" : cls);
  // La liste défile sans barre visible : un dégradé en haut et en bas signale qu'il reste des pages cachées.
  const listRef = React.useRef<HTMLElement>(null);
  const [more, setMore] = React.useState({ up: false, down: false });
  React.useEffect(() => {
    const el = listRef.current; if (!el) return;
    const check = () => {
      const up = el.scrollTop > 1, down = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setMore((m) => (m.up === up && m.down === down ? m : { up, down }));
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, [collapsed]);

  const row = (item: NavItem) => {
    const active = isNavActive(pathname, item);
    const count = item.badgeKey ? badges[item.badgeKey] : undefined;
    const link = (
      <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={collapsed ? item.label : undefined}
        className={cn("group/it relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium transition-colors",
          c("lg:nav-collapsed:mx-auto lg:nav-collapsed:size-11 lg:nav-collapsed:justify-center lg:nav-collapsed:px-0"),
          active ? "bg-side-active text-white" : "text-side-fg-2 hover:bg-side-hover hover:text-white")}>
        <item.icon className={cn("size-[19px] shrink-0 transition-colors", active ? "text-side-accent" : "text-side-muted group-hover/it:text-white")} strokeWidth={1.8} />
        <span className={cn("min-w-0 flex-1 truncate", c("lg:nav-collapsed:hidden"))}>{item.label}</span>
        {count ? (
          <span className={cn("rounded-full bg-side-accent px-1.5 text-[11px] font-semibold leading-5 text-black tabular",
            c("lg:nav-collapsed:absolute lg:nav-collapsed:-right-1 lg:nav-collapsed:-top-1 lg:nav-collapsed:h-4 lg:nav-collapsed:min-w-4 lg:nav-collapsed:px-1 lg:nav-collapsed:text-center lg:nav-collapsed:text-[10px] lg:nav-collapsed:leading-4"))}>{count}</span>
        ) : null}
      </Link>
    );
    return <li key={item.href}>{collapsed ? <Tooltip label={item.label} side="right">{link}</Tooltip> : link}</li>;
  };

  const switcher = spaces && spaces.length > 1 ? (
    <SpaceSwitcher spaces={spaces} side={collapsed ? "right" : "bottom"}>
      <button type="button" aria-label="Changer d'espace"
        className={cn("flex h-10 w-full items-center gap-2.5 rounded-[10px] border border-side-line px-2.5 text-left text-[13px] font-medium text-side-fg-2 transition hover:bg-side-hover hover:text-white",
          c("lg:nav-collapsed:mx-auto lg:nav-collapsed:size-11 lg:nav-collapsed:justify-center lg:nav-collapsed:px-0"))}>
        <ArrowLeftRight className="size-4 shrink-0 text-side-muted" strokeWidth={1.8} />
        <span className={cn("min-w-0 flex-1 truncate", c("lg:nav-collapsed:hidden"))}>{spaces.find((s) => s.active)?.label ?? appName}</span>
        <ChevronsUpDown className={cn("size-3.5 shrink-0 text-side-muted", c("lg:nav-collapsed:hidden"))} />
      </button>
    </SpaceSwitcher>
  ) : null;

  return (
    <aside aria-label="Navigation" className={cn("flex h-full flex-col bg-side text-side-fg",
      mobile ? "w-[284px]" : "w-[252px] border-r border-side-line transition-[width] duration-200 ease-out lg:nav-collapsed:w-[76px]")}>
      {/* En-tête : logo, nom de l'app, bouton pour replier / déplier */}
      <div className={cn("flex shrink-0 items-center gap-2.5 px-4 pb-3 pt-4", c("lg:nav-collapsed:justify-center lg:nav-collapsed:px-0"))}>
        <div className="group/logo relative shrink-0">
          <Link href={home} aria-label="Accueil" className="block overflow-hidden rounded-[11px] ring-1 ring-side-line">
            <Image src={logo} alt="" width={36} height={36} className={cn("size-9 transition-opacity", c("lg:nav-collapsed:group-hover/logo:opacity-0"))} priority />
          </Link>
          {/* Barre repliée : au survol, le logo devient le bouton « déplier » (un toucher suffit sur tablette). */}
          {mobile ? null : (
            <Tooltip label={"Déplier le menu (Ctrl + \\)"} side="right">
              <button type="button" onClick={() => setCollapsed(false)} aria-label="Déplier le menu"
                className="absolute inset-0 hidden items-center justify-center rounded-[11px] bg-side-hover text-white opacity-0 ring-1 ring-side-line transition-opacity focus-visible:opacity-100 lg:nav-collapsed:flex lg:nav-collapsed:group-hover/logo:opacity-100">
                <PanelLeftOpen className="size-[18px]" strokeWidth={1.8} />
              </button>
            </Tooltip>
          )}
        </div>
        <div className={cn("min-w-0 flex-1 leading-tight", c("lg:nav-collapsed:hidden"))}>
          <div className="text-[18px] font-semibold tracking-[-0.02em] text-white">iconflow<span className="text-side-accent">.</span></div>
          <div className="truncate text-[12px] text-side-muted">{appName}</div>
        </div>
        {mobile ? null : (
          <Tooltip label={"Replier le menu (Ctrl + \\)"} side="right">
            <button type="button" onClick={() => setCollapsed(true)} aria-label="Replier le menu" aria-expanded={!collapsedState}
              className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-side-muted transition hover:bg-side-hover hover:text-white lg:nav-collapsed:hidden">
              <PanelLeftClose className="size-[18px]" strokeWidth={1.8} />
            </button>
          </Tooltip>
        )}
      </div>
      {switcher ? <div className={cn("shrink-0 px-3 pb-2", c("lg:nav-collapsed:px-2"))}>{switcher}</div> : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
      <nav ref={listRef} className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", c("lg:nav-collapsed:px-2"))} aria-label="Navigation principale">
        <div>
        {nav.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && (group.label ? "mt-4" : "mt-3"), c(gi > 0 ? "lg:nav-collapsed:mt-2" : ""))}>
            {group.label ? <div className={cn("px-3 pb-1.5 text-[12px] font-semibold text-side-muted", c("lg:nav-collapsed:hidden"))}>{group.label}</div> : null}
            {/* Groupe titré : un trait seulement replié. Groupe sans titre (Marketing, comme LeadConnector) : un trait toujours. */}
            {gi > 0 ? (group.label
              ? <div className={cn("mx-auto mb-2 hidden h-px w-8 bg-side-line", c("lg:nav-collapsed:block"))} aria-hidden />
              : <div className={cn("mx-3 mb-3 h-px bg-side-line", c("lg:nav-collapsed:mx-auto lg:nav-collapsed:mb-2 lg:nav-collapsed:w-8"))} aria-hidden />) : null}
            <ul className="space-y-0.5" aria-label={group.label}>{group.items.map(row)}</ul>
          </div>
        ))}
        </div>
      </nav>
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-8 bg-linear-to-b from-side to-transparent transition-opacity duration-200", more.up ? "opacity-100" : "opacity-0")} />
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-side to-transparent transition-opacity duration-200", more.down ? "opacity-100" : "opacity-0")} />
      </div>

      <div className={cn("shrink-0 border-t border-side-line px-3 py-3", c("lg:nav-collapsed:px-2"))}>
        {pinned.length ? <ul className="mb-2 space-y-0.5">{pinned.map(row)}</ul> : null}
        <div className={cn("flex items-center gap-1", c("lg:nav-collapsed:justify-center"))}>
          <Link href={accountHref} aria-label="Mon compte" className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-[10px] p-1.5 transition hover:bg-side-hover", c("lg:nav-collapsed:flex-none lg:nav-collapsed:p-0.5"))}>
            <Avatar name={user.name} src={user.avatar} size={34} className="!bg-[#e9efe6] !text-[#1b261a]" />
            <span className={cn("min-w-0 flex-1", c("lg:nav-collapsed:hidden"))}>
              <span className="block truncate text-[13.5px] font-semibold text-white">{user.name}</span>
              <span className="block truncate text-[12px] text-side-muted">{user.email}</span>
            </span>
          </Link>
          <form action="/auth/signout" method="post" className={c("lg:nav-collapsed:hidden")}>
            <button type="submit" aria-label="Se déconnecter" title="Se déconnecter" className="rounded-[9px] p-2 text-side-muted transition hover:bg-side-hover hover:text-[#ff8a8a]"><LogOut className="size-4" /></button>
          </form>
        </div>
      </div>
    </aside>
  );
}
