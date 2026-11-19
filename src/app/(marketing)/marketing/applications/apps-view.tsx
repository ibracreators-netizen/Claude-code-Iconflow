"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { MkCard, MkEmpty, MkRoundGrid, MkRoundLink, MkSearchField } from "@/components/marketing/ui";
import { MK_ICONS } from "@/components/marketing/mk-icon";
import type { MkIconKey } from "@/lib/marketing/apps";

export interface AppsGroup { key: string; title: string; apps: Array<{ key: string; label: string; href: string; icon: MkIconKey; words: string }> }

/** Sans accents ni majuscules : « equipe » trouve « Équipe ». */
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Un mot trop long pour sa case (« Automatisations ») reçoit des coupures conditionnelles entre syllabes
 * (voyelle | consonne + voyelle) : s'il ne tient pas, il passe à la ligne avec un trait d'union au lieu d'être tronqué.
 */
const SOFT_HYPHEN = String.fromCharCode(0xad);
const SYLLABLE = /([aeiouyàâäéèêëîïôöûüù])(?=[^aeiouyàâäéèêëîïôöûüù\s-][aeiouyàâäéèêëîïôöûüù])/gi;
const soften = (label: string) => label.split(" ").map((w) => (w.length > 12 ? w.replace(SYLLABLE, `$1${SOFT_HYPHEN}`) : w)).join(" ");

/**
 * Grille des applications : recherche collée en haut, une carte par famille, icônes rondes cerclées
 * (4 par ligne sur téléphone, 6 puis 8 sur grand écran). La recherche masque les familles vides.
 */
export function AppsView({ groups }: { groups: AppsGroup[] }) {
  const [q, setQ] = React.useState("");
  const words = norm(q).split(/\s+/).filter(Boolean);
  const shown = words.length
    ? groups.map((g) => ({ ...g, apps: g.apps.filter((a) => { const hay = norm(`${a.label} ${a.words} ${g.title}`); return words.every((w) => hay.includes(w)); }) })).filter((g) => g.apps.length)
    : groups;

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {/* Collée sous l'en-tête, avec un fond qui masque les cartes qui défilent dessous
          (sur ordinateur, son bord haut glisse sous la barre du haut : l'écart reste de 16 px ; elle déborde un peu sur les côtés pour cacher l'ombre des cartes). */}
      <div className="sticky top-16 z-20 -mx-4 -mt-4 bg-surface px-4 pb-4 pt-4 lg:top-11 lg:-mx-3 lg:-mt-7 lg:bg-bg lg:px-3 lg:pb-5 lg:pt-7">
        <MkSearchField icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher des applications" aria-label="Rechercher des applications" autoComplete="off" enterKeyHint="search" />
      </div>
      {shown.length ? (
        <div className="space-y-4">
          {shown.map((g) => (
            <MkCard key={g.key} title={g.title} bodyClassName="pb-3 pt-4">
              <MkRoundGrid>
                {g.apps.map((a) => <MkRoundLink key={a.key} href={a.href} icon={MK_ICONS[a.icon]} label={soften(a.label)} />)}
              </MkRoundGrid>
            </MkCard>
          ))}
        </div>
      ) : (
        <MkEmpty>Aucune application ne correspond à «&nbsp;{q.trim()}&nbsp;».</MkEmpty>
      )}
    </div>
  );
}
