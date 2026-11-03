"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Globe, Layers, Loader2, Plus, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { cn, uid } from "@/lib/utils";
import { updateIaPlan, deleteIaPlan, publishIaPlan, unpublishIaPlan, importIaPlan, saveIaBrand } from "@/lib/actions/ia";
import { IA_GEN_STATUS, emptyIaConcept, type IaBrandSettings, type IaConcept, type IaEditNotes, type IaGenStatus, type IaGeneration, type IaPart, type IaPlan, type IaStatus } from "@/lib/data/types";
import { IaConceptsPanel } from "./ia-concepts-panel";

const MODELS = ["wan-3.0", "wan-3.0-prime"];
const RESOS = ["720p", "1080p"];
const GEN_TONE: Record<IaGenStatus, "neutral" | "success" | "warning"> = { en_cours: "neutral", ok: "success", a_relancer: "warning" };

const emptyPart = (n: number): IaPart => ({ id: `P${n}`, number: n, duration: null, text_start: "", text_end: "", word_count: null, ref_on: false, ref_excerpt: "", ref_reason: "", media: [{ tag: "@Image1", label: "avatar", file: "" }, { tag: "@Image2", label: "produit", file: "" }], prompt: "", model: "wan-3.0", resolution: "1080p", tries: 2, validated: false, generations: [], prompt_history: [], comments: [] });

function nextConceptCode(concepts: IaConcept[]): string {
  const mx = concepts.reduce((m, c) => { const r = /^V(\d+)$/i.exec(c.code.trim()); return r ? Math.max(m, parseInt(r[1], 10)) : m; }, 0);
  return `V${String(mx + 1).padStart(2, "0")}`;
}

function copy(text: string, done: () => void) { navigator.clipboard.writeText(text).then(done).catch(() => {}); }

