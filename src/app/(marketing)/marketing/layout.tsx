import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canAccess, canAccessSpace, allowedModules } from "@/lib/permissions";
import { MarketingShell } from "@/components/marketing/shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { isInfraError, setupChecks } from "@/lib/supabase/diagnostics";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { spaceLinks } from "@/lib/marketing/spaces";
import { checkScheduler } from "@/lib/marketing/inbox";
import { shellInfo } from "@/lib/marketing/crm-server";
import { myTodoSummary } from "@/lib/marketing/home-server";
import { MARKETING_ROLE, type SchedulerState } from "@/lib/marketing/types";

/* Marketing est une application à part : son nom, son icône et son fichier d'installation (téléphone). */
export const metadata: Metadata = {
  title: { default: "IconFlow Marketing", template: "%s · IconFlow Marketing" },
  applicationName: "IconFlow Marketing",
  manifest: "/marketing.webmanifest",
  appleWebApp: { capable: true, title: "Marketing", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#000000" }, { media: "(prefers-color-scheme: light)", color: "#ffffff" }],
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/marketing");
  if (session.profile.role !== "agency" && session.profile.role !== "marketing") redirect("/app");
  if (!canAccessSpace(session.profile, "marketing")) redirect("/hub?refuse=marketing");

  const { profile, user, demo } = session;
  let scheduler: SchedulerState = "ok";
  let shell: { myTasks: number; missing: string[] } = { myTasks: 0, missing: [] };
  let attention = 0;
  // Ce qui m'attend (tâches, prochaines actions, résultats d'appel à saisir) : les mêmes éléments que Tâches ›
  // Éléments à faire et que la page Notifications. null : pas d'accès aux Tâches, ou lecture impossible.
  let todo: number | null = null;
  try {
    const store = await requireMarketingSpace();
    // Tout part en même temps : tâches à faire, base à jour, leads reçus à vérifier,
    // et, pour l'agence seulement, l'état du planificateur.
    const [sh, counts, sched, mine] = await Promise.all([
      shellInfo(store).catch(() => shell),
      canAccess(profile, "marketing_reception") ? store.counts().catch(() => null) : Promise.resolve(null),
      !store.demo && profile.role === "agency" ? checkScheduler().then((r) => r.state).catch((): SchedulerState => "ok") : Promise.resolve<SchedulerState>("ok"),
      canAccess(profile, "marketing_taches")
        ? store.settings().catch(() => null).then((s) => myTodoSummary(s?.timezone ?? "Europe/Paris")).then((t) => t?.open ?? null).catch(() => null)
        : Promise.resolve(0),
    ]);
    shell = sh; attention = counts?.inboxAttention ?? 0; scheduler = sched; todo = mine;
  } catch (e) {
    if (isInfraError(e)) return <SetupRequired digest={e.digest} checks={await setupChecks()} retryHref="/marketing" />;
    throw e;
  }
  const schedulerDown = scheduler === "arrete" || scheduler === "jamais";
  const roleLabel = profile.role === "marketing" && profile.marketing_role ? MARKETING_ROLE[profile.marketing_role] : "Marketing";

  return (
    <MarketingShell user={{ name: profile.display_name ?? user.email, email: user.email, avatar: profile.avatar_url }} accountHref="/marketing/parametres"
      spaces={spaceLinks(profile, "marketing")} allowedModules={allowedModules(profile)} badges={{ marketing_taches: todo ?? shell.myTasks }}
      alerts={(todo ?? shell.myTasks) + attention + (schedulerDown ? 1 : 0)} demo={demo} roleLabel={roleLabel}>
      {shell.missing.length ? (
        <p role="alert" className="mb-4 rounded-xl border border-mk-danger/30 bg-mk-danger/10 px-3.5 py-2.5 text-[13px] text-mk-danger">
          <b className="font-semibold">La base n&apos;est pas à jour.</b> Cette version de l&apos;application attend {shell.missing.length > 1 ? "des migrations qui ne sont pas appliquées" : "une migration qui n'est pas appliquée"} : <span className="font-mono">{shell.missing.join(", ")}</span>. Certaines pages peuvent afficher une erreur tant que ce n&apos;est pas fait.
        </p>
      ) : null}
      {children}
    </MarketingShell>
  );
}
