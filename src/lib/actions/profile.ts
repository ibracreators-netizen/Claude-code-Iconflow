"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";

export async function updateProfile(patch: { display_name?: string | null; title?: string | null; avatar_url?: string | null }) {
  return run(async () => { const s = await getStore(); const r = await s.updateProfile(patch); revalidatePath("/", "layout"); return r; });
}
