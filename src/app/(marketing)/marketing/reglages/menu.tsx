"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD } from "./kit";
import { isSectionActive, reglagesSections, SECTION_GROUPS, type SectionFlags } from "./sections";

/**
 * Ordinateur : le menu des Réglages, à gauche (comme le menu « Paramètres » de LeadConnector).
 * Titre « Réglages », rubriques groupées avec leur icône ; la rubrique ouverte est surlignée en vert d'eau.
 */
export function ReglagesMenu({ flags }: { flags: SectionFlags }) {
  const pathname = usePathname();
  const sections = reglagesSections(flags);
  return (
    <nav aria-label="Rubriques des réglages" className={cn(CARD, "px-3 pb-3 pt-4")}>
      <p className="px-2.5 text-[18px] font-semibold leading-7 text-mk-strong">Réglages</p>
      {SECTION_GROUPS.map((g) => {
        const items = sections.filter((s) => s.group === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className="mt-4">
            <p className="px-2.5 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-mk-sub">{g.title}</p>
            <ul className="space-y-0.5">
              {items.map((s) => {
                const active = isSectionActive(pathname, s);
                return (
                  <li key={s.key}>
                    <Link href={s.href} aria-current={active ? "page" : undefined}
                      className={cn("flex min-h-10 items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14px] leading-5 transition",
                        active ? "bg-mk-pill font-semibold text-mk-ink" : "font-medium text-mk-text hover:bg-mk-chip hover:text-mk-strong")}>
                      <s.icon className={cn("size-[18px] shrink-0", active ? "text-mk-ink" : "text-mk-icon")} strokeWidth={1.8} aria-hidden />
                      <span className="min-w-0 flex-1">{s.label}</span>
                      {s.leaves ? <ArrowUpRight className="size-4 shrink-0 text-mk-icon" strokeWidth={1.8} aria-label="(ouvre une autre page)" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
