import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, USER_HEADER, isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoStore, demoSession } from "@/lib/data/demo-store";
import { SupabaseStore } from "@/lib/data/supabase-store";
import type { DataStore, Session } from "@/lib/data/store";
import type { Profile } from "@/lib/data/types";
import { canAccess, sanitizePermissions, type ModuleKey } from "@/lib/permissions";
import { StoreError } from "@/lib/data/store";

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
  const forwarded = (await headers()).get(USER_HEADER);
  let user: { id: string; email: string } | null = null;
  if (forwarded && /^[0-9a-f-]{36}\|/i.test(forwarded)) {
    const sep = forwarded.indexOf("|");
    user = { id: forwarded.slice(0, sep), email: forwarded.slice(sep + 1) };
  } else {
    const { data } = await supabase.auth.getUser();
    if (data.user) user = { id: data.user.id, email: data.user.email ?? "" };
  }
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
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

/** Vrai quand un utilisateur Supabase est connecté mais n'a pas (ou plus) de profil valide. */
export async function isBlockedUser(): Promise<{ email: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const session = await getSession();
  return session ? null : { email: user.email ?? "" };
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

export async function requireClient(): Promise<DataStore & { clientId: string }> {
  const store = await getStore();
  if (store.session.profile.role !== "client" || !store.session.profile.client_id) redirect("/studio");
  return Object.assign(store, { clientId: store.session.profile.client_id });
}
