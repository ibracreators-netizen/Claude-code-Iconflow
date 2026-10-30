"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Client, Contact, ManagementStage } from "@/lib/data/types";

type ClientInput = Parameters<Awaited<ReturnType<typeof getStore>>["createClient"]>[0];

function revalidateClient(id?: string) {
  revalidatePath("/studio");
  revalidatePath("/studio/clients");
  revalidatePath("/studio/pipeline");
  if (id) revalidatePath(`/studio/clients/${id}`);
}

export async function createClient(input: ClientInput) {
  return run(async () => {
    const store = await getStore();
    const client = await store.createClient(input);
    revalidateClient(client.id);
    return client;
  });
}

export async function updateClient(id: string, patch: Partial<Omit<Client, "id" | "created_at">>) {
  return run(async () => {
    const store = await getStore();
    const client = await store.updateClient(id, patch);
    revalidateClient(id);
    return client;
  });
}

export async function archiveClient(id: string, archived: boolean) {
  return run(async () => {
    const store = await getStore();
    const client = await store.archiveClient(id, archived);
    revalidateClient(id);
    return client;
  });
}

export async function saveManagement(clientId: string, stage: ManagementStage, notes: string, revision: number) {
  return run(async () => {
    const store = await getStore();
    const m = await store.saveManagement(clientId, stage, notes, revision);
    revalidateClient(clientId);
    return m;
  });
}

export async function upsertContact(input: Omit<Contact, "created_at"> | Omit<Contact, "id" | "created_at">) {
  return run(async () => {
    const store = await getStore();
    const c = await store.upsertContact(input);
    revalidateClient(c.client_id);
    return c;
  });
}

export async function deleteContact(id: string, clientId: string) {
  return run(async () => {
    const store = await getStore();
    await store.deleteContact(id);
    revalidateClient(clientId);
  });
}
