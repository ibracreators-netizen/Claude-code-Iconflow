import type { Metadata } from "next";
import { unsubscribeProspect } from "@/lib/marketing/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Désinscription · icon-flow", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const res = p ? await unsubscribeProspect(p) : { ok: false as const, error: "Lien invalide." };
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
        <div className="text-[22px] font-semibold tracking-[-0.035em] text-fg">iconflow<span className="text-accent-2">.</span></div>
        <div className="card mt-8 p-6">
          <h1 className="text-[18px] font-semibold">{res.ok ? "Désinscription confirmée" : "Désinscription"}</h1>
          <p className="mt-2 text-[14px] text-muted">{res.ok ? res.message : res.error}</p>
        </div>
      </div>
    </main>
  );
}
