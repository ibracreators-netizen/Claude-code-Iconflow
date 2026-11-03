"use client";
import * as React from "react";
import Image from "next/image";
import { Check, FolderOpen, Link2, Loader2, UploadCloud, X } from "lucide-react";
import { SegmentedControl } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { listAvatarImages } from "@/lib/actions/avatars";
import { registerFile } from "@/lib/actions/files";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AVATAR_FOLDER, AVATAR_IMAGE_ACCEPT, AVATAR_IMAGE_MAX_BYTES, isAvatarImageMime } from "@/lib/avatar-image";
import { cn, slugify } from "@/lib/utils";

/** Image choisie dans le formulaire « Ajouter un avatar ». */
export type AvatarImage =
  | { kind: "none" }
  | { kind: "upload"; file: File; preview: string }
  | { kind: "file"; path: string; name: string; preview: string | null }
  | { kind: "link"; url: string };

type Mode = "upload" | "file" | "link";
type Pickable = { id: string; name: string; path: string; url: string | null };

const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;

/**
 * Dépose l'image importée dans Fichiers › Avatars du client (bucket privé « studio »), partagée avec lui,
 * puis renvoie son chemin. Même convention de chemin que le téléversement des Fichiers.
 */
export async function uploadAvatarImage(clientId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `clients/${clientId}/${slugify(AVATAR_FOLDER)}/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, "")) || "avatar"}.${ext}`;
  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().storage.from("studio").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw new Error(`Envoi de l'image impossible${error.message ? ` : ${error.message}` : "."}`);
  }
  const res = await registerFile({ name: file.name, path, mime: file.type, size: file.size, client_id: clientId, livrable_id: null, folder: AVATAR_FOLDER, shared_with_client: true });
  if (!res.ok) throw new Error(res.error);
  return path;
}

/** Ce que l'action addAvatar attend pour l'image (une image importée doit d'abord passer par uploadAvatarImage). */
export function avatarImageInput(image: AvatarImage): { preview_url?: string | null; image_path?: string | null } {
  if (image.kind === "file") return { image_path: image.path };
  if (image.kind === "link") return { preview_url: image.url.trim() || null };
  return {};
}

/**
 * Prépare l'image au moment d'enregistrer l'avatar. Une image importée est déposée une seule fois :
 * si l'enregistrement échoue, un nouvel essai réutilise le fichier déjà rangé dans le dossier Avatars.
 */
export function useAvatarImageSubmit() {
  const uploaded = React.useRef<{ file: File; clientId: string; path: string } | null>(null);
  return React.useCallback(async (clientId: string, image: AvatarImage) => {
    if (image.kind !== "upload") return avatarImageInput(image);
    if (uploaded.current?.file !== image.file || uploaded.current.clientId !== clientId) {
      uploaded.current = { file: image.file, clientId, path: await uploadAvatarImage(clientId, image.file) };
    }
    return { image_path: uploaded.current.path };
  }, []);
}

/**
 * Image d'un avatar : importée (rangée dans Fichiers › Avatars), choisie dans ce dossier, ou lien HTTPS.
 * Les deux premiers modes restent privés : l'image est signée à chaque affichage, jamais publiée.
 */