export function IaPlanClient({ plan, brand, clientId, clientName }: { plan: IaPlan; brand: IaBrandSettings; clientId: string; clientName: string }) {
  const router = useRouter();
  const [title, setTitle] = React.useState(plan.title);
  const [concepts, setConcepts] = React.useState<IaConcept[]>(plan.data.concepts);
  const [token, setToken] = React.useState(plan.public_token);
  const [selected, setSelected] = React.useState<string | null>(plan.data.concepts[0]?.id ?? null);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef({ title, concepts });
  React.useEffect(() => { latest.current = { title, concepts }; }, [title, concepts]);

  const { exec, pending } = useAction();
  const save = React.useCallback(async () => {
    setSaveState("saving");
    const m = latest.current;
    const res = await updateIaPlan(plan.id, { title: m.title, data: { concepts: m.concepts } });
    setSaveState(res.ok ? "saved" : "error");
  }, [plan.id]);
  const schedule = React.useCallback(() => { setSaveState("saving"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 800); }, [save]);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const commitConcepts = (next: IaConcept[]) => { setConcepts(next); schedule(); };
  const current = concepts.find((c) => c.id === selected) ?? concepts[0] ?? null;

  const addConcept = () => { const c = emptyIaConcept(uid("ic"), nextConceptCode(concepts), `Concept ${concepts.length + 1}`); commitConcepts([...concepts, c]); setSelected(c.id); };
  const updateConcept = (id: string, patch: Partial<IaConcept>) => commitConcepts(concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const renameConcept = (id: string, t: string) => updateConcept(id, { title: t });
  const reorderConcepts = (ids: string[]) => commitConcepts(ids.map((id) => concepts.find((c) => c.id === id)).filter((c): c is IaConcept => !!c));
  const [toDelete, setToDelete] = React.useState<IaConcept | null>(null);
  const removeConcept = () => { if (!toDelete) return; const id = toDelete.id; const next = concepts.filter((c) => c.id !== id); commitConcepts(next); if (selected === id) setSelected(next[0]?.id ?? null); setToDelete(null); };

  const patchTitle = (v: string) => { setTitle(v); schedule(); };

  // Partage public : page de lecture + export JSON (même jeton)
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pageUrl = token ? `${origin}/ia/${token}` : "";
  const jsonUrl = token ? `${origin}/api/ia/${token}` : "";
  const [copied, setCopied] = React.useState<"" | "page" | "json">("");
  const flash = (k: "page" | "json") => { setCopied(k); setTimeout(() => setCopied(""), 1600); };
  const publish = () => exec(() => publishIaPlan(plan.id), { success: "Lien public créé.", refresh: false, onSuccess: (p) => setToken(p.public_token) });
  const unpublish = () => exec(() => unpublishIaPlan(plan.id), { success: "Lien public retiré.", refresh: false, onSuccess: () => setToken(null) });

  // Import JSON (remplace les concepts du dossier)
  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState("");
  const doImport = () => exec(() => importIaPlan(plan.id, importText), { success: "Dossier importé.", refresh: false, onSuccess: (p) => { setConcepts(p.data.concepts); setTitle(p.title); setSelected(p.data.concepts[0]?.id ?? null); setImportOpen(false); setImportText(""); } });

  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const panelProps = { items: concepts.map((c) => ({ id: c.id, code: c.code, title: c.title })), selectedId: current?.id ?? null, onSelect: setSelected, onCreate: addConcept, onRename: renameConcept, onReorder: reorderConcepts, onDelete: (id: string) => { const c = concepts.find((x) => x.id === id); if (c) setToDelete(c); } };

  return (
    <div className="space-y-5">
      {/* En-tête du dossier */}
      <Card>
        <CardBody className="space-y-4 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Nom du dossier" className="min-w-[240px] flex-1"><Input value={title} onChange={(e) => patchTitle(e.target.value)} maxLength={200} className="text-[15px] font-semibold" /></Field>
            <div className="flex items-center gap-2 pb-1 text-[12.5px] text-muted"><Layers className="size-4" />{concepts.length} concept{concepts.length > 1 ? "s" : ""}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}><Upload />Importer un JSON</Button>
              {token ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
                  <Globe className="size-4 text-accent-2" />
                  <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-2 hover:underline"><ExternalLink className="size-3.5" />Page publique</a>
                  <button onClick={() => copy(pageUrl, () => flash("page"))} className="text-[12px] text-muted hover:text-fg">{copied === "page" ? "copié ✓" : "copier"}</button>
                  <span className="text-muted-2">·</span>
                  <a href={jsonUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-accent-2">JSON</a>
                  <button onClick={() => copy(jsonUrl, () => flash("json"))} className="text-[12px] text-muted hover:text-fg">{copied === "json" ? "copié ✓" : "copier"}</button>
                  <button onClick={unpublish} disabled={pending} className="ml-1 text-[12px] text-muted hover:text-danger">retirer</button>
                </div>
              ) : <Button size="sm" variant="ghost" onClick={publish} disabled={pending}><Globe />Partager en ligne</Button>}
              <SaveState state={saveState} />
            </div>
            <Button size="sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => setConfirmDelete(true)}><Trash2 />Supprimer le dossier</Button>
          </div>
          <p className="text-[11.5px] text-muted-2">Client : {clientName} · Un dossier contient autant de concepts que tu veux. Chaque concept a un code stable ({current?.code ?? "V01"}-P1, {current?.code ?? "V01"}-P2…).</p>
        </CardBody>
      </Card>

      {/* Volet concepts (mobile) */}
      {concepts.length ? <div className="-mx-4 px-4 sm:-mx-8 sm:px-8 lg:hidden"><IaConceptsPanel layout="strip" {...panelProps} /></div> : null}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        {concepts.length ? (
          <aside className="hidden lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100dvh-100px)] lg:self-start lg:overflow-y-auto">
            <IaConceptsPanel layout="list" {...panelProps} />
          </aside>
        ) : null}

        <div className={cn("min-w-0 space-y-4", !concepts.length && "lg:col-span-2")}>
          {current ? (
            <ConceptEditor key={current.id} concept={current} canDelete={concepts.length > 1}
              onChange={(patch) => updateConcept(current.id, patch)} onRemove={() => setToDelete(current)} />
          ) : (
            <div className="card">
              <EmptyState icon={Layers} title="Aucun concept pour l'instant" description="Un dossier contient plusieurs concepts : chacun a son code, ses parties, ses prompts et ses générations. Ajoute le premier, ou colle un bloc JSON."
                action={<Button onClick={addConcept}><Plus />Créer le premier concept</Button>} />
            </div>
          )}
        </div>
      </div>

      {/* Niveau marque (client) */}
      <BrandCard clientId={clientId} clientName={clientName} initial={brand} />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent side="right" title="Importer un dossier (JSON)" description="Colle un bloc JSON (export d'un dossier, { concepts: […] }, ou un plan d'un seul concept { parts, edit_notes… }). Les concepts du dossier sont remplacés.">
          <div className="space-y-3">
            <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={16} className="font-mono text-[12px]" placeholder='{ "concepts": [ { "code": "V01", "title": "…", "parts": [ … ] } ] }' />
            <DialogFooter><Button variant="ghost" onClick={() => setImportOpen(false)}>Annuler</Button><Button onClick={doImport} loading={pending} disabled={!importText.trim()}>Importer</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} danger title="Supprimer ce concept ?"
        description={toDelete ? `« ${toDelete.title} » (${toDelete.code}) et tout son contenu seront supprimés. Les autres concepts du dossier sont conservés.` : undefined}
        confirmLabel="Supprimer le concept" loading={pending} onConfirm={removeConcept} />

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} danger title="Supprimer ce dossier IA ?" description={`« ${title} » et tous ses concepts seront supprimés. Action irréversible.`} confirmLabel="Supprimer" loading={pending}
        onConfirm={async () => { await exec(() => deleteIaPlan(plan.id), { success: "Dossier supprimé.", refresh: false, onSuccess: () => router.push("/studio/ia") }); }} />
    </div>
  );
}

