import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE, isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoStore, demoSession } from "@/lib/data/demo-store";
import { SupabaseStore } from "@/lib/data/supabase-store";
import type { DataStore, Session } from "@/lib/data/store";
import type { Profile } from "@/lib/data/types";

/** Session courante (Supabase ou démo). null si non connecté. Mémoïsée par requête. */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  if (!isSupabaseConfigured()) {
    const role = cookieStore.get(DEMO_COOKIE)?.value;
    return role === "agency" || role === "client" ? demoSession(role) : null;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || !["agency", "client"].includes(profile.role)) return null;
  if (profile.role === "client" && !profile.client_id) return null;
  return { user: { id: user.id, email: user.email ?? "" }, profile: profile as Profile, demo: false };
});

/** Magasin de données lié à la session. Redirige vers /login si absent. */
export const getStore = cache(async (): Promise<DataStore> => {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.demo) return new DemoStore(session);
  return new SupabaseStore(await createClient(), session);
});

export async function requireAgency(): Promise<DataStore> {
  const store = await getStore();
  if (store.session.profile.role !== "agency") redirect("/app");
  return store;
}

export async function requireClient(): Promise<DataStore & { clientId: string }> {
  const store = await getStore();
  if (store.session.profile.role !== "client" || !store.session.profile.client_id) redirect("/studio");
  return Object.assign(store, { clientId: store.session.profile.client_id });
}
