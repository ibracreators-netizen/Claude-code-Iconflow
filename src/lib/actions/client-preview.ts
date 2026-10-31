"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLIENT_PREVIEW_COOKIE, getClientPreview, getStoreFor } from "@/lib/auth/session";
import { run, type ActionResult } from "@/lib/actions/result";
import { StoreError } from "@/lib/data/store";

/*
 * Aperçu de l'espace client : un membre de l'agence (module « clients ») ouvre /app et voit l'espace d'un client
 * comme lui. Le cookie httpOnly (24 h) porte l'identifiant du client ; requireClient() l'accepte pour une session
 * agence, et les actions du portail refusent toute écriture pendant l'aperçu (portal.ts).
 */

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 };

/** Démarre l'aperçu d'un client puis ouvre son espace. Un membre sans le module « clients » est refusé. */
export async function startClientPreview(clientId: string): Promise<ActionResult<void>> {
  const check = await run(async () => {
    const store = await getStoreFor("clients");
    if (store.session.profile.role !== "agency") throw new StoreError("not_an_agency");
    if (!(await store.client(clientId))) throw new StoreError("client_not_available");
  });
  if (!check.ok) return check;
  (await cookies()).set(CLIENT_PREVIEW_COOKIE, clientId, cookieOptions);
  redirect("/app");
}

/** Quitte l'aperçu : retour à la fiche du client regardé. */
export async function endClientPreview() {
  const id = await getClientPreview();
  (await cookies()).delete(CLIENT_PREVIEW_COOKIE);
  redirect(id ? `/studio/clients/${id}` : "/studio/clients");
}
