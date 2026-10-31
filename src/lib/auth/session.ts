import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, USER_HEADER, isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoStore, demoSession } from "@/lib/data/demo-store";
import { SupabaseStore } from "@/lib/data/supabase-store";
import type { DataStore, Session } from "@/lib/data/store";
import { isClientVisibleActivity, type Profile } from "@/lib/data/types";
import { canAccess, sanitizePermissions, type ModuleKey } from "@/lib/permissions";
import { StoreError } from "@/lib/data/store";

/**
 * Identité portée par le jeton d'accès du cookie, décodée sans vérification de signature.
 * Elle ne sert qu'à confirmer l'en-tête posé par le proxy (qui, lui, a vérifié le jeton auprès de Supabase Auth) :
 * toute lecture de données passe ensuite par la RLS avec ce même jeton, qu'un jeton falsifié ne franchit pas.
 */
async function tokenClaims(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ sub: string; email: string | null } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: unknown; email?: unknown };
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  } catch {
    return null;
  }
}

/** Session courante (Supabase ou démo). null si non connecté. Mémoïsée par requête. */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  if (!isSupabaseConfigured()) {
    const persona = cookieStore.get(DEMO_COOKIE)?.value;
    return persona ? demoSession(persona) : null;
  }
  const supabase = await createClient();
  // Le proxy a déjà vérifié le jeton auprès de Supabase Auth et transmet l'identité : on évite un second aller-retour.
  // Le profil est ensuite lu avec le jeton du cookie (RLS) : un jeton invalide ne renvoie rien.
  // L'en-tête n'est qu'un raccourci : il n'est cru que s'il désigne le même compte que le jeton du cookie.
  const forwarded = (await headers()).get(USER_HEADER);
  let user: { id: string; email: string } | null = null;
  if (forwarded && /^[0-9a-f-]{36}\|/i.test(forwarded)) {
    const sep = forwarded.indexOf("|");
    const claims = await tokenClaims(supabase);
    if (claims && claims.sub === forwarded.slice(0, sep)) user = { id: claims.sub, email: claims.email ?? forwarded.slice(sep + 1) };
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    if (data.user) user = { id: data.user.id, email: data.user.email ?? "" };
  }
  if (!user) return null;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  // Base pas à jour, injoignable ou accès refusé : on le dit (écran d'installation), au lieu d'un faux « accès retiré ».
  if (profileError) throw new StoreError(profileError.message, profileError.code);
  if (!profile || !["agency", "client"].includes(profile.role)) return null;
  if (profile.role === "client" && !profile.client_id) return null;
  if (profile.disabled_at) return null; // accès retiré par l'agence
  const full: Profile = {
    ...(profile as Profile),
    permissions: profile.role === "agency" ? sanitizePermissions(profile.permissions) : null,
    disabled_at: profile.disabled_at ?? null,
    invited_by: profile.invited_by ?? null,
  };
  return { user: { id: user.id, email: user.email ?? "" }, profile: full, demo: false };
});

export type BlockReason = "no_profile" | "disabled" | "no_space" | "bad_role";

/** Utilisateur Supabase connecté mais sans profil valide : qui, et pourquoi (pour un message exact sur /login). */
export async function isBlockedUser(): Promise<{ email: string; reason: BlockReason } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (await getSession()) return null;
  const { data: profile, error } = await supabase.from("profiles").select("role, client_id, disabled_at").eq("id", user.id).maybeSingle();
  if (error) throw new StoreError(error.message, error.code);
  const reason: BlockReason = !profile ? "no_profile" : profile.disabled_at ? "disabled" : profile.role === "client" && !profile.client_id ? "no_space" : "bad_role";
  return { email: user.email ?? "", reason };
}

/** Magasin de données lié à la session. Redirige vers /login si absent. */
export const getStore = cache(async (): Promise<DataStore> => {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.demo) return new DemoStore(session);
  return new SupabaseStore(await createClient(), session);
});

/** Espace agence. Avec `module`, vérifie aussi le droit d'accès au module (profiles.permissions). */
export async function requireAgency(module?: ModuleKey): Promise<DataStore> {
  const store = await getStore();
  if (store.session.profile.role !== "agency") redirect("/app");
  if (module && !canAccess(store.session.profile, module)) redirect(`/studio?refuse=${module}`);
  return store;
}

/** Magasin pour une server action de l'espace agence : refuse si le module n'est pas autorisé. */
export async function getStoreFor(module: ModuleKey): Promise<DataStore> {
  return getStoreForAny([module]);
}

/** Variante : l'un des modules suffit (ex. le suivi agence s'édite depuis Clients comme depuis Pipeline). */
export async function getStoreForAny(modules: ModuleKey[]): Promise<DataStore> {
  const store = await getStore();
  if (store.session.profile.role === "agency" && !modules.some((m) => canAccess(store.session.profile, m))) throw new StoreError("forbidden_module");
  return store;
}

/* ─── Espace client ─────────────────────────────────────────────────────── */

/** Aperçu de l'espace client par l'agence : le cookie (httpOnly, 24 h) porte l'identifiant du client regardé. */
export const CLIENT_PREVIEW_COOKIE = "iconflow_client_preview";

/** Identifiant du client en aperçu (cookie), ou null. Mémoïsé par requête. */
export const getClientPreview = cache(async (): Promise<string | null> => {
  const value = (await cookies()).get(CLIENT_PREVIEW_COOKIE)?.value ?? "";
  return /^[0-9a-zA-Z_-]{1,64}$/.test(value) ? value : null;
});

export type ClientStore = DataStore & { clientId: string; preview: boolean };

/**
 * Vue « comme le client » d'un magasin agence (aperçu) : ce qu'un compte client ne voit jamais est retiré
 * (scripts en rédaction, documents et fichiers internes, factures brouillon, événements internes du journal). Les autres lectures gardent les droits du membre.
 */
function clientView(store: DataStore): DataStore {
  const view: DataStore = Object.create(store);
  view.briefs = async (opts) => (await store.briefs(opts)).filter((b) => b.status !== "redaction");
  view.brief = async (id) => { const b = await store.brief(id); return b && b.status !== "redaction" ? b : null; };
  view.documents = async (opts) => (await store.documents(opts)).filter((d) => d.shared_with_client);
  view.document = async (id) => { const d = await store.document(id); return d?.shared_with_client ? d : null; };
  view.files = async (opts) => (await store.files(opts)).filter((f) => f.shared_with_client);
  view.invoices = async (opts) => (await store.invoices(opts)).filter((i) => i.status !== "brouillon");
  view.invoice = async (id) => { const i = await store.invoice(id); return i && i.status !== "brouillon" ? i : null; };
  view.activity = async (opts) => (await store.activity(opts)).filter(isClientVisibleActivity); // événements internes à l'agence
  return view;
}

/**
 * Espace client. Un compte client voit son espace. Un membre de l'agence ayant le module « clients » y accède en aperçu
 * quand le cookie d'aperçu est posé (startClientPreview) : lectures avec ses propres droits, actions refusées par portal.ts.
 */
export async function requireClient(): Promise<ClientStore> {
  const store = await getStore();
  const { profile } = store.session;
  if (profile.role === "client" && profile.client_id) return Object.assign(store, { clientId: profile.client_id, preview: false });
  const previewId = profile.role === "agency" && canAccess(profile, "clients") ? await getClientPreview() : null;
  if (previewId) return Object.assign(clientView(store), { clientId: previewId, preview: true });
  redirect("/studio");
}
