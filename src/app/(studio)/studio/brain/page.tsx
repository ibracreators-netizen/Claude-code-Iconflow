import { Brain } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Stat } from "@/components/ui/misc";
import { BrandDossierEditor } from "./_components/brand-dossier-editor";
import { BrainEntries } from "./_components/brain-entries";
import { KnowledgeBase } from "./_components/knowledge-base";
import { ClientSelector, ScopeSwitch } from "./_components/url-controls";

export const metadata = { title: "Brain" };

export default async function BrainPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await requireAgency("brain");
  const scope = sp.scope === "agence" ? "agence" : "client";
  const clients = await store.clients();

  if (scope === "agence") {
    const items = await store.knowledge();
    return (
      <>
        <PageHeader eyebrow="Connaissance" title="Brain agence" description="La mémoire d'icon-flow : angles, hooks, frameworks, SOP et insights réutilisables sur tous les clients." actions={<ScopeSwitch scope={scope} />} />
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Fiches" value={items.length} tone="accent" />
          <Stat label="Épinglées" value={items.filter((k) => k.pinned).length} />
          <Stat label="Score moyen" value={items.filter((k) => k.score !== null).length ? Math.round(items.filter((k) => k.score !== null).reduce((a, k) => a + (k.score ?? 0), 0) / items.filter((k) => k.score !== null).length) : "—"} hint="Sur les fiches notées" />
        </div>
        <KnowledgeBase items={items} cat={sp.cat ?? ""} seg={sp.seg ?? ""} q={sp.q ?? ""} />
      </>
    );
  }

  const client = clients.find((c) => c.id === sp.client) ?? clients[0];
  if (!client) {
    return (<><PageHeader eyebrow="Connaissance" title="Brain" actions={<ScopeSwitch scope={scope} />} /><EmptyState icon={Brain} title="Aucun client actif" description="Crée un client pour démarrer son Brain." /></>);
  }
  const [dossier, entries] = await Promise.all([store.brandDossier(client.id), store.brainEntries(client.id)]);
  return (
    <>
      <PageHeader eyebrow="Connaissance" title={<>Le Brain de <span className="text-accent-2">{client.name}</span></>} description="Tout ce qui fait la marque. Tout ce qui nourrit la prochaine création."
        actions={<><ClientSelector clients={clients.map((c) => ({ id: c.id, name: c.name, sector: c.sector }))} value={client.id} /><ScopeSwitch scope={scope} /></>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Fiches" value={entries.length} tone="accent" />
        <Stat label="Faits vérifiés" value={entries.filter((e) => e.kind === "fait").length} />
        <Stat label="À trancher" value={entries.filter((e) => e.kind === "conflit" || e.kind === "manque").length} tone={entries.some((e) => e.kind === "conflit" || e.kind === "manque") ? "warning" : "neutral"} hint="Conflits + manques" />
        <Stat label="Personas" value={Array.isArray(dossier?.data?.personas) ? dossier!.data.personas!.length : 0} />
      </div>
      <div className="space-y-8">
        <BrandDossierEditor clientId={client.id} clientName={client.name} dossier={dossier} />
        <BrainEntries clientId={client.id} clientName={client.name} entries={entries} kind={sp.kind ?? ""} q={sp.q ?? ""} />
      </div>
    </>
  );
}