function SaveState({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "saving") return <span className="flex items-center gap-1.5 text-[12px] text-muted"><Loader2 className="size-3.5 animate-spin" />Enregistrement…</span>;
  if (state === "saved") return <span className="flex items-center gap-1.5 text-[12px] text-success"><Check className="size-3.5" />Enregistré</span>;
  if (state === "error") return <span className="text-[12px] text-danger">Échec de l&apos;enregistrement</span>;
  return <span className="text-[12px] text-muted-2">Enregistrement automatique</span>;
}

/* ── Éditeur d'un concept : en-tête (code, titre, statut, go génération) + parties + notes de montage ── */
function ConceptEditor({ concept, canDelete, onChange, onRemove }: { concept: IaConcept; canDelete: boolean; onChange: (patch: Partial<IaConcept>) => void; onRemove: () => void }) {
  const setParts = (parts: IaPart[]) => onChange({ parts });
  const updatePart = (id: string, patch: Partial<IaPart>) => setParts(concept.parts.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)));
  const addPart = () => { const n = concept.parts.reduce((mx, p) => Math.max(mx, p.number || 0), 0) + 1; setParts([...concept.parts, emptyPart(n)]); };
  const removePart = (id: string) => setParts(concept.parts.filter((pt) => pt.id !== id));
  const goGeneration = () => onChange({ prompts_validated: true, status: "en_generation" });

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Code" className="w-[110px]"><Input value={concept.code} onChange={(e) => onChange({ code: e.target.value })} maxLength={16} className="font-mono" /></Field>
            <Field label="Titre du concept" className="min-w-[220px] flex-1"><Input value={concept.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={200} className="font-semibold" /></Field>
            <Field label="Statut" className="w-[180px]">
              <NativeSelect value={concept.status} onChange={(e) => onChange({ status: e.target.value as IaStatus })}>
                <option value="brouillon">Brouillon</option><option value="prompts_valides">Prompts validés</option><option value="en_generation">En génération</option><option value="livre">Livré</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <Button size="sm" variant={concept.prompts_validated ? "secondary" : "primary"} onClick={goGeneration}><Check />{concept.prompts_validated ? "Prompts validés" : "Prompts validés, go génération"}</Button>
            <Button size="sm" variant="ghost" className="text-muted hover:text-danger" onClick={onRemove} disabled={!canDelete}><Trash2 />Supprimer le concept</Button>
          </div>
          <p className="text-[11.5px] text-muted-2">Identifiants stables : <span className="font-mono">{concept.code}-P1</span>, <span className="font-mono">{concept.code}-P2</span>… · Tant que « go génération » n&apos;est pas cliqué, aucun crédit n&apos;est dépensé.</p>
        </CardBody>
      </Card>

      <div className="space-y-4">
        {concept.parts.map((part) => (
          <PartCard key={part.id} code={concept.code} part={part} onChange={(patch) => updatePart(part.id, patch)} onRemove={() => removePart(part.id)} />
        ))}
        <Button variant="secondary" size="sm" onClick={addPart}><Plus />Ajouter une partie</Button>
      </div>

      <EditNotesCard notes={concept.edit_notes} onChange={(edit_notes) => onChange({ edit_notes })} />
    </div>
  );
}

