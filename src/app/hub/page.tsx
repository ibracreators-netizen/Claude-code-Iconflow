import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Megaphone, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { canAccessSpace } from "@/lib/permissions";

export const metadata: Metadata = { title: "Ibra Group" };

export default async function HubPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "agency") redirect("/app");
  const canMarketing = canAccessSpace(session.profile, "marketing");
  const first = (session.profile.display_name ?? "").split(" ")[0] || "Ibra";

  const cards = [
    { href: "/studio", title: "IconFlow Studio", desc: "Clients, briefs, livrables, Brain, documents, facturation.", icon: Sparkles, show: true },
    { href: "/marketing", title: "IconFlow Marketing", desc: "Prospects, calendrier de réservation, relances et données d'acquisition.", icon: Megaphone, show: canMarketing },
  ].filter((c) => c.show);

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-24">
        <div className="mb-10">
          <div className="text-[26px] font-semibold tracking-[-0.035em] text-fg">iconflow<span className="text-accent-2">.</span></div>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Ibra Group</p>
          <h1 className="mt-4 text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">Bonjour {first}. Où va-t-on ?</h1>
          <p className="mt-2 text-[15px] text-muted">Deux espaces, un seul compte. Choisis par où commencer.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="card group flex flex-col gap-3 p-6 transition hover:border-border-strong hover:shadow-pop">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-2"><c.icon className="size-5" /></span>
              <span className="text-[17px] font-semibold tracking-tight">{c.title}</span>
              <span className="text-[13.5px] leading-relaxed text-muted">{c.desc}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent-2">Ouvrir <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
            </Link>
          ))}
        </div>
        {!canMarketing ? <p className="mt-6 text-[12.5px] text-muted-2">L&apos;espace Marketing n&apos;est pas activé pour ton compte. Un administrateur peut l&apos;accorder dans Équipe &amp; accès.</p> : null}
      </div>
    </main>
  );
}
