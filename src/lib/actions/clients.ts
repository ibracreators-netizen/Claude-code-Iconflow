"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor, getStoreForAny } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Client, Contact, ManagementStage, PipelineStage } from "@/lib/data/types";

type ClientInput = Parameters<Awaited<ReturnType<typeof getStoreFor>>["createClient"]>[0];

function revalidateClient(id?: string) {
  revalidatePath("/studio");
  revalidatePath("/studio/clients");
  revalidatePath("/studio/pipeline");
  if (id) revalidatePath(`/studio/clients/${id}`);
}

export async function createClient(input: ClientInput) {
  return run(async () => {
    const store = await getStoreFor("clients");
    const client = await store.createClient(input);
    revalidateClient(client.id);
    return client;
  });
}

export async function updateClient(id: string, patch: Partial<Omit<Client, "id" | "created_at">>) {
  return run(async () => {
    const store = await getStoreFor("clients");
    const client = await store.updateClient(id, patch);
    revalidateClient(id);
    return client;
  });
}

export async function archiveClient(id: string, archived: boolean) {
  return run(async () => {
    const store = await getStoreFor("clients");
    const client = await store.archiveClient(id, archived);
    revalidateClient(id);
    return client;
  });
}

export async function saveManagement(clientId: string, stage: ManagementStage, notes: string, revision: number) {
  return run(async () => {
    // Le suivi agence s'édite depuis la fiche client comme depuis le pipeline : l'un des deux modules suffit.
    const store = await getStoreForAny(["clients", "pipeline"]);
    const m = await store.saveManagement(clientId, stage, notes, revision);
    // Le statut d'accès du client suit l'étape du pipeline : plus d'étiquette « Onboarding » dans la colonne « En cours ».
    const client = await store.client(clientId);
    if (client && client.status !== "archived") {
      if (stage !== "onboarding" && client.status === "onboarding") await store.updateClient(clientId, { status: "active" });
      if (stage === "onboarding" && client.status === "active") await store.updateClient(clientId, { status: "onboarding" });
    }
    revalidateClient(clientId); revalidatePath("/studio/pipeline");
    return m;
  });
}

/** Suppression définitive : réservée à un administrateur à accès complet ; toutes les données du client disparaissent. */
export async function deleteClient(id: string) {
  return run(async () => {
    const store = await getStoreFor("clients");
    await store.deleteClient(id);
    revalidateClient(id); revalidatePath("/studio/equipe");
  });
}

// Étapes du pipeline
export async function saveStage(input: { key?: string; label: string; color?: PipelineStage["color"] }) {
  return run(async () => { const store = await getStoreFor("pipeline"); const s = await store.saveStage(input); revalidatePath("/studio/pipeline"); revalidatePath("/studio/clients"); revalidatePath("/studio"); return s; });
}
export async function reorderStages(keys: string[]) {
  return run(async () => { const store = await getStoreFor("pipeline"); await store.reorderStages(keys); revalidatePath("/studio/pipeline"); revalidatePath("/studio/clients"); });
}
export async function deleteStage(key: string, replacement: string) {
  return run(async () => { const store = await getStoreFor("pipeline"); await store.deleteStage(key, replacement); revalidatePath("/studio/pipeline"); revalidatePath("/studio/clients"); revalidatePath("/studio"); });
}

export async function upsertContact(input: Omit<Contact, "created_at"> | Omit<Contact, "id" | "created_at">) {
  return run(async () => {
    const store = await getStoreFor("clients");
    const c = await store.upsertContact(input);
    revalidateClient(c.client_id);
    return c;
  });
}

export async function deleteContact(id: string, clientId: string) {
  return run(async () => {
    const store = await getStoreFor("clients");
    await store.deleteContact(id);
    revalidateClient(clientId);
  });
}
