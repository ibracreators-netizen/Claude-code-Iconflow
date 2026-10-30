"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { reorderBriefs, updateBrief } from "@/lib/actions/briefs";
import type { Brief, StaticBriefContent, VideoBriefContent } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Content = Record<string, unknown>;
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

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function BriefEditor({ brief, profiles, siblings }: { brief: Brief; profiles: Array<{ id: string; name: string }>; siblings: string[] }) {
  const isVideo = brief.kind === "video";
  const [content, setContent] = React.useState<Content>(() => (isVideo ? asVideo(brief.content as Content) : asStatic(brief.content as Content)) as unknown as Content);
  const [meta, setMeta] = React.useState({ title: brief.title, assignee_id: brief.assignee_id ?? "", due_date: brief.due_date ?? "" });
  const [state, setState] = React.useState<SaveState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const { exec, pending } = useAction();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef({ content, meta });
  React.useEffect(() => { latest.current = { content, meta }; }, [content, meta]);
  const submitted = brief.status !== "redaction" && brief.status !== "archived";

  const save = React.useCallback(async () => {
    setState("saving");
    const { content, meta } = latest.current;
    const res = await updateBrief(brief.id, { content: content as Brief["content"], title: meta.title.trim() || brief.title, assignee_id: meta.assignee_id || null, due_date: meta.due_date || null });
    if (res.ok) { setState("saved"); setError(null); } else { setState("error"); setError(res.error); }
  }, [brief.id, brief.title]);

  const schedule = React.useCallback(() => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 800);
  }, [save]);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const patch = (p: Partial<Content>) => { setContent((c) => ({ ...c, ...p })); schedule(); };
  const patchTr = (p: Partial<VideoBriefContent["transcription"]>) => { setContent((c) => ({ ...c, transcription: { ...(c.transcription as object), ...p } })); schedule(); };
  const patchMeta = (p: Partial<typeof meta>) => { setMeta((m) => ({ ...m, ...p })); schedule(); };

  const index = siblings.indexOf(brief.id);
  const move = (dir: -1 | 1) => {
    const next = [...siblings]; const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    exec(() => reorderBriefs(next), { success: "Ordre enregistré." });
  };

  const v = isVideo ? (content as unknown as VideoBriefContent) : null;
  const s = !isVideo ? (content as unknown as StaticBriefContent) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="pt-5">
          <div className="grid gap-4 md:grid-cols-[1fr_180px_150px]">
            <Field label="Titre"><Input value={meta.title} onChange={(e) => patchMeta({ title: e.target.value })} maxLength={240} className="text-[15px] font-semibold" /></Field>
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

      {submitted ? <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-[13px] text-info">Ce brief est déjà soumis. Toute modification du contenu le renvoie automatiquement en rédaction pour un nouveau contrôle.</p> : null}

      {v ? (
        <>
          <Card>
            <CardHeader title="1. Comprendre le concept" description="L'angle psychologique et le framework pilotent tout le script." />
            <CardBody className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_180px]">
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
  if (state === "error") return <span className="flex items-center gap-2 text-danger">{error}<button onClick={onRetry} className="underline underline-offset-2">Réessayer</button></span>;
  return <span className="text-muted-2">Enregistrement automatique</span>;
}

function ListField({ label, hint, items, placeholder, onChange }: { label: string; hint?: string; items: string[]; placeholder?: string; onChange: (items: string[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between"><span className="text-[13px] font-medium text-fg-2">{label}</span>{hint ? <span className="text-xs text-muted">{hint}</span> : null}</div>
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
