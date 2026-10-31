"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useAction } from "@/lib/hooks/use-action";
import { reorderBriefs, updateBrief, updateConcept } from "@/lib/actions/briefs";
import type { Brief, BriefConcept, BriefKind, StaticBriefContent, VideoBriefContent } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { EditableTitle } from "./editable-title";

export type Content = Record<string, unknown>;
const FRAMEWORKS = ["AIDA", "PAS", "BAB", "4U", "autre"];

function asVideo(c: Content): VideoBriefContent {
  const t = (c.transcription as Partial<VideoBriefContent["transcription"]> | undefined) ?? {};
  return {
    ...c, concept: String(c.concept ?? ""), acting: String(c.acting ?? ""), angle: String(c.angle ?? ""), framework: String(c.framework ?? ""),
    transcription: { ...t, hooks: Array.isArray(t.hooks) && t.hooks.length ? t.hooks.map(String) : [""], corps: String(t.corps ?? ""), ctas: Array.isArray(t.ctas) && t.ctas.length ? t.ctas.map(String) : [""] },
  };
}
function asStatic(c: Content): StaticBriefContent {
  return { ...c, reference: String(c.reference ?? ""), angle: String(c.angle ?? ""), overlay: String(c.overlay ?? "") };
}
/** Contenu complet et typé quel que soit l'état des données (legacy, concept vide…). */
export function normalizeContent(kind: BriefKind, c: Content | null | undefined): Content {
  return (kind === "video" ? asVideo(c ?? {}) : asStatic(c ?? {})) as unknown as Content;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
const DEBOUNCE_MS = 800;
const OFFLINE_MSG = "Enregistrement impossible. Vérifie ta connexion.";
const UNSAVED_MSG = "Dernière modification non enregistrée.";

/** En-tête du brief : titre, responsable, échéance (updateBrief) et position parmi les briefs du mois. */
export function BriefMeta({ brief, profiles, siblings }: { brief: Brief; profiles: Array<{ id: string; name: string }>; siblings: string[] }) {
  const router = useRouter();
  const [meta, setMeta] = React.useState({ title: brief.title, assignee_id: brief.assignee_id ?? "", due_date: brief.due_date ?? "" });
  const [state, setState] = React.useState<SaveState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const { exec, pending } = useAction();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef(meta);
  React.useEffect(() => { latest.current = meta; }, [meta]);

  const save = React.useCallback(async () => {
    setState("saving");
    const m = latest.current;
    try {
      const res = await updateBrief(brief.id, { title: m.title.trim() || brief.title, assignee_id: m.assignee_id || null, due_date: m.due_date || null });
      if (res.ok) { setState("saved"); setError(null); router.refresh(); } else { setState("error"); setError(res.error); }
    } catch { setState("error"); setError(OFFLINE_MSG); }
  }, [brief.id, brief.title, router]);

  const patchMeta = (p: Partial<typeof meta>) => {
    setMeta((m) => ({ ...m, ...p }));
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
  };
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const index = siblings.indexOf(brief.id);
  const move = (dir: -1 | 1) => {
    const next = [...siblings]; const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    exec(() => reorderBriefs(next), { success: "Ordre enregistré." });
  };

  return (
    <Card>
      <CardBody className="pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre du brief" className="sm:col-span-2"><Input value={meta.title} onChange={(e) => patchMeta({ title: e.target.value })} maxLength={240} className="text-[15px] font-semibold" /></Field>
          <Field label="Responsable">
            <NativeSelect value={meta.assignee_id} onChange={(e) => patchMeta({ assignee_id: e.target.value })}>
              <option value="">Non assigné</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Échéance"><Input type="date" value={meta.due_date} onChange={(e) => patchMeta({ due_date: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[12.5px] text-muted">
          <div className="flex items-center gap-2">
            <span>Position {index + 1} / {siblings.length}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => move(-1)} disabled={index <= 0 || pending} aria-label="Monter"><ArrowUp /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => move(1)} disabled={index < 0 || index >= siblings.length - 1 || pending} aria-label="Descendre"><ArrowDown /></Button>
          </div>
          <SaveIndicator state={state} error={error} onRetry={save} />
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Éditeur d'un concept (une page du brief) : structure du script, enregistrement automatique via updateConcept.
 * Ce qui est en attente est envoyé dès que l'on quitte le concept ; le parent garde le brouillon pour y revenir sans perte.
 */
export function ConceptEditor({ brief, concept, index, count, initialContent, initialUnsaved, onLeave, onRename, onDelete, onSaved }: {
  brief: Pick<Brief, "id" | "kind" | "status">; concept: Pick<BriefConcept, "id" | "title">; index: number; count: number;
  initialContent: Content;
  /** Brouillon dont le dernier enregistrement a échoué : l'éditeur s'ouvre en erreur, avec « Réessayer ». */
  initialUnsaved?: boolean;
  onLeave: (conceptId: string, content: Content, unsaved: boolean) => void; onRename: (title: string) => void; onDelete: () => void; onSaved: () => void;
}) {
  const isVideo = brief.kind === "video";
  const [content, setContent] = React.useState<Content>(() => normalizeContent(brief.kind, initialContent));
  const [state, setState] = React.useState<SaveState>(initialUnsaved ? "error" : "idle");
  const [error, setError] = React.useState<string | null>(initialUnsaved ? UNSAVED_MSG : null);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef(content);
  const dirty = React.useRef(!!initialUnsaved);
  const titleRef = React.useRef(concept.title);
  const onSavedRef = React.useRef(onSaved);
  const onLeaveRef = React.useRef(onLeave);
  React.useEffect(() => { latest.current = content; }, [content]);
  React.useEffect(() => { titleRef.current = concept.title; }, [concept.title]);
  React.useEffect(() => { onSavedRef.current = onSaved; onLeaveRef.current = onLeave; }, [onSaved, onLeave]);

  const save = React.useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    dirty.current = false;
    setState("saving");
    try {
      const res = await updateConcept(concept.id, { content: latest.current });
      if (res.ok) { setState("saved"); setError(null); onSavedRef.current(); } else { setState("error"); setError(res.error); dirty.current = true; }
    } catch {
      // Réseau coupé : la saisie reste à l'écran et « Réessayer » renvoie tout le contenu.
      setState("error"); setError(OFFLINE_MSG); dirty.current = true;
    }
  }, [concept.id]);

  const schedule = React.useCallback(() => {
    dirty.current = true;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
  }, [save]);

  // Changement de concept ou fermeture : le brouillon est conservé par le parent et ce qui est en attente est enregistré sans délai.
  // Si cet enregistrement échoue, le brouillon est marqué non enregistré (l'éditeur rouvrira en erreur) et l'on prévient.
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    const id = concept.id, content = latest.current;
    onLeaveRef.current(id, content, false);
    if (!dirty.current) return;
    dirty.current = false;
    const failed = (reason: string) => { onLeaveRef.current(id, content, true); toast.error(`« ${titleRef.current} » : ${reason}`); };
    updateConcept(id, { content }).then((r) => { if (r.ok) onSavedRef.current(); else failed(r.error); }, () => failed(OFFLINE_MSG));
  }, [concept.id]);

  const patch = (p: Partial<Content>) => { setContent((c) => ({ ...c, ...p })); schedule(); };
  const patchTr = (p: Partial<VideoBriefContent["transcription"]>) => { setContent((c) => ({ ...c, transcription: { ...(c.transcription as object), ...p } })); schedule(); };

  const v = isVideo ? (content as unknown as VideoBriefContent) : null;
  const s = !isVideo ? (content as unknown as StaticBriefContent) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 px-1">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11.5px] font-semibold text-accent-fg" aria-hidden>{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <EditableTitle value={concept.title} editing={editingTitle} onEditingChange={setEditingTitle} onCommit={onRename} label="Titre du concept" wrap
              className="text-[17px] font-semibold leading-snug tracking-tight text-fg" inputClassName="h-9 max-w-md text-[15px] font-semibold" />
            {!editingTitle ? <Tooltip label="Renommer le concept"><Button variant="ghost" size="icon-sm" onClick={() => setEditingTitle(true)} aria-label="Renommer le concept" className="shrink-0 text-muted"><Pencil /></Button></Tooltip> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
            <span className="tabular">Concept {index + 1} / {count}</span>
            <span aria-hidden>·</span>
            <SaveIndicator state={state} error={error} onRetry={save} />
          </div>
        </div>
        <Tooltip label={count > 1 ? "Supprimer ce concept" : "Un brief garde au moins un concept"}>
          <span className="shrink-0"><Button variant="ghost" size="icon-sm" className="text-muted hover:text-danger" onClick={onDelete} disabled={count <= 1} aria-label="Supprimer ce concept"><Trash2 /></Button></span>
        </Tooltip>
      </div>

      {v ? (
        <>
          <Card>
            <CardHeader title="1. Comprendre le concept" description="L'angle psychologique et le framework pilotent tout le script." />
            <CardBody className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                <Field label="Angle" hint="Ex. gain de temps + preuve sociale"><Input value={v.angle ?? ""} onChange={(e) => patch({ angle: e.target.value })} /></Field>
                <Field label="Framework">
                  <NativeSelect value={v.framework ?? ""} onChange={(e) => patch({ framework: e.target.value })}>
                    <option value="">—</option>
                    {FRAMEWORKS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Concept"><Textarea value={v.concept} onChange={(e) => patch({ concept: e.target.value })} rows={3} placeholder="Le dispositif en une phrase : qui parle, où, quel ton." /></Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Transcription" description="Hooks → Corps → CTA. Oral, phrases courtes, un seul CTA par version." />
            <CardBody className="space-y-5">
              <ListField label="Hooks" hint="Les 3 premières secondes. Propose plusieurs variantes à tester." items={v.transcription.hooks} placeholder="Tu remets des faux cils tous les matins ? Arrête." onChange={(hooks) => patchTr({ hooks })} />
              <Field label="Corps"><Textarea value={v.transcription.corps} onChange={(e) => patchTr({ corps: e.target.value })} rows={10} className="leading-relaxed" placeholder="Problème → agitation → solution avec preuve…" /></Field>
              <ListField label="CTA" hint="Appels à l'action (une variante par ligne)." items={v.transcription.ctas} placeholder="Lien en bio, livraison 48h." onChange={(ctas) => patchTr({ ctas })} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Acting et plans" description="Direction de jeu, cadrages, lumière, rythme." />
            <CardBody><Textarea value={v.acting} onChange={(e) => patch({ acting: e.target.value })} rows={5} placeholder="Plan serré miroir, lumière naturelle, rythme rapide…" /></CardBody>
          </Card>
        </>
      ) : s ? (
        <Card>
          <CardHeader title="Brief statique" description="Référence visuelle, angle et texte à l'écran." />
          <CardBody className="space-y-4">
            <Field label="Référence"><Textarea value={s.reference} onChange={(e) => patch({ reference: e.target.value })} rows={3} placeholder="Carrousel 4 slides, fond crème, typographie serif…" /></Field>
            <Field label="Angle"><Input value={s.angle} onChange={(e) => patch({ angle: e.target.value })} placeholder="Urgence + bénéfice principal" /></Field>
            <Field label="Texte à l'écran"><Textarea value={s.overlay} onChange={(e) => patch({ overlay: e.target.value })} rows={4} placeholder="6 semaines de tenue. 39 €. Jusqu'à dimanche." /></Field>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  if (state === "saving") return <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" />Enregistrement…</span>;
  if (state === "saved") return <span className="flex items-center gap-1.5 text-success"><Check className="size-3.5" />Enregistré</span>;
  if (state === "dirty") return <span className="text-muted">Modifications en attente…</span>;
  if (state === "error") return <span className="flex items-center gap-2 text-danger">{error}<button type="button" onClick={onRetry} className="underline underline-offset-2">Réessayer</button></span>;
  return <span className="text-muted-2">Enregistrement automatique</span>;
}

function ListField({ label, hint, items, placeholder, onChange }: { label: string; hint?: string; items: string[]; placeholder?: string; onChange: (items: string[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3"><span className="text-[13px] font-medium text-fg-2">{label}</span>{hint ? <span className="text-xs text-muted sm:text-right">{hint}</span> : null}</div>
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={cn("w-6 shrink-0 text-center font-mono text-[11px] text-muted-2")}>{String(i + 1).padStart(2, "0")}</span>
            <Input value={it} placeholder={i === 0 ? placeholder : undefined} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button variant="ghost" size="icon-sm" aria-label="Supprimer" disabled={items.length <= 1} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 /></Button>
          </li>
        ))}
      </ol>
      <Button variant="ghost" size="sm" onClick={() => onChange([...items, ""])}><Plus />Ajouter</Button>
    </div>
  );
}
