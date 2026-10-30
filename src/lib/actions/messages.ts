"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";

export async function sendMessage(clientId: string, body: string) {
  return run(async () => {
    const text = body.trim();
    if (!text) throw new Error("Écris un message avant d'envoyer.");
    if (text.length > 10000) throw new Error("Message trop long (10 000 caractères max).");
    const store = await getStore();
    const m = await store.sendMessage(clientId, text);
    revalidatePath("/studio/messages");
    revalidatePath(`/studio/clients/${clientId}`);
    revalidatePath("/app/messages");
    return m;
  });
}
