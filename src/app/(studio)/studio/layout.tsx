import { cookies } from "next/headers";
import { requireAgency } from "@/lib/auth/session";
import { DEMO_RETURN_COOKIE } from "@/lib/supabase/env";
import { AppShell } from "@/components/layout/app-shell";
import { QuickCreate } from "@/components/layout/quick-create";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { SetupRequired } from "@/components/layout/setup-required";
import { isInfraError, setupChecks } from "@/lib/supabase/diagnostics";
import { allowedModules, type ModuleKey } from "@/lib/permissions";
import type { ShellCounts } from "@/lib/data/store";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const store = await requireAgency();
  const { profile, user, demo } = store.session;
  const allowed = allowedModules(profile);
  const can = (m: ModuleKey) => allowed.includes(m);
  // Le shell ne charge que des compteurs (requêtes HEAD, aucune ligne) ; la recherche ⌘K se charge à l'ouverture.
  let counts: ShellCounts;
  try {
    counts = await store.shellCounts();
  } catch (e) {
    // Base pas à jour, accès refusé ou Supabase injoignable : on explique quoi faire au lieu d'une page d'erreur générique.
    if (isInfraError(e)) return <SetupRequired digest={e.digest} checks={await setupChecks()} retryHref="/studio" />;
    throw e;
  }
  const badges = {
    briefs: can("briefs") ? counts.briefs : 0,
    livrables: can("livrables") ? counts.livrables : 0,
    taches: can("taches") ? counts.taches : 0,
    factures: can("factures") ? counts.factures : 0,
  };
  const inbox = can("inbox") ? badges.briefs + badges.livrables + badges.taches + badges.factures : 0;
  const previewing = demo && (await cookies()).has(DEMO_RETURN_COOKIE);
  return (
    <AppShell variant="studio" workspaceLabel="Espace agence" demo={demo} badges={{ ...badges, inbox }} accountHref="/studio/parametres" allowedModules={allowed}
      user={{ name: profile.display_name ?? user.email, email: user.email, title: profile.title, avatar: profile.avatar_url }}
      quickCreate={<QuickCreate allowed={allowed} />}>
      {previewing ? <PreviewBanner name={profile.display_name ?? user.email} /> : null}
      {children}
    </AppShell>
  );
}