function PartCard({ code, part, onChange, onRemove }: { code: string; part: IaPart; onChange: (patch: Partial<IaPart>) => void; onRemove: () => void }) {
  const [copiedPrompt, setCopiedPrompt] = React.useState(false);
  const setGen = (gens: IaGeneration[]) => onChange({ generations: gens });
  const addGen = () => { const v = part.generations.reduce((mx, g) => Math.max(mx, g.version), 0) + 1; setGen([...part.generations, { id: uid("g"), version: v, pletor_id: "", url: "", status: "en_cours", qc: "", starred: false, credits: null, created_at: new Date().toISOString() }]); };
  const updGen = (id: string, patch: Partial<IaGeneration>) => setGen(part.generations.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const star = (id: string) => setGen(part.generations.map((g) => ({ ...g, starred: g.id === id ? !g.starred : false })));

  return (
    <Card className={cn(part.validated && "ring-1 ring-accent/40")}>
      <CardHeader
        title={<span className="flex items-center gap-2"><span className="font-mono text-[13px] text-accent-2">{code}-{part.id}</span>Partie {part.number}{part.validated ? <Badge tone="accent">Validée</Badge> : null}</span>}
        action={<div className="flex items-center gap-1.5">
          <Button size="sm" variant={part.validated ? "secondary" : "primary"} onClick={() => onChange({ validated: !part.validated })}><Check />{part.validated ? "Validée" : "Version validée"}</Button>
          <Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={onRemove} aria-label="Supprimer la partie"><Trash2 /></Button>
        </div>}
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Durée (s)"><Input type="number" value={part.duration ?? ""} onChange={(e) => onChange({ duration: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Nb de mots"><Input type="number" value={part.word_count ?? ""} onChange={(e) => onChange({ word_count: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Texte de début" className="sm:col-span-2"><Input value={part.text_start} onChange={(e) => onChange({ text_start: e.target.value })} placeholder="Premiers mots dits…" /></Field>
          <Field label="Texte de fin" className="sm:col-span-2"><Input value={part.text_end} onChange={(e) => onChange({ text_end: e.target.value })} placeholder="Derniers mots dits…" /></Field>
          <Field label="Modèle"><NativeSelect value={part.model} onChange={(e) => onChange({ model: e.target.value })}>{MODELS.map((m) => <option key={m} value={m}>{m}</option>)}</NativeSelect></Field>
          <Field label="Résolution"><NativeSelect value={part.resolution} onChange={(e) => onChange({ resolution: e.target.value })}>{RESOS.map((r) => <option key={r} value={r}>{r}</option>)}</NativeSelect></Field>
          <Field label="Essais"><Input type="number" value={part.tries ?? ""} onChange={(e) => onChange({ tries: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>

        <div className="rounded-lg bg-surface-2 p-3">
          <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={part.ref_on} onChange={(e) => onChange({ ref_on: e.target.checked })} />Vidéo de référence branchée (@Video1)</label>
          {part.ref_on ? <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label="Extrait choisi"><Input value={part.ref_excerpt} onChange={(e) => onChange({ ref_excerpt: e.target.value })} placeholder="0:12 → 0:26" /></Field>
            <Field label="Raison du choix"><Input value={part.ref_reason} onChange={(e) => onChange({ ref_reason: e.target.value })} placeholder="Gestes précis, cadrage…" /></Field>
          </div> : null}
        </div>

        <TagList label="Médias à brancher" items={part.media} onChange={(media) => onChange({ media })} />

        <div>
          <div className="mb-1.5 flex items-center justify-between"><span className="text-[13px] font-medium text-fg-2">Prompt</span><Button size="sm" variant="ghost" onClick={() => copy(part.prompt, () => { setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1600); })}>{copiedPrompt ? <><Check />Copié</> : <><Copy />Copier</>}</Button></div>
          <Textarea value={part.prompt} onChange={(e) => onChange({ prompt: e.target.value })} rows={6} className="font-mono text-[12px]" placeholder="LOCATION: the entire video takes place in one single location…" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-fg-2">Générations</span><Button size="sm" variant="ghost" onClick={addGen}><Plus />Ajouter une version</Button></div>
          {part.generations.length ? part.generations.map((g) => (
            <div key={g.id} className="rounded-lg border border-border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => star(g.id)} aria-label="Version retenue" className={cn("inline-flex size-7 items-center justify-center rounded-full", g.starred ? "text-warning" : "text-muted-2 hover:text-warning")}><Star className={cn("size-4", g.starred && "fill-current")} /></button>
                <span className="font-mono text-[12px]">v{g.version}</span>
                <NativeSelect value={g.status} onChange={(e) => updGen(g.id, { status: e.target.value as IaGenStatus })} className="h-8 w-auto text-[12px]">{(Object.keys(IA_GEN_STATUS) as IaGenStatus[]).map((s) => <option key={s} value={s}>{IA_GEN_STATUS[s]}</option>)}</NativeSelect>
                <Badge tone={GEN_TONE[g.status]}>{IA_GEN_STATUS[g.status]}</Badge>
                <Input value={g.pletor_id} onChange={(e) => updGen(g.id, { pletor_id: e.target.value })} placeholder="ID Pletor" className="h-8 w-[150px] text-[12px]" />
                <Input type="number" value={g.credits ?? ""} onChange={(e) => updGen(g.id, { credits: e.target.value ? Number(e.target.value) : null })} placeholder="crédits" className="h-8 w-[90px] text-[12px]" />
                <Button size="icon-sm" variant="ghost" className="ml-auto text-muted hover:text-danger" onClick={() => setGen(part.generations.filter((x) => x.id !== g.id))} aria-label="Supprimer la version"><Trash2 /></Button>
              </div>
              <Input value={g.url} onChange={(e) => updGen(g.id, { url: e.target.value })} placeholder="Lien de la vidéo (Pletor)" className="mt-2 h-8 text-[12px]" />
              <Input value={g.qc} onChange={(e) => updGen(g.id, { qc: e.target.value })} placeholder="Contrôle qualité (ex. « étiquette déformée à 0:07 »)" className="mt-2 h-8 text-[12px]" />
            </div>
          )) : <p className="text-[12.5px] text-muted-2">Aucune version pour l&apos;instant.</p>}
        </div>

        <PromptHistory part={part} onChange={(prompt_history) => onChange({ prompt_history })} />
        <CommentList part={part} onChange={(comments) => onChange({ comments })} />
      </CardBody>
    </Card>
  );
}

function TagList({ label, items, onChange }: { label: string; items: IaPart["media"]; onChange: (v: IaPart["media"]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-fg-2">{label}</span><Button size="sm" variant="ghost" onClick={() => onChange([...items, { tag: `@Image${items.length + 1}`, label: "", file: "" }])}><Plus />Ajouter</Button></div>
      {items.map((m, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input value={m.tag} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))} className="h-8 w-[100px] font-mono text-[12px]" placeholder="@Image1" />
          <Input value={m.label} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-8 w-[120px] text-[12px]" placeholder="avatar" />
          <Input value={m.file} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, file: e.target.value } : x)))} className="h-8 min-w-[160px] flex-1 text-[12px]" placeholder="https://… (fichier)" />
          <Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 /></Button>
        </div>
      ))}
    </div>
  );
}

