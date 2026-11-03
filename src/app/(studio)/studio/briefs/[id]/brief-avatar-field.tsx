"use client";
import * as React from "react";
import { Check, FolderOpen, ImageIcon, Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAvatarImages, shareBriefAvatarImage } from "@/lib/actions/avatars";
import { AVATAR_FOLDER, isStoredImagePath } from "@/lib/avatar-image";
import { cn } from "@/lib/utils";

type Pickable = { id: string; name: string; path: string; url: string | null };

/**
 * Champ « Avatar » d'un concept vidéo. Chaque entrée est une image choisie dans Fichiers › Avatars du client
 * (le brief garde son chemin, signé à chaque affichage : aucun lien public) ou un lien HTTPS.
 * Sans le module Fichiers, seuls les liens sont proposés.
 */
export function BriefAvatarField({ clientId, items, onChange, canUseFiles = true }: {
  clientId: string;
  items: string[];
  onChange: (items: string[]) => void;
  canUseFiles?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [listing, setListing] = React.useState<{ clientId: string; files: Pickable[]; error: string | null } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const hasStored = items.some((x) => isStoredImagePath(x));

  // Dossier Avatars (aperçus signés 1 h) : chargé à l'ouverture du sélecteur, ou dès qu'une image du dossier est citée.
  React.useEffect(() => {
    if (!canUseFiles || !clientId || listing?.clientId === clientId || !(open || hasStored)) return;
    let alive = true;
    listAvatarImages(clientId)
      .then((res) => { if (alive) setListing({ clientId, files: res.ok ? res.data : [], error: res.ok ? null : res.error }); })
      .catch(() => { if (alive) setListing({ clientId, files: [], error: "Chargement du dossier impossible. Réessaie dans un instant." }); });
    return () => { alive = false; };
  }, [canUseFiles, clientId, listing?.clientId, open, hasStored]);
  const listed = listing?.clientId === clientId ? listing : null;
  const byPath = React.useMemo(() => new Map((listed?.files ?? []).map((f) => [f.path, f])), [listed]);

  // L'image est d'abord partagée avec le client (sans quoi ni son espace ni le lien public ne l'affichent), puis ajoutée.
  const pick = async (f: Pickable) => {
    if (items.includes(f.path)) { setOpen(false); return; }
    setBusy(f.path); setError(null);
    try {
      const res = await shareBriefAvatarImage(clientId, f.path);
      if (!res.ok) { setError(res.error); return; }
      onChange([...items.filter((x) => x.trim()), res.data.path]);
      setOpen(false);
    } catch {
      setError("Ajout impossible. Réessaie dans un instant.");
    } finally {
      setBusy(null);
    }
  };
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <span className="text-[13px] font-medium text-fg-2">Avatar</span>
        <span className="text-xs text-muted sm:text-right">{canUseFiles ? `Image(s) de Fichiers › ${AVATAR_FOLDER}, ou lien(s) de photo(s).` : "Lien(s) de photo(s) de l'avatar."}</span>
      </div>

      {items.length ? (
        <ol className="space-y-2">
          {items.map((it, i) => {
            const stored = isStoredImagePath(it);
            const file = stored ? byPath.get(it) : undefined;
            return (
              <li key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-2">{String(i + 1).padStart(2, "0")}</span>
                {stored ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border px-2 py-1.5">
                    <span className="relative block h-12 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- aperçu signé (1 h) */}
                      {file?.url ? <img src={file.url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="absolute inset-0 m-auto size-4 text-muted" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-fg">{file?.name ?? it.split("/").pop()}</span>
                      <span className="block text-[11.5px] text-muted">Fichiers › {AVATAR_FOLDER} · privée, signée à l&apos;affichage</span>
                    </span>
                  </div>
                ) : (
                  <Input value={it} placeholder="https://… (photo de l'avatar)" onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
                )}
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Retirer" onClick={() => remove(i)}><Trash2 /></Button>
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        {canUseFiles ? (
          <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => { setOpen((o) => !o); setError(null); }}>
            <FolderOpen />Choisir dans Fichiers › {AVATAR_FOLDER}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...items, ""])}><Link2 />Ajouter un lien</Button>
      </div>

      {open ? (
        <div className="rounded-xl border border-border p-2.5">
          {!listed ? (
            <p className="flex items-center gap-2 py-4 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" />Chargement du dossier {AVATAR_FOLDER}…</p>
          ) : listed.error ? (
            <p className="py-2 text-[13px] text-danger">{listed.error}</p>
          ) : listed.files.length ? (
            <ul className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {listed.files.map((f) => {
                const chosen = items.includes(f.path);
                return (
                  <li key={f.id}>
                    <button type="button" title={f.name} aria-pressed={chosen} disabled={!!busy} onClick={() => void pick(f)}
                      className={cn("group block w-full overflow-hidden rounded-lg border text-left transition disabled:opacity-60", chosen ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50")}>
                      <span className="relative block aspect-[4/5] bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- aperçu signé (1 h) */}
                        {f.url ? <img src={f.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <FolderOpen className="absolute inset-0 m-auto size-5 text-muted" />}
                        {busy === f.path ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-surface/60"><Loader2 className="size-5 animate-spin text-accent-2" /></span>
                        ) : chosen ? (
                          <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow"><Check className="size-3" /></span>
                        ) : null}
                      </span>
                      <span className="block truncate px-1.5 py-1 text-[11px] text-fg-2">{f.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-[13px] text-muted">
              Aucune image dans Fichiers › {AVATAR_FOLDER} pour ce client.
            </p>
          )}
          <p className="mt-2 text-[11.5px] text-muted">L&apos;image choisie est partagée avec le client : elle apparaît dans son espace et sur le lien public du brief, par un lien signé valable 1 h, jamais par un lien permanent.</p>
        </div>
      ) : null}
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
    </div>
  );
}
