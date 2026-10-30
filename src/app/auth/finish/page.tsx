import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/auth/redirects";
import { FinishClient } from "./finish-client";

export const metadata = { title: "Connexion en cours" };

/** Termine une connexion par lien email dont les jetons sont dans le fragment d'URL (invitation, lien renvoyé). */
export default async function FinishPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <FinishClient next={safeNext(next)} />
    </main>
  );
}
