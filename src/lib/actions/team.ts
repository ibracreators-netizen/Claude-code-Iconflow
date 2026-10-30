"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import { StoreError } from "@/lib/data/store";
import { canGrant, canManageAccount, normalizePermissions } from "@/lib/permissions";

const inviteSchema = z.object({
  email: z.string().trim().email("Adresse email invalide."),
  full_name: z.string().trim().min(1, "Indique le nom.").max(80, "Nom trop long."),
  title: z.string().trim().max(80, "Fonction trop longue.").optional().nullable(),
  role: z.enum(["agency", "client"]),
  client_id: z.string().trim().optional().nullable(),
  permissions: z.array(z.string()).optional().nullable(),
});

function revalidateTeam(id?: string) { revalidatePath("/studio/equipe"); revalidatePath("/studio", "layout"); if (id) revalidatePath(`/studio/equipe/${id}`); }

/** Le compte visé existe et l'appelant a le droit de le gérer (jamais soi-même, jamais un administrateur quand on est limité). */
async function manageable(store: Awaited<ReturnType<typeof getStoreFor>>, id: string) {
  const target = await store.profile(id);
  if (!target) throw new StoreError("target_not_found");
  if (id === store.session.user.id) throw new StoreError("cannot_edit_self");
  if (!canManageAccount(store.session.profile, target)) throw new StoreError("admin_target");
  return target;
}

export async function inviteMember(input: z.infer<typeof inviteSchema>) {
  return run(async () => {
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
    const data = parsed.data;
    const store = await getStoreFor("equipe");
    const permissions = data.role === "agency" ? normalizePermissions(data.permissions ?? null) : null;
    // On n'invite jamais avec plus de droits que les siens.
    if (data.role === "agency" && !canGrant(store.session.profile, [], permissions)) throw new StoreError("cannot_grant");
    const p = await store.inviteMember({ ...data, permissions, client_id: data.role === "client" ? data.client_id ?? null : null });
    revalidateTeam();
    return p;
  });
}

export async function setMemberPermissions(id: string, permissions: string[] | null) {
  return run(async () => {
    const store = await getStoreFor("equipe");
    const target = await manageable(store, id);
    const next = normalizePermissions(permissions);
    if (!canGrant(store.session.profile, target.permissions, next)) throw new StoreError("cannot_grant");
    const p = await store.updateMemberAccess(id, { permissions: next });
    revalidateTeam(id);
    return p;
  });
}

export async function setMemberDisabled(id: string, disabled: boolean) {
  return run(async () => {
    const store = await getStoreFor("equipe");
    await manageable(store, id);
    const p = await store.updateMemberAccess(id, { disabled });
    revalidateTeam(id);
    return p;
  });
}

export async function updateMember(id: string, patch: { title?: string | null; client_id?: string | null }) {
  return run(async () => {
    const store = await getStoreFor("equipe");
    await manageable(store, id);
    const title = patch.title === undefined ? undefined : (patch.title ?? "").trim().slice(0, 80) || null;
    const p = await store.updateMemberAccess(id, { title, client_id: patch.client_id });
    revalidateTeam(id);
    return p;
  });
}

export async function resendInvite(id: string) {
  return run(async () => {
    const store = await getStoreFor("equipe");
    await manageable(store, id);
    await store.resendInvite(id);
  });
}