function PromptHistory({ part, onChange }: { part: IaPart; onChange: (v: IaPart["prompt_history"]) => void }) {
  const add = () => { const v = part.prompt_history.reduce((mx, h) => Math.max(mx, h.version), 0) + 1; onChange([...part.prompt_history, { version: v, prompt: part.prompt, note: "", at: new Date().toISOString() }]); };
  return (
    <details className="rounded-lg bg-surface-2 p-3">
      <summary className="cursor-pointer text-[13px] font-medium text-fg-2">Historique des prompts ({part.prompt_history.length})</summary>
      <div className="mt-2 space-y-2">
        <Button size="sm" variant="ghost" onClick={add}><Plus />Figer la version actuelle</Button>
        {part.prompt_history.map((h, i) => (
          <div key={i} className="rounded-md border border-border bg-surface p-2">
            <div className="flex items-center gap-2"><span className="font-mono text-[12px]">v{h.version}</span><Input value={h.note} onChange={(e) => onChange(part.prompt_history.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} className="h-7 flex-1 text-[12px]" placeholder="Ce qui a changé et pourquoi" /><Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => onChange(part.prompt_history.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 /></Button></div>
            <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-muted">{h.prompt.slice(0, 400)}{h.prompt.length > 400 ? "…" : ""}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function CommentList({ part, onChange }: { part: IaPart; onChange: (v: IaPart["comments"]) => void }) {
  const [body, setBody] = React.useState("");
  const add = () => { if (!body.trim()) return; onChange([...part.comments, { id: uid("c"), author: "agence", body: body.trim(), at: new Date().toISOString() }]); setBody(""); };
  return (
    <details className="rounded-lg bg-surface-2 p-3">
      <summary className="cursor-pointer text-[13px] font-medium text-fg-2">Commentaires ({part.comments.length})</summary>
      <div className="mt-2 space-y-2">
        {part.comments.map((c) => <div key={c.id} className="flex items-start gap-2 rounded-md border border-border bg-surface p-2 text-[12.5px]"><span className="flex-1 whitespace-pre-wrap">{c.body}</span><Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => onChange(part.comments.filter((x) => x.id !== c.id))} aria-label="Retirer"><Trash2 /></Button></div>)}
        <div className="flex items-end gap-2"><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={1} placeholder="Un retour sur cette partie…" className="min-h-[40px]" /><Button size="sm" onClick={add}>Ajouter</Button></div>
      </div>
    </details>
  );
}

function EditNotesCard({ notes, onChange }: { notes: IaEditNotes; onChange: (n: IaEditNotes) => void }) {
  const n = notes;
  const set = (patch: Partial<IaEditNotes>) => onChange({ ...n, ...patch });
  return (
    <Card>
      <CardHeader title="Notes de montage" description="Textes à l'écran + timecodes, incrustations, musique, mentions « Publicité » / « Image virtuelle »." />
      <CardBody className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-fg-2">Textes à l&apos;écran</span><Button size="sm" variant="ghost" onClick={() => set({ texts: [...n.texts, { tc: "", text: "" }] })}><Plus />Ajouter</Button></div>
          {n.texts.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={t.tc} onChange={(e) => set({ texts: n.texts.map((x, j) => (j === i ? { ...x, tc: e.target.value } : x)) })} className="h-8 w-[90px] font-mono text-[12px]" placeholder="0:03" />
              <Input value={t.text} onChange={(e) => set({ texts: n.texts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} className="h-8 flex-1 text-[12px]" placeholder="Texte affiché" />
              <Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => set({ texts: n.texts.filter((_, j) => j !== i) })} aria-label="Retirer"><Trash2 /></Button>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Incrustations"><Input value={n.overlays} onChange={(e) => set({ overlays: e.target.value })} placeholder="Compteur « Jour 21 »…" /></Field>
          <Field label="Musique"><Input value={n.music} onChange={(e) => set({ music: e.target.value })} placeholder="Piste, ambiance…" /></Field>
          <Field label="Mentions"><Input value={n.mentions} onChange={(e) => set({ mentions: e.target.value })} placeholder="Publicité · Image virtuelle" /></Field>
        </div>
      </CardBody>
    </Card>
  );
}

function StrList({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-fg-2">{label}</span><Button size="sm" variant="ghost" onClick={() => onChange([...items, ""])}><Plus />Ajouter</Button></div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2"><Input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="h-8 text-[12.5px]" placeholder={placeholder} /><Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 /></Button></div>
      ))}
    </div>
  );
}

function BrandCard({ clientId, clientName, initial }: { clientId: string; clientName: string; initial: IaBrandSettings }) {
  const { exec, pending } = useAction();
  const [s, setS] = React.useState<IaBrandSettings>(initial);
  const set = (patch: Partial<IaBrandSettings>) => setS((x) => ({ ...x, ...patch }));
  return (
    <Card className="border-accent/25">
      <CardHeader title={`Niveau marque — ${clientName}`} description="Renseigné une fois, réutilisé par tous les concepts de ce client (rangé dans le Brain)." />
      <CardBody className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-fg-2">Dictionnaire de prononciation</span><Button size="sm" variant="ghost" onClick={() => set({ pronunciation: [...s.pronunciation, { term: "", say: "" }] })}><Plus />Ajouter</Button></div>
          {s.pronunciation.map((pr, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={pr.term} onChange={(e) => set({ pronunciation: s.pronunciation.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)) })} className="h-8 w-[160px] text-[12.5px]" placeholder="KŌYA" />
              <span className="text-muted-2">→</span>
              <Input value={pr.say} onChange={(e) => set({ pronunciation: s.pronunciation.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)) })} className="h-8 flex-1 text-[12.5px]" placeholder="Ko-ya" />
              <Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => set({ pronunciation: s.pronunciation.filter((_, j) => j !== i) })} aria-label="Retirer"><Trash2 /></Button>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <StrList label="Allégations autorisées" items={s.claims_allowed} onChange={(claims_allowed) => set({ claims_allowed })} placeholder="Ce qu'on peut dire" />
          <StrList label="Allégations interdites" items={s.claims_forbidden} onChange={(claims_forbidden) => set({ claims_forbidden })} placeholder="À ne jamais dire" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-fg-2">Bibliothèque (avatars / packshots)</span><Button size="sm" variant="ghost" onClick={() => set({ library: [...s.library, { label: "", url: "" }] })}><Plus />Ajouter</Button></div>
          {s.library.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={l.label} onChange={(e) => set({ library: s.library.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-8 w-[160px] text-[12.5px]" placeholder="Avatar 1 / Packshot sérum" />
              <Input value={l.url} onChange={(e) => set({ library: s.library.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className="h-8 flex-1 text-[12.5px]" placeholder="https://…" />
              <Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => set({ library: s.library.filter((_, j) => j !== i) })} aria-label="Retirer"><Trash2 /></Button>
            </div>
          ))}
        </div>
        <Field label="Apprentissages" hint="Ce qui marche, ce qui rate — pour progresser d'un concept à l'autre."><Textarea value={s.learnings} onChange={(e) => set({ learnings: e.target.value })} rows={3} /></Field>
        <div className="flex justify-end"><Button size="sm" loading={pending} onClick={() => exec(() => saveIaBrand(clientId, s), { success: "Réglages marque enregistrés." })}>Enregistrer les réglages marque</Button></div>
      </CardBody>
    </Card>
  );
}
