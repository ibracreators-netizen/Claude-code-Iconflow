"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Metric } from "@/lib/data/types";

export async function upsertMetric(input: Omit<Metric, "id">) {
  return run(async () => {
    const store = await getStoreFor("performance");
    if (!input.client_id) throw new Error("Choisis un client.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.period_start)) throw new Error("Choisis une semaine (date du lundi).");
    const m = await store.upsertMetric(input);
    revalidatePath("/studio/performance"); revalidatePath("/studio"); revalidatePath(`/studio/clients/${input.client_id}`);
    if (input.livrable_id) revalidatePath(`/studio/livrables/${input.livrable_id}`);
    revalidatePath("/app/performance");
    return m;
  });
}
