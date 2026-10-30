import { requireAgency } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { studioNav } from "@/components/layout/nav";
import type { PaletteItem } from "@/components/layout/command-palette";
import { QuickCreate } from "@/components/layout/quick-create";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const store = await requireAgency();
  const { profile, user, demo } = store.session;
  const [clients, briefs, livrables, tasks, invoices, docs] = await Promise.all([
    store.clients(), store.briefs(), store.livrables(), store.tasks(), store.invoices(), store.documents(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const badges = {
    briefs: briefs.filter((b) => b.status === "attente_ibra").length,
    livrables: livrables.filter((l) => l.status === "en_controle" || l.status === "correction").length,
    taches: tasks.filter((t) => t.status !== "termine" && t.due_date && t.due_date <= today).length,
    factures: invoices.filter((i) => i.status === "en_retard").length,
  };
  const inbox = badges.briefs + badges.livrables + badges.taches + badges.factures;
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "";
  const paletteItems: PaletteItem[] = [
    ...clients.map((c) => ({ id: c.id, label: c.name, hint: c.sector ?? undefined, href: `/studio/clients/${c.id}`, group: "Clients" as const })),
    ...briefs.slice(0, 40).map((b) => ({ id: b.id, label: b.title, hint: clientName(b.client_id), href: `/studio/briefs/${b.id}`, group: "Briefs" as const })),
    ...livrables.slice(0, 30).map((l) => ({ id: l.id, label: l.title, hint: clientName(l.client_id), href: `/studio/livrables/${l.id}`, group: "Livrables" as const })),
    ...docs.slice(0, 30).map((d) => ({ id: d.id, label: `${d.icon} ${d.title}`, hint: d.client_id ? clientName(d.client_id) : "Interne", href: `/studio/documents/${d.id}`, group: "Documents" as const })),
  ];
  return (
    <AppShell nav={studioNav} workspaceLabel="Espace agence" demo={demo} badges={{ ...badges, inbox }} paletteItems={paletteItems} accountHref="/studio/parametres"
      user={{ name: profile.display_name ?? user.email, email: user.email, title: profile.title, avatar: profile.avatar_url }}
      quickCreate={<QuickCreate clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}>
      {children}
    </AppShell>
  );
}
