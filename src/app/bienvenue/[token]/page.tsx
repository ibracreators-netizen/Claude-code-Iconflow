import { headers } from "next/headers";
import { FolderOpen } from "lucide-react";
import { welcomePage } from "@/lib/marketing/onboarding-link-server";
import { localProgressKey, onboardingLinkPath } from "@/lib/marketing/onboarding-link";
import { MARKETING_ROLE } from "@/lib/marketing/types";
import { CARD, DocList, GONE, Neutral, PAUSED, UNAVAILABLE } from "./parts";
import { NotMe, OnboardingSteps, OpenForm } from "./welcome-client";

export const dynamic = "force-dynamic";

/**
 * Lien d'onboarding (/bienvenue/<jeton>), un seul pour toutes les recrues, sans compte. Jeton faux ou ancien : page
 * neutre ; lien coupé : « en pause ». Sinon : la recrue tape son e-mail, puis voit l'onboarding, les SOPs et les
 * ressources de son rôle.
 */
export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip")?.trim() || "anon";
  const data = await welcomePage(token, ip);

  if (data.state === "gone") return <Neutral {...GONE} />;
  if (data.state === "paused") return <Neutral {...PAUSED} />;
  if (data.state === "unavailable") return <Neutral {...UNAVAILABLE} />;
  if (data.state === "ask") return <OpenForm token={token} />;

  const href = (id: string) => `${onboardingLinkPath(token)}/document/${id}`;
  const roleLabel = MARKETING_ROLE[data.role];
  const nothing = !data.steps.length && !data.onboardingDocs.length && data.groups.every((g) => !g.docs.length);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-mk-strong">{data.firstName ? `Bonjour ${data.firstName}` : "Bonjour"}</h1>
        <span className="inline-flex h-7 items-center rounded-full border border-mk-teal/30 bg-mk-teal-soft px-3 text-[13px] font-semibold text-mk-teal">{roleLabel}</span>
      </div>

      {nothing ? (
        <section className={`${CARD} mt-5 px-5 py-8 text-center`}>
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon" aria-hidden><FolderOpen className="size-6" strokeWidth={1.8} /></span>
          <p className="mt-3 text-[17px] font-semibold leading-snug text-mk-strong">Ton responsable n&apos;a pas encore ajouté de contenu pour ton rôle.</p>
          <p className="mt-1.5 text-[15px] text-mk-sub">Reviens plus tard avec le même lien.</p>
        </section>
      ) : (
        <>
          <p className="mt-1.5 text-[16px] leading-relaxed text-mk-sub">Voici ton onboarding, tes SOPs et tes ressources de {roleLabel.toLowerCase()}. Avance à ton rythme.</p>

          <section className={`${CARD} mt-5 overflow-hidden`} aria-labelledby="bv-onboarding">
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <h2 id="bv-onboarding" className="text-[18px] font-semibold text-mk-strong">Onboarding</h2>
              <p className="mt-0.5 text-[14px] text-mk-sub">{data.steps.length ? "Coche chaque étape quand tu l'as terminée." : "Les étapes de ton onboarding ne sont pas encore définies."}</p>
            </div>
            {data.steps.length ? (
              <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                <OnboardingSteps token={token} kind={data.kind} storageKey={localProgressKey(data.personId)} done={data.done}
                  steps={data.steps.map((s) => ({ ...s, href: s.document_id ? href(s.document_id) : null }))} />
              </div>
            ) : <div className="h-4 sm:h-5" />}
            {data.onboardingDocs.length ? (
              <div className="border-t border-mk-line">
                <h3 className="px-4 pt-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-mk-sub sm:px-5">Documents d&apos;onboarding</h3>
                <DocList docs={data.onboardingDocs} href={href} />
              </div>
            ) : null}
          </section>

          {data.groups.map((g) => (
            <section key={g.key} className={`${CARD} mt-4 overflow-hidden`} aria-labelledby={`bv-${g.key}`}>
              <div className="flex items-baseline justify-between gap-3 border-b border-mk-line px-4 py-3.5 sm:px-5">
                <h2 id={`bv-${g.key}`} className="min-w-0 truncate text-[18px] font-semibold text-mk-strong">{g.name}</h2>
                <span className="shrink-0 text-[13px] text-mk-sub tabular-nums">{g.docs.length} document{g.docs.length > 1 ? "s" : ""}</span>
              </div>
              <DocList docs={g.docs} href={href} empty={g.name === "SOPs" ? "Aucune SOP pour l'instant." : "Rien pour l'instant."} />
            </section>
          ))}
        </>
      )}

      <NotMe />
    </div>
  );
}
