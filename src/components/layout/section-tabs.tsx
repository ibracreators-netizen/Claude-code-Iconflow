import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { canAccess, type ModuleKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { SECTION_TABS, type SectionKey } from "./nav";

/**
 * Onglets des pages regroupées sous une même entrée de menu (ex. Clients : Liste / Pipeline).
 * Un onglet n'apparaît que si le compte a droit à sa page ; avec un seul onglet permis, rien ne s'affiche.
 */
export async function SectionTabs({ section, current, counts = {} }: { section: SectionKey; current: string; counts?: Record<string, number> }) {
  const session = await getSession();
  if (!session) return null;
  const tabs = SECTION_TABS[section].filter((t) => canAccess(session.profile, t.module as ModuleKey));
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Vues de cette section" className="mb-5 flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.href === current, n = counts[t.href];
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition", active ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg")}>
            {t.label}{n ? <span className="rounded-full bg-brand px-1.5 text-[10.5px] font-semibold leading-4 text-[#06220f]">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
