import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canAccessSpace, allowedModules } from "@/lib/permissions";
import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { isInfraError, setupChecks } from "@/lib/supabase/diagnostics";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { spaceLinks } from "@/lib/marketing/spaces";
import { checkScheduler } from "@/lib/marketing/inbox";
import type { MarketingCounts, SchedulerState } from "@/lib/marketing/types";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "agency") redirect("/app");
  if (!canAccessSpace(session.profile, "marketing")) redirect("/hub?refuse=marketing");

  const { profile, user, demo } = session;
  let counts: MarketingCounts = { prospects: 0, appointments: 0, emailsPending: 0 };
  let scheduler: SchedulerState = "ok";
  try {
    const store = await requireMarketingSpace();
    counts = await store.counts();
    // Hors démo : si le planificateur ne tourne plus, on le dit en haut de chaque page (et on alerte par email).
    if (!store.demo) scheduler = (await checkScheduler()).state;
  } catch (e) {
    if (isInfraError(e)) return <SetupRequired digest={e.digest} checks={await setupChecks()} retryHref="/marketing" />;
    throw e;
  }

  return (
    <AppShell variant="marketing" workspaceLabel="Espace marketing" demo={demo} accountHref="/studio/parametres"
      allowedModules={allowedModules(profile)} spaces={spaceLinks(profile, "marketing")}
      badges={{ marketing_relances: counts.emailsPending, marketing_reception: counts.inboxAttention ?? 0 }}
      user={{ name: profile.display_name ?? user.email, email: user.email, title: profile.title, avatar: profile.avatar_url }}>
      {scheduler === "arrete" || scheduler === "jamais" ? (
        <p role="alert" className="mb-5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[13px] text-warning">
          <b className="font-semibold">Planificateur {scheduler === "jamais" ? "jamais exécuté" : "arrêté"}.</b> Les leads reçus sont en sécurité dans <a href="/marketing/reception" className="underline">Réception</a>, mais ils ne deviennent plus des prospects tout seuls.
        </p>
      ) : null}
      {children}
    </AppShell>
  );
}
