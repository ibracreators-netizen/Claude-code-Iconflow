"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from "@/components/ui/dropdown";

/** Un espace de l'app (Studio, Marketing). */
export interface SpaceLink { label: string; href: string; active: boolean }

/**
 * Changer d'espace. Studio et Marketing sont deux applications séparées (chacune son style, sa barre, son icône
 * sur le téléphone) : on y passe par un vrai chargement de page, jamais par une navigation interne.
 */
export function SpaceSwitcher({ spaces, children, align = "start", side = "bottom" }: { spaces: SpaceLink[]; children: React.ReactNode; align?: "start" | "end"; side?: "bottom" | "right" }) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>{children}</DropdownTrigger>
      <DropdownContent align={align} side={side} className="w-60">
        <DropdownLabel>Ibra Group · espaces</DropdownLabel>
        {spaces.map((sp) => (
          <DropdownItem key={sp.href} asChild>
            {/* Lien classique (rechargement) : l'autre espace a son propre thème et sa propre barre. */}
            <a href={sp.href} aria-current={sp.active ? "page" : undefined} className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-[12px] font-semibold text-fg-2">{sp.label.slice(0, 1)}</span>
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium text-fg">IconFlow {sp.label}</span></span>
              {sp.active ? <Check className="!size-4 !text-accent-2" /> : null}
            </a>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
