"use server";
import { getStore } from "@/lib/auth/session";
import { allowedModules, type ModuleKey } from "@/lib/permissions";
import type { PaletteItem } from "@/components/layout/command-palette";

/**
 * Éléments de la recherche ⌘K (clients, briefs, livrables, documents), chargés seulement
 * à l'ouverture de la palette : rien de tout cela ne pèse sur les navigations.
 */
export async function loadPalette(): Promise<PaletteItem[]> {
  try {
    const store = await getStore();
    if (store.session.profile.role !== "agency") return [];
    const allowed = allowedModules(store.session.profile);
    const can = (m: ModuleKey) => allowed.includes(m);
    const only = <T,>(ok: boolean, load: () => Promise<T[]>) => (ok ? load() : Promise.resolve([] as T[]));
    const [clients, briefs, livrables, docs] = await Promise.all([
      store.clients(), only(can("briefs"), () => store.briefs()), only(can("livrables"), () => store.livrables()), only(can("documents"), () => store.documents()),
    ]);
    const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "";
    return [
      ...(can("clients") ? clients.map((c) => ({ id: c.id, label: c.name, hint: c.sector ?? undefined, href: `/studio/clients/${c.id}`, group: "Clients" as const })) : []),
      ...briefs.slice(0, 40).map((b) => ({ id: b.id, label: b.title, hint: clientName(b.client_id), href: `/studio/briefs/${b.id}`, group: "Briefs" as const })),
      ...livrables.slice(0, 30).map((l) => ({ id: l.id, label: l.title, hint: clientName(l.client_id), href: `/studio/livrables/${l.id}`, group: "Livrables" as const })),
      ...docs.slice(0, 30).map((d) => ({ id: d.id, label: `${d.icon} ${d.title}`, hint: d.client_id ? clientName(d.client_id) : "Interne", href: `/studio/documents/${d.id}`, group: "Documents" as const })),
    ];
  } catch {
    return [];
  }
}
