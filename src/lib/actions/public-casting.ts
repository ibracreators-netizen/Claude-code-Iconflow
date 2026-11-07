"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { publicSetAvatar } from "@/lib/data/public-casting";

/** Choix d'un avatar depuis le lien partagé (sans session) : autorisé par le jeton, borné à son client. */
async function act(token: string, avatarId: string, action: "choose" | "archive" | "restore") {
  return run(async () => {
    const r = await publicSetAvatar(token, avatarId, action);
    if (!r.ok) throw new Error(r.error);
    revalidatePath(`/casting/${token}`);
    return { ok: true };
  });
}
export async function castingChoose(token: string, avatarId: string) { return act(token, avatarId, "choose"); }
export async function castingArchive(token: string, avatarId: string) { return act(token, avatarId, "archive"); }
export async function castingRestore(token: string, avatarId: string) { return act(token, avatarId, "restore"); }
