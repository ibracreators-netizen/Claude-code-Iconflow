"use client";
import * as React from "react";
import { Camera, CircleCheck, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { MkFieldLabel, MkPrimaryButton } from "@/components/marketing/ui";
import { saveMarketingAvatar, saveMarketingProfile } from "@/lib/actions/marketing-profile";
import { useAction } from "@/lib/hooks/use-action";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { ProfilePhoto } from "./profile-photo";

/** Champ LeadConnector : libellé au-dessus, 48 px de haut sur téléphone (16 px : iOS ne zoome pas), 40 px sur ordinateur. */
const FIELD = "h-12 w-full rounded-[10px] border border-mk-input bg-surface px-3.5 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 lg:h-10 lg:rounded-lg lg:text-[14px]";
const LOCKED = "cursor-default border-mk-line bg-mk-chip text-mk-sub focus:border-mk-line focus:ring-0";

/* Photo : recadrée en carré et compressée dans le navigateur, puis envoyée comme sur la page Studio
   (bucket « avatars », dossier du membre ; image intégrée quand l'app tourne sans base). */
const MAX_BYTES = 8 * 1024 * 1024, SIDE = 320;
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Cette image est illisible. Essaie une autre photo."); });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas"); canvas.width = SIDE; canvas.height = SIDE;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Impossible de préparer l'image.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Impossible de préparer l'image."))), "image/jpeg", 0.86));
}
function storageMessage(message: string): string {
  if (/bucket not found/i.test(message)) return "Le stockage des photos n'est pas encore installé (migration 0003_avatars.sql).";
  if (/row-level security|permission denied|unauthorized|not allowed/i.test(message)) return "Le stockage des photos refuse l'envoi (migration 0003_avatars.sql à appliquer).";
  if (/payload too large|exceeded the maximum allowed size/i.test(message)) return "Image trop lourde (5 Mo au maximum après recadrage).";
  return message;
}
const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("Lecture impossible.")); r.readAsDataURL(blob); });
async function uploadPhoto(userId: string, file: File): Promise<string> {
  const blob = await squareJpeg(file);
  if (!isSupabaseConfigured()) return toDataUrl(blob);
  const { createClient } = await import("@/lib/supabase/client");
  const sb = createClient(), path = `${userId}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(storageMessage(error.message));
  return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export function ProfileForm({ userId, email, displayName, title, avatarUrl, role }: { userId: string; email: string; displayName: string; title: string; avatarUrl: string | null; role: string | null }) {
  const [name, setName] = React.useState(displayName);
  const [fn, setFn] = React.useState(title);
  const [saved, setSaved] = React.useState({ name: displayName.trim(), title: title.trim() });
  const [note, setNote] = React.useState<"saved" | "same" | null>(null);
  const [tried, setTried] = React.useState(false);
  const [photo, setPhoto] = React.useState(avatarUrl);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { exec, pending } = useAction();
  const photoAction = useAction();
  const missing = tried && !name.trim();

  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { set(e.target.value); setNote(null); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!name.trim()) return;
    if (name.trim() === saved.name && fn.trim() === saved.title) { setNote("same"); return; }
    void exec(() => saveMarketingProfile({ display_name: name, title: fn }), {
      onSuccess: (d) => { setSaved({ name: d.display_name, title: d.title ?? "" }); setName(d.display_name); setFn(d.title ?? ""); setNote("saved"); },
    });
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_BYTES) { toast.error("Choisis une image JPG, PNG ou WebP de 8 Mo au maximum."); return; }
    setPhotoBusy(true);
    try {
      const url = await uploadPhoto(userId, file);
      const res = await photoAction.exec(() => saveMarketingAvatar(url), { success: "Photo mise à jour." });
      if (res.ok) setPhoto(res.data.avatar_url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer la photo.");
    } finally {
      setPhotoBusy(false); if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    const res = await photoAction.exec(() => saveMarketingAvatar(null), { success: "Photo retirée." });
    if (res.ok) setPhoto(null);
    setPhotoBusy(false);
  };
  const pick = () => fileRef.current?.click();

  return (
    <form onSubmit={submit} noValidate className="lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:p-8 lg:shadow-[var(--shadow-soft)]">
      <div className="flex flex-col items-center gap-2.5 pb-7 pt-2 lg:pt-0">
        <button type="button" onClick={pick} disabled={photoBusy} aria-label={photo ? "Changer la photo de profil" : "Ajouter une photo de profil"} className="relative rounded-full outline-offset-4">
          <ProfilePhoto name={name.trim() || email} src={photo} size={88} />
          {photoBusy ? <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white"><LoaderCircle className="size-6 animate-spin" /></span> : null}
          <span className="absolute -bottom-0.5 -right-0.5 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-accent text-accent-fg" aria-hidden><Camera className="size-4" strokeWidth={2} /></span>
        </button>
        <div className="flex items-center gap-4">
          <button type="button" onClick={pick} disabled={photoBusy} className="text-[15px] font-semibold text-accent-2 transition hover:underline disabled:opacity-50">{photo ? "Changer la photo" : "Ajouter une photo"}</button>
          {photo ? <button type="button" onClick={removePhoto} disabled={photoBusy} className="text-[15px] font-medium text-mk-sub transition hover:text-mk-danger disabled:opacity-50">Retirer</button> : null}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Choisir une photo de profil" />
      </div>

      <div className="space-y-5">
        <div>
          <MkFieldLabel htmlFor="mk-profile-name" required>Nom affiché</MkFieldLabel>
          <input id="mk-profile-name" className={cn(FIELD, missing && "border-mk-danger")} value={name} onChange={edit(setName)} maxLength={80} required autoComplete="name" aria-invalid={missing || undefined} aria-describedby={missing ? "mk-profile-name-error" : undefined} placeholder="Ton prénom et ton nom" />
          {missing ? <p id="mk-profile-name-error" className="mt-1.5 text-[13px] text-mk-danger">Le nom affiché est obligatoire.</p> : null}
        </div>
        <div>
          <MkFieldLabel htmlFor="mk-profile-title">Fonction</MkFieldLabel>
          <input id="mk-profile-title" className={FIELD} value={fn} onChange={edit(setFn)} maxLength={80} autoComplete="organization-title" placeholder="Ex. Setter, Closer, Fondateur" />
        </div>
        <div>
          <MkFieldLabel htmlFor="mk-profile-email">E-mail</MkFieldLabel>
          <input id="mk-profile-email" className={cn(FIELD, LOCKED)} value={email} readOnly tabIndex={-1} />
          <p className="mt-1.5 text-[13px] text-mk-sub">Sert à te connecter&nbsp;: il ne se change pas ici.</p>
        </div>
        {role ? (
          <div>
            <MkFieldLabel htmlFor="mk-profile-role">Rôle commercial</MkFieldLabel>
            <input id="mk-profile-role" className={cn(FIELD, LOCKED)} value={role} readOnly tabIndex={-1} />
            <p className="mt-1.5 text-[13px] text-mk-sub">Donné par un administrateur.</p>
          </div>
        ) : null}
      </div>

      <MkPrimaryButton type="submit" disabled={pending} className="mt-8 lg:h-10 lg:text-[14px]">{pending ? "Enregistrement…" : "Enregistrer"}</MkPrimaryButton>
      <p role="status" className={cn("mt-3 flex min-h-5 items-center justify-center gap-1.5 text-[14px] font-medium", note === "saved" ? "text-mk-success" : "text-mk-sub")}>
        {note === "saved" ? <><CircleCheck className="size-4" strokeWidth={2} aria-hidden />Profil enregistré.</> : note === "same" ? <>Rien à changer&nbsp;: ton profil est déjà à jour.</> : null}
      </p>
    </form>
  );
}