export function AvatarImageField({ clientId, value, onChange, onSuggestName }: {
  clientId: string;
  value: AvatarImage;
  onChange: (v: AvatarImage) => void;
  onSuggestName?: (name: string) => void;
}) {
  const [mode, setMode] = React.useState<Mode>(value.kind === "none" ? "upload" : value.kind);
  const stash = React.useRef<Partial<Record<Mode, AvatarImage>>>({});
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [listing, setListing] = React.useState<{ clientId: string; files: Pickable[]; error: string | null } | null>(null);

  // Liste du dossier Avatars du client, chargée à l'ouverture de l'onglet (et rechargée si le client change).
  React.useEffect(() => {
    if (mode !== "file" || !clientId || listing?.clientId === clientId) return;
    let alive = true;
    listAvatarImages(clientId).then((res) => {
      if (alive) setListing({ clientId, files: res.ok ? res.data : [], error: res.ok ? null : res.error });
    });
    return () => { alive = false; };
  }, [mode, clientId, listing?.clientId]);
  const listed = listing?.clientId === clientId ? listing : null;

  // Une sélection du dossier n'a de sens que pour le client choisi.
  const inClient = (v: AvatarImage | undefined): AvatarImage => (v && !(v.kind === "file" && !v.path.startsWith(`clients/${clientId}/`)) ? v : { kind: "none" });

  // Aperçu local d'une image importée : libéré quand il ne sert plus.
  const preview = value.kind === "upload" ? value.preview : null;
  React.useEffect(() => () => { if (preview && !Object.values(stash.current).some((v) => v?.kind === "upload" && v.preview === preview)) URL.revokeObjectURL(preview); }, [preview]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (value.kind !== "none") stash.current[mode] = value;
    setMode(m); setError(null);
    onChange(inClient(stash.current[m]));
  };

  const pick = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    if (!isAvatarImageMime(file.type)) { setError("Choisis une image PNG, JPEG ou WebP."); return; }
    if (file.size > AVATAR_IMAGE_MAX_BYTES) { setError(`Image trop lourde (${mb(file.size)}) : ${mb(AVATAR_IMAGE_MAX_BYTES)} maximum.`); return; }
    setError(null);
    if (value.kind === "upload") URL.revokeObjectURL(value.preview);
    delete stash.current.upload;
    onChange({ kind: "upload", file, preview: URL.createObjectURL(file) });
    onSuggestName?.(baseName(file.name));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg-2">Image</span>
      <SegmentedControl value={mode} onChange={switchMode} className="self-start"
        options={[{ value: "upload", label: "Importer" }, { value: "file", label: `Dossier ${AVATAR_FOLDER}` }, { value: "link", label: "Lien" }]} />

      {mode === "upload" ? (
        value.kind === "upload" ? (
          <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) */}
            <img src={value.preview} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{value.file.name}</p>
              <p className="text-[12px] text-muted">{mb(value.file.size)} · rangée dans Fichiers › {AVATAR_FOLDER}</p>
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-1 text-[12.5px] font-medium text-accent-2 hover:underline">Changer d&apos;image</button>
            </div>
            <button type="button" aria-label="Retirer l'image" onClick={() => { URL.revokeObjectURL(value.preview); onChange({ kind: "none" }); }}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-danger"><X className="size-4" /></button>
          </div>
        ) : (
          <div role="button" tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              drag ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent/50 hover:bg-surface-2/60")}>
            <UploadCloud className="size-6 text-accent-2" />
            <p className="mt-2 text-[13.5px] font-medium">Glisse le portrait ici</p>
            <p className="text-[12px] text-muted">ou clique pour parcourir · PNG, JPEG ou WebP · {mb(AVATAR_IMAGE_MAX_BYTES)} max</p>
          </div>
        )
      ) : null}
      <input ref={inputRef} type="file" accept={AVATAR_IMAGE_ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />

      {mode === "file" ? (
        !listed ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" />Chargement du dossier {AVATAR_FOLDER}…</p>
        ) : listed.error ? (
          <p className="py-3 text-[13px] text-danger">{listed.error}</p>
        ) : listed.files.length ? (
          <ul className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto pr-1">
            {listed.files.map((f) => {
              const selected = value.kind === "file" && value.path === f.path;
              return (
                <li key={f.id}>
                  <button type="button" title={f.name} aria-pressed={selected}
                    onClick={() => { onChange({ kind: "file", path: f.path, name: f.name, preview: f.url }); onSuggestName?.(baseName(f.name)); }}
                    className={cn("group block w-full overflow-hidden rounded-lg border text-left transition", selected ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50")}>
                    <span className="relative block aspect-[4/5] bg-surface-2">
                      {f.url ? <Image src={f.url} alt="" fill unoptimized sizes="120px" className="object-cover" /> : <FolderOpen className="absolute inset-0 m-auto size-5 text-muted" />}
                      {selected ? <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow"><Check className="size-3" /></span> : null}
                    </span>
                    <span className="block truncate px-1.5 py-1 text-[11px] text-fg-2">{f.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted">
            Aucune image dans Fichiers › {AVATAR_FOLDER} pour ce client. Importe-la depuis l&apos;onglet « Importer » : elle y sera rangée.
          </p>
        )
      ) : null}

      {mode === "link" ? (
        <div className="flex items-center gap-2">
          <Link2 className="size-4 shrink-0 text-muted" />
          <Input type="url" inputMode="url" value={value.kind === "link" ? value.url : ""} onChange={(e) => onChange(e.target.value ? { kind: "link", url: e.target.value } : { kind: "none" })} placeholder="https://…" aria-label="Lien de l'image" />
        </div>
      ) : null}

      {error ? <span className="text-xs text-danger">{error}</span> : (
        <span className="text-xs text-muted">
          {mode === "link"
            ? "Lien HTTPS d'une image déjà en ligne (facultatif)."
            : `Facultatif. L'image reste privée (Fichiers › ${AVATAR_FOLDER}) et est partagée avec le client, sans lien public.`}
        </span>
      )}
    </div>
  );
}
