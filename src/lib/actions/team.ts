"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import { normalizePermissions } from "@/lib/permissions";

const inviteSchema = z.object({
  email: z.string().trim().email("Adresse email invalide."),
  full_name: z.string().trim().min(1, "Indique le nom.").max(80),
  title: z.string().trim().max(80).optional().nullable(),
  role: z.enum(["agency", "client"]),
  client_id: z.string().trim().optional().nullable(),
  permissions: z.array(z.string()).optional().nullable(),
});

function revalidateTeam() { revalidatePath("/studio/equipe"); revalidatePath("/studio", "layout"); }

export async function inviteMember(input: z.infer<typeof inviteSchema>) {
  return run(async () => {
    const data = inviteSchema.parse(input);
    const store = await getStoreFor("equipe");
    const p = await store.inviteMember({ ...data, permissions: data.role === "agency" ? normalizePermissions(data.permissions ?? null) : null, client_id: data.role === "client" ? data.client_id ?? null : null });
    revalidateTeam();
    return p;
  });
}

export async function setMemberPermissions(id: string, permissions: string[] | null) {
  return run(async () => {
    const store = await getStoreFor("equipe");
    const p = await store.updateMemberAccess(id, { permissions: normalizePermissions(permissions) });
    revalidateTeam(); revalidatePath(`/studio/equipe/${id}`);
    return p;
  });
}

export async function setMemberDisabled(id: string, disabled: boolean) {
  return run(async () => {
    const store = await getStoreFor("equipe");
    const p = await store.updateMemberAccess(id, { disabled });
    revalidateTeam(); revalidatePath(`/studio/equipe/${id}`);
    return p;
  });
}

export async function updateMember(id: string, patch: { title?: string | null; client_id?: string | null }) {
  return run(async () => {
    const store = await getStoreFor("equipe");
    const p = await store.updateMemberAccess(id, patch);
    revalidateTeam(); revalidatePath(`/studio/equipe/${id}`);
    return p;
  });
}

export async function resendInvite(id: string) {
  return run(async () => { const store = await getStoreFor("equipe"); await store.resendInvite(id); });
}
