import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { welcomeDocument } from "@/lib/marketing/onboarding-link-server";
import { onboardingLinkPath } from "@/lib/marketing/onboarding-link";
import { RESOURCE_KIND, type ResourceKind } from "@/lib/marketing/resources";
import { CARD, GONE, Neutral, UNAVAILABLE } from "../../parts";
import { DocViewer } from "./doc-viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Document · IconFlow" } };

/**
 * Un document du lien d'onboarding, en lecture seule. Servi seulement si le lien est valable, l'accès ouvert sur cet
 * appareil, et le document rangé dans un dossier du rôle de la recrue (ou commun). Aucun bouton d'édition.
 */
export default async function WelcomeDocumentPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip")?.trim() || "anon";
  const data = await welcomeDocument(token, id, ip);
  if (data.state === "gone") return <Neutral {...GONE} />;
  if (data.state === "unavailable") return <Neutral {...UNAVAILABLE} />;
  // Accès pas encore ouvert (ou expiré) : retour au formulaire du lien.
  if (data.state === "ask") redirect(onboardingLinkPath(token));

  const back = (
    <Link href={onboardingLinkPath(token)} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-[15px] font-semibold text-accent-2 transition active:bg-mk-chip">
      <ChevronLeft className="size-5" aria-hidden />Mon onboarding
    </Link>
  );
  if (data.state === "missing") return (
    <div className="mt-2">
      {back}
      <Neutral title="Ce document n'est pas disponible." text="Il a peut-être été retiré. Retourne à ton onboarding pour voir la liste à jour." />
    </div>
  );

  const empty = !data.doc.content.replace(/<[^>]+>/g, "").trim();
  return (
    <div className="mt-2">
      {back}
      <article className={`${CARD} mt-2 px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center rounded-full border border-mk-teal/30 bg-mk-teal-soft px-3 text-[13px] font-semibold text-mk-teal">{RESOURCE_KIND[data.doc.kind as ResourceKind] ?? "Document"}</span>
          <span className="text-[13px] text-mk-sub">Lecture seule</span>
        </div>
        <h1 className="mb-4 break-words text-[24px] font-semibold leading-tight tracking-[-0.01em] text-mk-strong lg:text-[28px]">{data.doc.title}</h1>
        {empty ? <p className="text-[15px] text-mk-sub">Ce document est encore vide.</p> : <DocViewer content={data.doc.content} />}
      </article>
    </div>
  );
}
