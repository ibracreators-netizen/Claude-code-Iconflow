import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/auth/redirects";
import { PasswordForm } from "@/components/account/password-form";

export const metadata = { title: "Bienvenue" };

/** Première connexion après une invitation : choix du mot de passe (le lien magique reste possible). */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const home = session.profile.role === "agency" ? "/studio" : "/app";
  if (!isSupabaseConfigured()) redirect(home);
  const target = next && next !== "/" ? safeNext(next, home) : home;
  const firstName = (session.profile.display_name ?? "").split(" ")[0] || null;
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-[460px] animate-rise">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/brand/iconflow-logo-96.png" alt="" width={36} height={36} className="rounded-lg bg-[#0b100c]" priority />
          <span className="text-lg font-semibold tracking-tight">iconflow<span className="text-accent-2">.</span></span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">{firstName ? `Bienvenue, ${firstName}.` : "Bienvenue."}</h1>
        <p className="mt-2 text-[14.5px] text-muted">Ton compte est ouvert. Choisis un mot de passe pour te reconnecter facilement ; tu pourras aussi toujours demander un lien par email.</p>
        <div className="mt-7 rounded-2xl bg-surface p-5 shadow-soft hairline">
          <PasswordForm redirectTo={target} submitLabel="Enregistrer et entrer" />
        </div>
        <p className="mt-5 text-center text-[13px] text-muted"><Link href={target} className="font-medium text-accent-2 hover:underline">Plus tard, entrer directement →</Link></p>
      </div>
    </main>
  );
}
