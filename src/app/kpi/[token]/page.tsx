import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { LinkIcon } from "lucide-react";
import { publicKpiPage } from "@/lib/marketing/kpi-links-server";
import { KpiLinkForm } from "./kpi-form";

export const dynamic = "force-dynamic";
// Lien personnel : jamais indexé, jamais transmis à un autre site (en-tête Referer), jamais mis en cache.
export const metadata: Metadata = { title: { absolute: "Suivi du jour · IconFlow" }, robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: "#00695c" };

/**
 * Page du lien personnel de saisie des KPI (/kpi/<jeton>), pour un setter ou un closer, sans compte.
 * Pensée pour le téléphone. Elle ne montre que le prénom, le rôle et les saisies de la personne du lien.
 * Lien inconnu ou désactivé : une page sobre qui ne révèle rien.
 */
export default async function KpiLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip")?.trim() || "anon";
  const data = await publicKpiPage(token, ip);

  return (
    <main className="min-h-dvh bg-bg text-mk-text">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-[max(env(safe-area-inset-bottom),28px)] pt-[max(env(safe-area-inset-top),12px)]">
        <header className="flex h-14 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- petit logo statique, déjà à la bonne taille */}
          <img src="/brand/marketing-logo-96.png" alt="" width={32} height={32} className="size-8 rounded-[8px]" />
          <p className="text-[15px] font-semibold text-mk-strong">IconFlow <span className="font-normal text-mk-sub">·</span> Suivi du jour</p>
        </header>
        {data.state === "ok" ? (
          <KpiLinkForm token={token} firstName={data.firstName} role={data.role} today={data.today} days={data.days} entries={data.entries} />
        ) : (
          <section className="mt-10 rounded-[16px] border border-mk-line bg-surface px-5 py-10 text-center shadow-soft">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon" aria-hidden><LinkIcon className="size-6" strokeWidth={1.8} /></span>
            <h1 className="mt-4 text-[20px] font-semibold leading-snug text-mk-strong">{data.state === "gone" ? "Ce lien n'est plus actif." : "La saisie n'est pas disponible pour le moment."}</h1>
            <p className="mt-2 text-[16px] leading-relaxed text-mk-sub">{data.state === "gone" ? "Demande un nouveau lien à ton responsable." : "Réessaie un peu plus tard. Si ça dure, préviens ton responsable."}</p>
          </section>
        )}
      </div>
    </main>
  );
}
