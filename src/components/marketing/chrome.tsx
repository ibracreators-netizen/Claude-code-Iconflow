"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Éléments d'interface que les pages Marketing posent dans le cadre commun :
 * - `MkHeaderActions` : boutons de l'en-tête du téléphone (« Enregistrer », corbeille…). Ils remplacent alors la cloche et l'engrenage.
 * - `MkFab` : le bouton + flottant du téléphone, au-dessus des onglets.
 */
export const MK_HEADER_SLOT = "mk-header-actions";

const noSubscribe = () => () => {};
export function MkHeaderActions({ children }: { children: React.ReactNode }) {
  // L'emplacement est rendu par le cadre commun, avant la page : il existe dès que la page s'affiche dans le navigateur.
  const slot = React.useSyncExternalStore(noSubscribe, () => document.getElementById(MK_HEADER_SLOT), () => null);
  return slot ? createPortal(children, slot) : null;
}

const FAB = "no-print fixed bottom-[calc(max(env(safe-area-inset-bottom),8px)+84px)] right-4 z-40 flex size-14 items-center justify-center rounded-[14px] bg-mk-fab text-mk-fab-fg shadow-[0_10px_24px_-8px_rgb(0_0_0/0.45)] transition active:scale-95 lg:hidden";

export function MkFab({ href, onClick, label, className }: { href?: string; onClick?: () => void; label: string; className?: string }) {
  const icon = <Plus className="size-7" strokeWidth={2} />;
  if (href) return <Link href={href} aria-label={label} className={cn(FAB, className)}>{icon}</Link>;
  return <button type="button" onClick={onClick} aria-label={label} className={cn(FAB, className)}>{icon}</button>;
}
