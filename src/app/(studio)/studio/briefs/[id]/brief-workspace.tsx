"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { createConcept, deleteConcept, reorderConcepts, updateConcept } from "@/lib/actions/briefs";
import type { Brief, BriefConcept } from "@/lib/data/types";
import { ConceptsPanel } from "./concepts-panel";
import { BriefMeta, ConceptEditor, type Content } from "./brief-editor";

/**
 * Atelier d'un brief : volet des concepts (pages) + éditeur du concept sélectionné (?concept=<id>) + rail de statut.
 * La liste locale suit les données serveur et se met à jour sans attendre (ajout, renommage, ordre, suppression) ;
 * chaque concept garde son brouillon quand on passe à un autre.
 */
export function BriefWorkspace({ brief, concepts, selectedId, profiles, siblings, rail }: {
  brief: Brief; concepts: BriefConcept[]; selectedId: string | null; profiles: Array<{ id: string; name: string }>; siblings: string[]; rail: React.ReactNode;
}) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [items, setItems] = React.useState(concepts);
  const [seen, setSeen] = React.useState(concepts);
  if (seen !== concepts) { setSeen(concepts); setItems(concepts); }
  const [selected, setSelected] = React.useState(selectedId);
  const [toDelete, setToDelete] = React.useState<BriefConcept | null>(null);
  // Brouillons laissés en quittant un concept : on les retrouve en y revenant, même avant le retour du serveur.
  const [drafts, setDrafts] = React.useState<Record<string, { content: Content; unsaved: boolean }>>({});
  const current = items.find((c) => c.id === selected) ?? items[0] ?? null;
  const submitted = brief.status !== "redaction" && brief.status !== "archived";

  const select = React.useCallback((id: string) => {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("concept", id);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const create = (content?: Content) => exec(() => createConcept(brief.id, content ? { content } : undefined), {
    success: "Concept ajouté.",
    onSuccess: (c) => { setItems((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs, c])); select(c.id); },
  });

  const rename = async (id: string, title: string) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, title } : x)));
    const res = await exec(() => updateConcept(id, { title }), { success: "Concept renommé." });
    if (!res.ok) router.refresh(); // le serveur a refusé : on reprend le titre réel
  };

  const reorder = async (ids: string[]) => {
    setItems((xs) => ids.map((id) => xs.find((x) => x.id === id)).filter((x): x is BriefConcept => !!x));
    const res = await exec(() => reorderConcepts(brief.id, ids));
    if (!res.ok) router.refresh();
  };

  const remove = async () => {
    if (!toDelete) return;
    const id = toDelete.id;
    const res = await exec(() => deleteConcept(id, brief.id), { success: "Concept supprimé." });
    if (!res.ok) return;
    setToDelete(null);
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
    if (current?.id === id) {
      const at = items.findIndex((x) => x.id === id);
      const fallback = next[Math.min(Math.max(at, 0), next.length - 1)];
      if (fallback) select(fallback.id);
    }
  };

  const onLeave = React.useCallback((id: string, content: Content, unsaved: boolean) => setDrafts((d) => ({ ...d, [id]: { content, unsaved } })), []);
  // Un brief soumis revient en rédaction dès qu'un concept change : on rafraîchit le statut affiché.
  const onSaved = React.useCallback(() => { if (submitted) router.refresh(); }, [submitted, router]);
  const requestDelete = (id: string) => { const c = items.find((x) => x.id === id); if (c) setToDelete(c); };

  const panelProps = { items, selectedId: current?.id ?? null, busy: pending, onSelect: select, onCreate: () => void create(), onRename: (id: string, title: string) => void rename(id, title), onReorder: (ids: string[]) => void reorder(ids), onDelete: requestDelete };

  return (
    <>
      {items.length ? (
        <div className="-mx-4 mb-4 px-4 sm:-mx-8 sm:px-8 lg:hidden">
          <ConceptsPanel layout="strip" {...panelProps} />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[208px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_320px] xl:gap-6">
        {items.length ? (
          <aside className="hidden lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100dvh-100px)] lg:self-start lg:overflow-y-auto">
            <ConceptsPanel layout="list" {...panelProps} />
          </aside>
        ) : null}

        <div className={items.length ? "min-w-0 space-y-4" : "min-w-0 space-y-4 lg:col-span-2 xl:col-span-2"}>
          <BriefMeta brief={brief} profiles={profiles} siblings={siblings} />
          {submitted ? <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-[13px] text-info">Ce brief est déjà soumis. Toute modification d&apos;un concept le renvoie automatiquement en rédaction pour un nouveau contrôle.</p> : null}
          {current ? (
            <ConceptEditor key={current.id} brief={brief} concept={current} index={items.indexOf(current)} count={items.length}
              initialContent={drafts[current.id]?.content ?? (current.content as Content)} initialUnsaved={drafts[current.id]?.unsaved ?? false}
              onLeave={onLeave} onRename={(t) => void rename(current.id, t)} onDelete={() => requestDelete(current.id)} onSaved={onSaved} />
          ) : (
            <div className="card">
              <EmptyState icon={Layers} title="Aucun concept pour l'instant" description="Un brief contient plusieurs concepts : chacun a son angle, ses hooks et son script. Le premier reprend le contenu existant du brief."
                action={<Button onClick={() => void create(brief.content as Content)} loading={pending}><Plus />Créer le premier concept</Button>} />
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-start-2 xl:col-start-3 xl:row-start-1">{rail}</div>
      </div>

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Supprimer ce concept ?"
        description={toDelete ? `« ${toDelete.title} » et son script seront supprimés définitivement. Les autres concepts du brief sont conservés.` : undefined}
        confirmLabel="Supprimer le concept" danger loading={pending} onConfirm={remove} />
    </>
  );
}
