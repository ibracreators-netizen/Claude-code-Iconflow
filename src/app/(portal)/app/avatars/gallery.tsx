"use client";
import * as React from "react";
import { Check, UserRound } from "lucide-react";
import { SegmentedControl } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useAction } from "@/lib/hooks/use-action";
import { toggleAvatar } from "@/lib/actions/portal";
import type { Avatar as AvatarT } from "@/lib/data/types";

export function AvatarGallery({ avatars }: { avatars: AvatarT[] }) {
  const [filter, setFilter] = React.useState<"all" | "chosen">("all");
  const { exec, pending } = useAction();
  const rows = avatars.filter((a) => filter === "all" || a.chosen);
  return (
    <div>
      <div className="mb-4"><SegmentedControl value={filter} onChange={setFilter} options={[{ value: "all", label: "Tous", count: avatars.length }, { value: "chosen", label: "Mes choix", count: avatars.filter((a) => a.chosen).length }]} /></div>
      {rows.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((a) => (
            <li key={a.id} className={`card overflow-hidden transition ${a.chosen ? "ring-1 ring-accent/50" : ""}`}>
              <div className="relative aspect-[4/5] bg-surface-2">
                {a.preview_url ? <Image src={a.preview_url} alt={`Portrait de ${a.name}`} fill unoptimized sizes="(max-width: 640px) 50vw, 20vw" className="object-cover" /> : <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>}
                {a.chosen ? <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-accent text-accent-fg shadow"><Check className="size-3.5" /></span> : null}
              </div>
              <div className="p-3"><p className="truncate text-[13.5px] font-medium">{a.name}</p><Button size="sm" variant={a.chosen ? "secondary" : "primary"} className="mt-2 w-full" disabled={pending} onClick={() => exec(() => toggleAvatar(a.id), { success: a.chosen ? "Avatar retiré de vos choix." : "Avatar retenu." })}>{a.chosen ? "Retirer" : "Retenir"}</Button></div>
            </li>
          ))}
        </ul>
      ) : <p className="py-10 text-center text-[13px] text-muted">Vous n&apos;avez pas encore retenu d&apos;avatar.</p>}
    </div>
  );
}
