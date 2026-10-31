import { Brain } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/brain/extract";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { BrandDossierEditor } from "./_components/brand-dossier-editor";
import { BrainEntries } from "./_components/brain-entries";
import { BrainImportPanel } from "./_components/brain-import";
import { BrainHero } from "./_components/brain-hero";
import { KnowledgeBase } from "./_components/knowledge-base";
import { ClientSelector, ScopeSwitch } from "./_components/url-controls";

export const metadata = { title: "Brain" };
/** L'import d'un site lit jusqu'à cinq pages puis, si l'IA est activée, attend sa réponse : on laisse une minute aux actions de cette page. */
export const maxDuration = 60;

export default async function BrainPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await requireAgency("brain");
  const scope = sp.scope === "agence" ? "agence" : "client";
  const clients = await store.clients();

  if (scope === "agence") {
    const items = await store.knowledge();
    const scored = items.filter((k) => k.score !== null);
    return (
      <>
        <PageHeader eyebrow="Connaissance" title="Brain agence" description="La mémoire d'icon-flow : angles, hooks, frameworks, SOP et insights réutilisables sur tous les clients." actions={<ScopeSwitch scope={scope} />} />
        <BrainHero caption="Mémoire de l'agence" stats={[
          { label: "Fiches", value: items.length, tone: "accent" },
          { label: "Épinglées", value: items.filter((k) => k.pinned).length },
          { label: "Score moyen", value: scored.length ? Math.round(scored.reduce((a, k) => a + (k.score ?? 0), 0) / scored.length) : "—", hint: "Sur les fiches notées" },
          { label: "Utilisations", value: items.reduce((a, k) => a + k.uses, 0), hint: "Copies dans un script" },
        ]} />
        <KnowledgeBase items={items} cat={sp.cat ?? ""} seg={sp.seg ?? ""} q={sp.q ?? ""} />
      </>
    );
  }

  const client = clients.find((c) => c.id === sp.client) ?? clients[0];
  if (!client) {
    return (<><PageHeader eyebrow="Connaissance" title="Brain" actions={<ScopeSwitch scope={scope} />} /><EmptyState icon={Brain} title="Aucun client actif" description="Crée un client pour démarrer son Brain." /></>);
  }
  const [dossier, entries, imports] = await Promise.all([store.brandDossier(client.id), store.brainEntries(client.id), store.brainImports(client.id)]);
  const toSettle = entries.filter((e) => e.kind === "conflit" || e.kind === "manque").length;
  const entryCounts: Record<string, number> = {};
  for (const e of entries) if (e.import_id) entryCounts[e.import_id] = (entryCounts[e.import_id] ?? 0) + 1;
  return (
    <>
      <PageHeader eyebrow="Connaissance" title={<>Le Brain de <span className="text-accent-2">{client.name}</span></>} description="Tout ce qui fait la marque. Tout ce qui nourrit la prochaine création."
        actions={<><ClientSelector clients={clients.map((c) => ({ id: c.id, name: c.name, sector: c.sector }))} value={client.id} /><ScopeSwitch scope={scope} /></>} />
      <BrainHero caption={client.name} stats={[
        { label: "Fiches", value: entries.length, tone: "accent" },
        { label: "Faits vérifiés", value: entries.filter((e) => e.kind === "fait").length },
        { label: "À trancher", value: toSettle, tone: toSettle ? "warning" : "neutral", hint: "Conflits + manques" },
        { label: "Personas", value: Array.isArray(dossier?.data?.personas) ? dossier!.data.personas!.length : 0 },
      ]} />
      <div className="space-y-8">
        <BrainImportPanel clientId={client.id} clientName={client.name} imports={imports} entryCounts={entryCounts} aiAvailable={aiConfigured()} />
        <BrandDossierEditor clientId={client.id} clientName={client.name} dossier={dossier} />
        <BrainEntries clientId={client.id} clientName={client.name} entries={entries} kind={sp.kind ?? ""} q={sp.q ?? ""} />
      </div>
    </>
  );
}
