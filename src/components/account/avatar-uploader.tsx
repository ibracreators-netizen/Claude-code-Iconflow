"use client";
import * as React from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/hooks/use-action";
import { updateAvatar } from "@/lib/actions/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const MAX_BYTES = 8 * 1024 * 1024;
const SIZE = 320;

/** Recadre l'image en carré (cover) et la compresse en JPEG côté navigateur. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Cette image est illisible. Essaie une autre photo."); });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2, sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas"); canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Impossible de préparer l'image.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Impossible de préparer l'image."))), "image/jpeg", 0.86));
}

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("Lecture impossible.")); r.readAsDataURL(blob); });

export function AvatarUploader({ userId, name, avatarUrl, size = 72 }: { userId: string; name: string; avatarUrl: string | null; size?: number }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(avatarUrl);
  const [busy, setBusy] = React.useState(false);
  const { exec } = useAction();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_BYTES) { toast.error("Choisis une image JPG, PNG ou WebP de 8 Mo maximum."); return; }
    setBusy(true);
    try {
      const blob = await squareJpeg(file);
      let url: string;
      if (isSupabaseConfigured()) {
        const { createClient } = await import("@/lib/supabase/client");
        const sb = createClient();
        const path = `${userId}/${Date.now()}.jpg`;
        const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (error) throw new Error(error.message.includes("Bucket not found") ? "Le bucket « avatars » n'existe pas encore : lance la migration 0003_avatars.sql dans Supabase." : error.message);
        url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      } else {
        url = await toDataUrl(blob);
      }
      const res = await exec(() => updateAvatar(url), { success: "Photo de profil mise à jour." });
      if (res.ok) setPreview(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer la photo.");
    } finally {
      setBusy(false); if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await exec(() => updateAvatar(null), { success: "Photo supprimée." });
    if (res.ok) setPreview(null);
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={() => inputRef.current?.click()} className="group relative rounded-full ring-2 ring-border transition hover:ring-accent/60 focus-visible:ring-accent" aria-label="Changer la photo de profil" disabled={busy}>
        <Avatar name={name} src={preview} size={size} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-5" /></span>
      </button>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()}><Camera />{preview ? "Changer la photo" : "Ajouter une photo"}</Button>
          {preview ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove} className="text-muted hover:text-danger"><Trash2 />Supprimer</Button> : null}
        </div>
        <p className="text-[12px] text-muted">JPG, PNG ou WebP · 8 Mo max · recadrée en carré automatiquement.</p>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Choisir une photo de profil" />
    </div>
  );
}
