import { cookies } from "next/headers";
import { requireAgency } from "@/lib/auth/session";
import { DEMO_RETURN_COOKIE } from "@/lib/supabase/env";
import { AppShell } from "@/components/layout/app-shell";
import type { PaletteItem } from "@/components/layout/command-palette";
import { QuickCreate } from "@/components/layout/quick-create";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { SetupRequired } from "@/components/layout/setup-required";
import { isInfraError, setupChecks } from "@/lib/supabase/diagnostics";
import { allowedModules, type ModuleKey } from "@/lib/permissions";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const store = await requireAgency();
  const { profile, user, demo } = store.session;
  const allowed = allowedModules(profile);
  const can = (m: ModuleKey) => allowed.includes(m);
  // On ne charge (et ne compte) que ce que le membre a le droit de voir : la RLS filtrerait de toute façon.
  const only = <T,>(ok: boolean, load: () => Promise<T[]>) => (ok ? load() : Promise.resolve([] as T[]));
  let loaded: Awaited<ReturnType<typeof loadShell>>;
  async function loadShell() {
    return Promise.all([
      store.clients(), only(can("briefs"), () => store.briefs()), only(can("livrables"), () => store.livrables()),
      only(can("taches"), () => store.tasks()), only(can("factures"), () => store.invoices()), only(can("documents"), () => store.documents()),
    ]);
  }
  try {
    loaded = await loadShell();
  } catch (e) {
    // Base pas à jour, accès refusé ou Supabase injoignable : on explique quoi faire au lieu d'une page d'erreur générique.
    if (isInfraError(e)) return <SetupRequired digest={e.digest} checks={await setupChecks()} retryHref="/studio" />;
    throw e;
  }
  const [clients, briefs, livrables, tasks, invoices, docs] = loaded;
  const today = new Date().toISOString().slice(0, 10);
  const badges = {
    briefs: briefs.filter((b) => b.status === "attente_ibra").length,
    livrables: livrables.filter((l) => l.status === "en_controle" || l.status === "correction").length,
    taches: tasks.filter((t) => t.status !== "termine" && t.due_date && t.due_date <= today).length,
    factures: invoices.filter((i) => i.status === "en_retard").length,
  };
  const inbox = can("inbox") ? badges.briefs + badges.livrables + badges.taches + badges.factures : 0;
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "";
  const paletteItems: PaletteItem[] = [
    ...(can("clients") ? clients.map((c) => ({ id: c.id, label: c.name, hint: c.sector ?? undefined, href: `/studio/clients/${c.id}`, group: "Clients" as const })) : []),
    ...briefs.slice(0, 40).map((b) => ({ id: b.id, label: b.title, hint: clientName(b.client_id), href: `/studio/briefs/${b.id}`, group: "Briefs" as const })),
    ...livrables.slice(0, 30).map((l) => ({ id: l.id, label: l.title, hint: clientName(l.client_id), href: `/studio/livrables/${l.id}`, group: "Livrables" as const })),
    ...docs.slice(0, 30).map((d) => ({ id: d.id, label: `${d.icon} ${d.title}`, hint: d.client_id ? clientName(d.client_id) : "Interne", href: `/studio/documents/${d.id}`, group: "Documents" as const })),
  ];
  const previewing = demo && (await cookies()).has(DEMO_RETURN_COOKIE);
  return (
    <AppShell variant="studio" workspaceLabel="Espace agence" demo={demo} badges={{ ...badges, inbox }} paletteItems={paletteItems} accountHref="/studio/parametres" allowedModules={allowed}
      user={{ name: profile.display_name ?? user.email, email: user.email, title: profile.title, avatar: profile.avatar_url }}
      quickCreate={<QuickCreate clients={clients.map((c) => ({ id: c.id, name: c.name }))} allowed={allowed} />}>
      {previewing ? <PreviewBanner name={profile.display_name ?? user.email} /> : null}
      {children}
    </AppShell>
  );
}
