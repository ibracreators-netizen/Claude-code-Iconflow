"use client";
import * as React from "react";
import Image from "next/image";
import { Archive, Check, Clock, RotateCcw, UserRound, X } from "lucide-react";
import { SegmentedControl } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/hooks/use-action";
import { archiveAvatar, chooseAvatar, restoreAvatar } from "@/lib/actions/portal";
import { AVATAR_ARCHIVE_DAYS, type Avatar as AvatarT } from "@/lib/data/types";

/** Jours restants avant la suppression définitive d'un avatar archivé. */
function daysLeft(archivedAt: string): number {
  const t = Date.parse(archivedAt);
  if (Number.isNaN(t)) return AVATAR_ARCHIVE_DAYS;
  return Math.max(0, Math.ceil((t + AVATAR_ARCHIVE_DAYS * 86400000 - Date.now()) / 86400000));
}

export function AvatarGallery({ avatars }: { avatars: AvatarT[] }) {
  const { exec, pending } = useAction();
  const [filter, setFilter] = React.useState<"all" | "chosen">("all");
  const active = avatars.filter((a) => !a.archived_at);
  const archived = avatars.filter((a) => !!a.archived_at);
  const rows = filter === "chosen" ? active.filter((a) => a.chosen) : active;

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4"><SegmentedControl value={filter} onChange={setFilter} options={[{ value: "all", label: "À choisir", count: active.length }, { value: "chosen", label: "Choisis", count: active.filter((a) => a.chosen).length }]} /></div>
        {rows.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map((a) => (
              <li key={a.id} className={`card overflow-hidden transition ${a.chosen ? "ring-1 ring-accent/50" : ""}`}>
                <div className="relative aspect-[4/5] bg-surface-2">
                  {a.preview_url ? <Image src={a.preview_url} alt={`Portrait de ${a.name}`} fill unoptimized sizes="(max-width: 640px) 50vw, 20vw" className="object-cover" /> : <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>}
                  {a.chosen ? <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-accent text-accent-fg shadow"><Check className="size-3.5" /></span> : null}
                </div>
                <div className="p-3">
                  <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" variant={a.chosen ? "secondary" : "primary"} className="min-w-0 flex-1" disabled={pending || a.chosen} onClick={() => exec(() => chooseAvatar(a.id), { success: "Avatar retenu." })}>{a.chosen ? <><Check />Choisi</> : "Choisir"}</Button>
                    <Button size="icon-sm" variant="ghost" className="shrink-0 text-muted hover:text-danger" disabled={pending} aria-label="Ne pas choisir" title="Ne pas choisir" onClick={() => exec(() => archiveAvatar(a.id), { success: `Avatar écarté — supprimé dans ${AVATAR_ARCHIVE_DAYS} jours, sauf restauration.` })}><X /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="py-10 text-center text-[13px] text-muted">{filter === "chosen" ? "Vous n'avez pas encore choisi d'avatar." : "Aucun avatar à choisir pour l'instant."}</p>}
      </div>

      {archived.length ? (
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-fg-2"><Archive className="size-4 text-muted" />Archivés</h2>
          <p className="mb-3 text-[12.5px] text-muted">Les avatars non choisis sont conservés {AVATAR_ARCHIVE_DAYS} jours, puis supprimés définitivement. Vous pouvez les restaurer avant.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {archived.map((a) => {
              const left = daysLeft(a.archived_at!);
              return (
                <li key={a.id} className="card overflow-hidden opacity-80">
                  <div className="relative aspect-[4/5] bg-surface-2">
                    {a.preview_url ? <Image src={a.preview_url} alt={`Portrait de ${a.name}`} fill unoptimized sizes="(max-width: 640px) 50vw, 20vw" className="object-cover grayscale" /> : <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>}
                    <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-danger text-white shadow" title="Non choisi"><X className="size-3.5" /></span>
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[11px] font-medium text-white"><Clock className="size-3" />{left > 0 ? `Supprimé dans ${left} j` : "Suppression imminente"}</span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                    <Button size="sm" variant="secondary" className="mt-2 w-full" disabled={pending} onClick={() => exec(() => restoreAvatar(a.id), { success: "Avatar restauré." })}><RotateCcw />Restaurer</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
