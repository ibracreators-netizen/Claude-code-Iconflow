import { requireClient } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { isInfraError, setupChecks } from "@/lib/supabase/diagnostics";
import type { Client } from "@/lib/data/types";
import type { ShellCounts } from "@/lib/data/store";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const store = await requireClient();
  const { profile, user, demo } = store.session;
  let client: Client | null;
  let counts: ShellCounts;
  try {
    [client, counts] = await Promise.all([store.client(store.clientId), store.shellCounts()]);
  } catch (e) {
    if (isInfraError(e)) return <SetupRequired digest={e.digest} checks={await setupChecks()} retryHref="/app" />;
    throw e;
  }
  return (
    <AppShell variant="portal" workspaceLabel={client?.name ?? "Espace client"} demo={demo} badges={{ validations: counts.validations, inbox: counts.validations }} accountHref="/app/compte"
      user={{ name: profile.display_name ?? user.email, email: user.email, title: client?.name, avatar: profile.avatar_url }}>
      {children}
    </AppShell>
  );
}
