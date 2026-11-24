"use client";
import * as React from "react";
import { MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fondu du bord droit tant qu'il reste des colonnes à droite : un nombre coupé par le bord s'efface au lieu de se lire faux (« 10 0 »). */
const fade = (stickyRight: number) => (stickyRight
  ? `linear-gradient(to left, #000 0, #000 ${stickyRight}px, transparent ${stickyRight}px, #000 ${stickyRight + 48}px)`
  : "linear-gradient(to left, transparent 0, #000 48px)");

/*
 * Tableau large qui défile dans sa carte, avec l'indice « Fais glisser » (téléphone) ou « Fais défiler » (ordinateur)
 * affiché seulement quand le tableau dépasse vraiment, et un fondu à droite tant qu'il reste des colonnes à voir.
 * Avant la mesure (premier affichage), l'indice suit l'ancienne règle : visible sur téléphone, caché sur ordinateur.
 * Une dernière colonne collée à droite (corbeille) est mesurée et laissée nette.
 */
export function ScrollArea({ children, className, hintClassName }: { children: React.ReactNode; className?: string; hintClassName?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [over, setOver] = React.useState<boolean | null>(null);
  const [atEnd, setAtEnd] = React.useState(false);
  const [stickyRight, setStickyRight] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setOver(el.scrollWidth > el.clientWidth + 1);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
      const last = el.querySelector("thead tr > :last-child");
      setStickyRight(last && getComputedStyle(last).position === "sticky" ? Math.round(last.getBoundingClientRect().width) : 0);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, []);
  const mask = over && !atEnd ? fade(stickyRight) : undefined;
  return (
    <>
      <p className={cn("flex items-center gap-1.5 px-4 pb-2.5 text-[12.5px] text-mk-sub lg:px-5", hintClassName, over === null ? "lg:hidden" : !over && "hidden")}>
        <MoveHorizontal className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
        <span className="lg:hidden">Fais glisser pour voir toutes les colonnes.</span>
        <span className="hidden lg:inline">Fais défiler vers la droite pour voir toutes les colonnes.</span>
      </p>
      <div ref={ref} className={cn("overflow-x-auto", className)} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>{children}</div>
    </>
  );
}
