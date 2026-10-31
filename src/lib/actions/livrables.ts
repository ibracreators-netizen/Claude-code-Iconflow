"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Livrable, LivrableStatus } from "@/lib/data/types";
import type { Patch } from "@/lib/data/store";
import { LIVRABLE_KIND, type LivrableKind } from "@/lib/data/types";
import { normalizeItems, totalDuration, type BatchInput, type BatchPatch } from "@/lib/batch";

function revalidate(id?: string, clientId?: string | null) {
  revalidatePath("/studio/livrables");
  revalidatePath("/studio");
  revalidatePath("/studio/inbox");
  if (id) revalidatePath(`/studio/livrables/${id}`);
  if (clientId) revalidatePath(`/studio/clients/${clientId}`);
  revalidatePath("/app/livrables");
  revalidatePath("/app/validations");
}

export async function createLivrable(input: { client_id: string; month: string; kind: Livrable["kind"]; title: string; file_url?: string | null; duration_sec?: number | null; brief_id?: string | null; items?: Livrable["items"] }) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    if (!input.title.trim()) throw new Error("Donne un titre au livrable.");
    if (input.file_url) {
      let url: URL;
      try { url = new URL(input.file_url); } catch { throw new Error("Renseigne un lien HTTPS valide."); }
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Renseigne un lien HTTPS sans identifiants.");
    }
    const row = await store.createLivrable(input);
    revalidate(row.id, row.client_id);
    return row;
  });
}

export async function updateLivrable(id: string, patch: Patch<Livrable>) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    const row = await store.updateLivrable(id, patch);
    revalidate(id, row.client_id);
    return row;
  });
}

export async function transitionLivrable(id: string, next: LivrableStatus, comment?: string | null) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    const row = await store.transitionLivrable(id, next, comment?.trim() || null);
    revalidate(id, row.client_id);
    return row;
  });
}

export async function addLivrableComment(id: string, body: string) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    if (!body.trim()) throw new Error("Écris un commentaire avant d'envoyer.");
    const c = await store.addLivrableComment(id, body);
    revalidatePath(`/studio/livrables/${id}`);
    revalidatePath(`/app/livrables/${id}`);
    return c;
  });
}

/* ─── Batch : un livrable = un lien Frame + la liste des vidéos ou visuels livrés ───────────── */

/** Lien HTTPS sans identifiants (chaîne vide → null). */
function checkLink(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Renseigne un lien HTTPS valide (Frame.io, Drive…)."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Renseigne un lien HTTPS sans identifiants.");
  return url.href;
}

/** YYYY-MM ou YYYY-MM-01 → YYYY-MM-01. */
function checkMonth(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(value)) throw new Error("Choisis un mois.");
  return value.length === 7 ? `${value}-01` : value;
}

/** Type connu (vidéo montée, statique, rush) : propriété propre uniquement — « constructor » ou « __proto__ » ne sont pas des types. */
function checkKind(value: unknown): LivrableKind {
  if (typeof value !== "string" || !Object.hasOwn(LIVRABLE_KIND, value)) throw new Error("Choisis un type de livrable.");
  return value as LivrableKind;
}

/** Crée un batch : titre, type, mois, lien unique et liste des éléments (durée totale recalculée). */
export async function createBatch(input: BatchInput) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    const title = input.title.trim();
    if (!input.client_id) throw new Error("Choisis un client.");
    if (!title) throw new Error("Donne un titre au batch (ex. « Batch octobre »).");
    const kind = checkKind(input.kind);
    const items = normalizeItems(input.items);
    const row = await store.createLivrable({
      client_id: input.client_id, month: checkMonth(input.month), kind, title,
      file_url: checkLink(input.file_url), brief_id: input.brief_id || null, duration_sec: totalDuration(items), items,
    });
    revalidate(row.id, row.client_id);
    return row;
  });
}

/** Modifie un batch (titre, type, mois, lien, brief, éléments). Le statut ne change pas ici. */
export async function updateBatch(id: string, patch: BatchPatch) {
  return run(async () => {
    const store = await getStoreFor("livrables");
    const next: Patch<Livrable> = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error("Donne un titre au batch.");
      next.title = title;
    }
    if (patch.kind !== undefined) next.kind = checkKind(patch.kind);
    if (patch.month !== undefined) next.month = checkMonth(patch.month);
    if (patch.file_url !== undefined) next.file_url = checkLink(patch.file_url);
    if (patch.brief_id !== undefined) next.brief_id = patch.brief_id || null;
    if (patch.items !== undefined) {
      next.items = normalizeItems(patch.items);
      // La durée du livrable est celle du batch. Liste vidée → durée remise à zéro ;
      // livrable ancien sans liste → on garde la durée saisie à la main.
      if (next.items.length) next.duration_sec = totalDuration(next.items);
      else if ((await store.livrable(id))?.items.length) next.duration_sec = null;
    }
    const row = await store.updateLivrable(id, next);
    revalidate(id, row.client_id);
    return row;
  });
}
