import type { Profile } from "@/lib/data/types";
import { canAccessSpace } from "@/lib/permissions";
import type { SpaceLink } from "@/components/layout/app-shell";

/** Liens du commutateur « Ibra Group ». Marketing n'apparaît que si le membre y a accès. */
export function spaceLinks(profile: Pick<Profile, "role" | "permissions">, active: "studio" | "marketing"): SpaceLink[] | undefined {
  if (!canAccessSpace(profile, "marketing")) return undefined; // membre Studio seulement : aucun changement visible
  return [
    { label: "Studio", href: "/studio", active: active === "studio" },
    { label: "Marketing", href: "/marketing", active: active === "marketing" },
  ];
}
