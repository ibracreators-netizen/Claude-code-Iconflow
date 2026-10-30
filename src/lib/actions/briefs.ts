"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Brief, BriefKind, BriefStatus } from "@/lib/data/types";
import type { Patch } from "@/lib/data/store";

function revalidate(id?: string, clientId?: string | null) {
  revalidatePath("/studio/briefs");
  revalidatePath("/studio");
  revalidatePath("/studio/inbox");
  if (id) revalidatePath(`/studio/briefs/${id}`);
  if (clientId) revalidatePath(`/studio/clients/${clientId}`);
  revalidatePath("/app/briefs");
  revalidatePath("/app/validations");
}

export async function createBrief(input: { client_id: string; month: string; kind: BriefKind; title: string }) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    if (!input.title.trim()) throw new Error("Donne un titre au brief.");
    if (!/^\d{4}-(0[1-9]|1[0-2])/.test(input.month)) throw new Error("Choisis un mois valide.");
    const brief = await store.createBrief(input);
    revalidate(brief.id, brief.client_id);
    return brief;
  });
}

export async function updateBrief(id: string, patch: Patch<Brief>) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    const brief = await store.updateBrief(id, patch);
    revalidate(id, brief.client_id);
    return brief;
  });
}

export async function transitionBrief(id: string, next: BriefStatus) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    const brief = await store.transitionBrief(id, next);
    revalidate(id, brief.client_id);
    return brief;
  });
}

export async function reorderBriefs(ids: string[]) {
  return run(async () => {
    const store = await getStoreFor("briefs");
    await store.reorderBriefs(ids);
    revalidate();
    ids.forEach((id) => revalidatePath(`/studio/briefs/${id}`));
  });
}
