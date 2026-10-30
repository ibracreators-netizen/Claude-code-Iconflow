"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";

export async function updateProfile(patch: { display_name?: string | null; title?: string | null; avatar_url?: string | null }) {
  return run(async () => { const s = await getStore(); const r = await s.updateProfile(patch); revalidatePath("/", "layout"); return r; });
}

/** Photo de profil : URL publique Storage (Supabase) ou data URL (démo). null = suppression. */
export async function updateAvatar(avatar_url: string | null) {
  return run(async () => {
    if (avatar_url && !/^(https:\/\/|data:image\/jpeg;base64,)/.test(avatar_url)) throw new Error("Image non reconnue.");
    if (avatar_url && avatar_url.length > 400_000) throw new Error("Image trop lourde.");
    const s = await getStore(); const r = await s.updateProfile({ avatar_url }); revalidatePath("/", "layout"); return r;
  });
}
