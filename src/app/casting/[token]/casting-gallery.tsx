"use client";
import * as React from "react";
import { Check, Clock, RotateCcw, UserRound, X } from "lucide-react";
import { ImageZoom } from "@/components/shared/image-zoom";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/hooks/use-action";
import { castingArchive, castingChoose, castingRestore } from "@/lib/actions/public-casting";
import { AVATAR_ARCHIVE_DAYS, type Avatar as AvatarT } from "@/lib/data/types";

function daysLeft(archivedAt: string): number {
  const t = Date.parse(archivedAt);
  if (Number.isNaN(t)) return AVATAR_ARCHIVE_DAYS;
  return Math.max(0, Math.ceil((t + AVATAR_ARCHIVE_DAYS * 86400000 - Date.now()) / 86400000));
}

/** Casting partagé (lien public) : le client choisit / écarte les avatars, sans se connecter. */
export function CastingGallery({ token, avatars }: { token: string; avatars: AvatarT[] }) {
  const { exec, pending } = useAction();
  const active = avatars.filter((a) => !a.archived_at);
  const archived = avatars.filter((a) => !!a.archived_at);

  return (
    <div className="space-y-8">
      {active.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {active.map((a) => (
            <li key={a.id} className={`card overflow-hidden ${a.chosen ? "ring-1 ring-accent/50" : ""}`}>
              <div className="relative aspect-[4/5] bg-surface-2">
                {a.preview_url ? <ImageZoom src={a.preview_url} alt={`Portrait de ${a.name}`} sizes="(max-width: 640px) 50vw, 25vw" thumbClassName="object-cover" /> : <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>}
                {a.chosen ? <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg shadow"><Check className="size-3" />Retenu</span> : null}
              </div>
              <div className="p-3">
                <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" variant={a.chosen ? "secondary" : "primary"} className="min-w-0 flex-1" disabled={pending || a.chosen} onClick={() => exec(() => castingChoose(token, a.id), { success: "Avatar retenu." })}>{a.chosen ? <><Check />Choisi</> : "Choisir"}</Button>
                  <Button size="icon-sm" variant="ghost" className="shrink-0 text-muted hover:text-danger" disabled={pending} aria-label="Ne pas choisir" title="Ne pas choisir" onClick={() => exec(() => castingArchive(token, a.id), { success: `Avatar écarté — supprimé dans ${AVATAR_ARCHIVE_DAYS} jours, sauf restauration.` })}><X /></Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="py-10 text-center text-[13px] text-muted">Aucun avatar à choisir pour l&apos;instant.</p>}

      {archived.length ? (
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-fg-2"><X className="size-4 text-danger" />Écartés</h2>
          <p className="mb-3 text-[12.5px] text-muted">Conservés {AVATAR_ARCHIVE_DAYS} jours, puis supprimés. Vous pouvez les restaurer avant.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {archived.map((a) => {
              const left = daysLeft(a.archived_at!);
              return (
                <li key={a.id} className="card overflow-hidden opacity-80">
                  <div className="relative aspect-[4/5] bg-surface-2">
                    {a.preview_url ? <ImageZoom src={a.preview_url} alt={`Portrait de ${a.name}`} sizes="(max-width: 640px) 50vw, 25vw" thumbClassName="object-cover grayscale" /> : <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>}
                    <span className="pointer-events-none absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-danger text-white shadow"><X className="size-3.5" /></span>
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[11px] font-medium text-white"><Clock className="size-3" />{left > 0 ? `Supprimé dans ${left} j` : "Suppression imminente"}</span>
                  </div>
                  <div className="p-3"><p className="truncate text-[13.5px] font-medium">{a.name}</p><Button size="sm" variant="secondary" className="mt-2 w-full" disabled={pending} onClick={() => exec(() => castingRestore(token, a.id), { success: "Avatar restauré." })}><RotateCcw />Restaurer</Button></div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
