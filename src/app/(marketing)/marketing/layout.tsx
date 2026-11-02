import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canAccessSpace, allowedModules } from "@/lib/permissions";
import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { isInfraError, setupChecks } from "@/lib/supabase/diagnostics";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { spaceLinks } from "@/lib/marketing/spaces";
import type { MarketingCounts } from "@/lib/marketing/types";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "agency") redirect("/app");
  if (!canAccessSpace(session.profile, "marketing")) redirect("/hub?refuse=marketing");

  const { profile, user, demo } = session;
  let counts: MarketingCounts = { prospects: 0, appointments: 0, emailsPending: 0 };
  try {
    const store = await requireMarketingSpace();
    counts = await store.counts();
  } catch (e) {
    if (isInfraError(e)) return <SetupRequired digest={e.digest} checks={await setupChecks()} retryHref="/marketing" />;
    throw e;
  }

  return (
    <AppShell variant="marketing" workspaceLabel="Espace marketing" demo={demo} accountHref="/studio/parametres"
      allowedModules={allowedModules(profile)} spaces={spaceLinks(profile, "marketing")}
      badges={{ marketing_relances: counts.emailsPending }}
      user={{ name: profile.display_name ?? user.email, email: user.email, title: profile.title, avatar: profile.avatar_url }}>
      {children}
    </AppShell>
  );
}
