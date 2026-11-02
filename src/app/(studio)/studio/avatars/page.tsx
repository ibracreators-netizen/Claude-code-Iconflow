import type { Metadata } from "next";
import { requireAgency } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { FilterBar } from "../_prod/filter-bar";
import { one, type SP } from "../_prod/params";
import { AvatarsStudio, type AvatarRow } from "./avatars-studio";

export const metadata: Metadata = { title: "Avatars" };

export default async function StudioAvatarsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("clients");
  const clientFilter = one(sp.client);
  const clients = await store.clients();
  // Les avatars sont par client : on agrège (peu de clients) et on filtre côté serveur si besoin.
  const lists = await Promise.all(clients.map((c) => store.avatars(c.id)));
  const all: AvatarRow[] = clients.flatMap((c, i) => lists[i].map((a) => ({ ...a, clientName: c.name })));
  const rows = clientFilter ? all.filter((a) => a.client_id === clientFilter) : all;
  const chosen = rows.filter((a) => a.chosen).length;

  return (
    <>
      <PageHeader eyebrow="Production" title="Avatars"
        description="Le casting proposé à chaque client. Ajoute des profils ; le client retient ceux qui lui ressemblent dans son espace." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-2 tabular">{rows.length} avatar{rows.length > 1 ? "s" : ""}{clientFilter ? "" : " · tous clients"}</span>
          {chosen ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent-2 tabular">{chosen} retenu{chosen > 1 ? "s" : ""}</span> : null}
        </div>
        <FilterBar filters={[{ param: "client", label: "Tous les clients", options: clients.map((c) => ({ value: c.id, label: c.name })) }]} />
      </div>

      <AvatarsStudio clients={clients.map((c) => ({ id: c.id, name: c.name }))} avatars={rows} defaultClient={clientFilter || undefined} />
    </>
  );
}
