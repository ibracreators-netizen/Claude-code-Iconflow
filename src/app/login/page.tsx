import Image from "next/image";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSession, isBlockedUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/supabase/env";
import { buttonVariants } from "@/components/ui/button";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const configured = isSupabaseConfigured();
  const session = await getSession();
  if (session) redirect(next && next.startsWith("/") ? next : session.profile.role === "agency" ? "/studio" : "/app");
  const blocked = await isBlockedUser();
  const staleDemo = !configured && (await cookies()).has(DEMO_COOKIE);
  return (
    <main className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panneau de marque */}
      <section className="relative hidden overflow-hidden bg-[#070a08] lg:flex lg:flex-col lg:justify-between p-12 text-white">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.35]" />
        <div className="pointer-events-none absolute -left-32 top-1/3 size-[520px] rounded-full bg-accent/20 blur-[140px]" />
        <div className="pointer-events-none absolute right-0 bottom-0 size-[420px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="relative flex items-center gap-3">
          <Image src="/brand/iconflow-logo-96.png" alt="" width={40} height={40} className="rounded-xl shadow-glow" priority />
          <span className="text-xl font-semibold tracking-tight">iconflow<span className="text-accent">.</span></span>
        </div>
        <div className="relative max-w-lg animate-rise">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent"><span className="size-1.5 rounded-full bg-accent animate-pulse-soft" />Studio · espace agence & clients</div>
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-balance">Des créatives qui convertissent. <span className="text-white/55">Un seul endroit pour tout piloter.</span></h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/60">Brain, scripts, validations, livrables, documents, fichiers et facturation. Plus de Drive, plus de Notion : tout est ici, au propre.</p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[["1 235+", "créatives produites"], ["3,8x", "ROAS stabilisé"], ["-35 %", "de CPA en moyenne"]].map(([v, l]) => (
              <div key={l}><dt className="text-[24px] font-semibold tracking-tight tabular">{v}</dt><dd className="text-[12px] text-white/50">{l}</dd></div>
            ))}
          </dl>
        </div>
        <p className="relative text-[12px] text-white/35">© {new Date().getFullYear()} icon-flow.fr · Partenaire créatif payé aux résultats</p>
      </section>

      {/* Formulaire */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px] animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/brand/iconflow-logo-96.png" alt="" width={36} height={36} className="rounded-lg bg-[#0b100c]" priority />
            <span className="text-lg font-semibold tracking-tight">iconflow<span className="text-accent-2">.</span></span>
          </div>
          <h2 className="text-[24px] font-semibold tracking-tight">Connexion au studio</h2>
          <p className="mt-1 text-[14px] text-muted">Retrouve ton espace de création.</p>
          {error === "lien" ? <p className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">Ce lien de connexion est invalide ou expiré. Demande-en un nouveau.</p> : null}
          {staleDemo ? <form action="/auth/signout" method="post" className="mt-4"><p className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-[13px] text-warning">Ce persona de démo n&apos;a plus accès (compte retiré). Réinitialise la session pour continuer.</p><button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>Réinitialiser la session démo</button></form> : null}
          {blocked ? (
            <div className="mt-7 space-y-4">
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-[13.5px]">
                <p className="font-semibold">Ce compte n&apos;a pas accès au studio</p>
                <p className="mt-1 text-muted">Connecté en tant que <span className="font-medium text-fg">{blocked.email}</span>. L&apos;accès a été retiré ou le compte n&apos;est rattaché à aucun espace. Contacte l&apos;équipe icon-flow.</p>
              </div>
              <form action="/auth/signout" method="post"><button type="submit" className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}>Se déconnecter</button></form>
            </div>
          ) : <LoginForm configured={configured} next={next} />}
        </div>
      </section>
    </main>
  );
}
