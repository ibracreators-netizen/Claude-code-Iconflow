"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { CalendarEvent } from "@/lib/data/types";

export async function createEvent(input: Omit<CalendarEvent, "id" | "created_by">) {
  return run(async () => {
    const store = await getStoreFor("planning");
    if (!input.title.trim()) throw new Error("Donne un titre à l'événement.");
    if (!input.starts_at) throw new Error("Choisis une date de début.");
    const e = await store.createEvent(input);
    revalidatePath("/studio/planning"); revalidatePath("/studio");
    return e;
  });
}

export async function deleteEvent(id: string) {
  return run(async () => { const store = await getStoreFor("planning"); await store.deleteEvent(id); revalidatePath("/studio/planning"); revalidatePath("/studio"); });
}
