"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Frame, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createBatch, updateBatch } from "@/lib/actions/livrables";
import { LIVRABLE_KIND, type Livrable, type LivrableItem, type LivrableKind } from "@/lib/data/types";
import { MAX_ITEMS, MAX_ITEM_NAME, fmtDuration, parseItemLines, totalDuration } from "@/lib/batch";
import { uid } from "@/lib/utils";
import { useUrlFlag } from "../_prod/filter-bar";

export interface BriefOption { id: string; title: string; client_id: string }

/*
 * Un livrable = un batch : un seul lien Frame et la liste des vidéos (ou visuels) qu'il contient.
 * Le même formulaire sert à la création et à la modification.
 */

/** Ligne du formulaire : la durée reste une chaîne tant qu'on la tape. */
interface Row { key: string; name: string; duration: string; url: string | null }
const blank = (): Row => ({ key: uid("it"), name: "", duration: "", url: null });
const fromItem = (it: LivrableItem): Row => ({ key: uid("it"), name: it.name, duration: it.duration_sec ? String(it.duration_sec) : "", url: it.url ?? null });
const toItems = (rows: Row[]): LivrableItem[] => rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), duration_sec: r.duration.trim() ? Number(r.duration) : null, url: r.url }));

const UNIT: Record<LivrableKind, string> = { video: "vidéo", static: "visuel", rush: "rush" };
const PLACEHOLDER: Record<LivrableKind, string> = { video: "Ex. Hook 1 · « Mes cils ont doublé »", static: "Ex. Format 1:1 · Offre -30 %", rush: "Ex. Plan large atelier" };
const NUMBER_INPUT = "w-[76px] shrink-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const FOOTER = "sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur";

interface FormState { client_id: string; month: string; kind: LivrableKind; title: string; file_url: string; brief_id: string; rows: Row[] }
type SetForm = React.Dispatch<React.SetStateAction<FormState>>;

function ItemsEditor({ kind, rows, onChange }: { kind: LivrableKind; rows: Row[]; onChange: (next: Row[]) => void }) {
  const inputs = React.useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!pendingFocus.current) return;
    inputs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [rows]);

  const count = rows.filter((r) => r.name.trim()).length;
  const total = totalDuration(toItems(rows));
  const update = (key: string, patch: Partial<Row>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** Insère des lignes après `key` (ou à la fin) et place le curseur sur la dernière insérée. */
  const insertAfter = (key: string | null, fresh: Row[]) => {
    const allowed = fresh.slice(0, Math.max(0, MAX_ITEMS - rows.length));
    if (!allowed.length) return;
    const i = key ? rows.findIndex((r) => r.key === key) : rows.length - 1;
    pendingFocus.current = allowed[allowed.length - 1].key;
    onChange([...rows.slice(0, i + 1), ...allowed, ...rows.slice(i + 1)]);
  };
  const remove = (key: string) => {
    const i = rows.findIndex((r) => r.key === key);
    const next = rows.filter((r) => r.key !== key);
    pendingFocus.current = next[Math.max(0, i - 1)]?.key ?? null;
    onChange(next.length ? next : [blank()]);
  };
  const onNameKeyDown = (row: Row) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (row.name.trim()) insertAfter(row.key, [blank()]); }
    else if (e.key === "Backspace" && !row.name && !row.duration && rows.length > 1) { e.preventDefault(); remove(row.key); }
  };
  const onDurationKeyDown = (row: Row) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (row.name.trim()) insertAfter(row.key, [blank()]); }
  };
  /** Une liste collée (une ligne par élément) est répartie sur autant de lignes. */
  const onPaste = (row: Row) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/\n/.test(text.trim())) return;
    const fresh = parseItemLines(text).map(fromItem);
    if (!fresh.length) return;
    e.preventDefault();
    if (row.name.trim()) { insertAfter(row.key, fresh); return; }
    const [first, ...rest] = fresh;
    const merged = rows.map((r) => (r.key === row.key ? { ...r, name: first.name, duration: first.duration } : r));
    const i = merged.findIndex((r) => r.key === row.key);
    const allowed = rest.slice(0, Math.max(0, MAX_ITEMS - merged.length));
    pendingFocus.current = (allowed[allowed.length - 1] ?? merged[i]).key;
    onChange([...merged.slice(0, i + 1), ...allowed, ...merged.slice(i + 1)]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-fg-2">Éléments du batch<span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted tabular">{count}</span></span>
        <Button type="button" variant="ghost" size="sm" onClick={() => insertAfter(null, [blank()])} disabled={rows.length >= MAX_ITEMS}><Plus />Ajouter</Button>
      </div>
      <ol className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted-2 tabular">{i + 1}</span>
            <Input ref={(el) => { if (el) inputs.current.set(r.key, el); else inputs.current.delete(r.key); }} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} onKeyDown={onNameKeyDown(r)} onPaste={onPaste(r)} placeholder={i === 0 ? PLACEHOLDER[kind] : `Élément ${i + 1}`} maxLength={MAX_ITEM_NAME} aria-label={`Nom de l'élément ${i + 1}`} className="min-w-0 flex-1" />
            <Input type="number" inputMode="numeric" min={0} max={86400} step={1} value={r.duration} onChange={(e) => update(r.key, { duration: e.target.value })} onKeyDown={onDurationKeyDown(r)} placeholder="s" aria-label={`Durée de l'élément ${i + 1}, en secondes`} className={NUMBER_INPUT} />
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(r.key)} aria-label={`Retirer l'élément ${i + 1}`} className="shrink-0 text-muted hover:text-danger"><Trash2 /></Button>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span>Une ligne par {UNIT[kind]}, durée en secondes facultative. Entrée ajoute une ligne ; une liste collée est répartie (« Nom · 32 »).</span>
        {total ? <span className="shrink-0 font-mono tabular">Total {fmtDuration(total)}</span> : null}
      </p>
    </div>
  );
}

function BatchFields({ form, setForm, briefs, clients, lockClient }: { form: FormState; setForm: SetForm; briefs: BriefOption[]; clients?: Array<{ id: string; name: string }>; lockClient?: boolean }) {
  const briefChoices = briefs.filter((b) => b.client_id === form.client_id);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      {clients && !lockClient ? (
        <Field label="Client" required>
          <NativeSelect value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value, brief_id: "" }))} required>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      ) : null}
      <Field label="Titre du batch" required><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex. Batch octobre" maxLength={240} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" required>
          <NativeSelect value={form.kind} onChange={(e) => set("kind", e.target.value as LivrableKind)}>
            {(Object.keys(LIVRABLE_KIND) as LivrableKind[]).map((k) => <option key={k} value={k}>{LIVRABLE_KIND[k]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Mois" required><Input type="month" value={form.month} onChange={(e) => set("month", e.target.value)} required /></Field>
      </div>
      <Field label="Lien Frame" hint="Un seul lien pour tout le batch : c'est celui que le client reçoit. Vérifie les droits de partage.">
        <span className="relative block">
          <Frame className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-accent-2" aria-hidden />
          <Input type="url" inputMode="url" value={form.file_url} onChange={(e) => set("file_url", e.target.value)} placeholder="https://f.io/…" className="border-accent/40 bg-accent-soft/30 pl-9 focus:bg-surface" />
        </span>
      </Field>
      <Field label="Brief d'origine">
        <NativeSelect value={form.brief_id} onChange={(e) => set("brief_id", e.target.value)}>
          <option value="">Aucun</option>
          {briefChoices.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </NativeSelect>
      </Field>
      <ItemsEditor kind={form.kind} rows={form.rows} onChange={(rows) => set("rows", rows)} />
    </>
  );
}

export function NewLivrableDialog({ clients, briefs, defaultMonth, defaultClient, defaultBrief }: { clients: Array<{ id: string; name: string }>; briefs: BriefOption[]; defaultMonth: string; defaultClient?: string; defaultBrief?: string }) {
  const [open, setOpen] = useUrlFlag("new");
  const router = useRouter();
  const { exec, pending } = useAction();
  const initial = React.useCallback((): FormState => ({
    client_id: defaultClient || briefs.find((b) => b.id === defaultBrief)?.client_id || clients[0]?.id || "",
    month: defaultMonth, kind: "video", title: "", file_url: "", brief_id: defaultBrief || "", rows: [blank(), blank(), blank()],
  }), [defaultClient, defaultBrief, defaultMonth, clients, briefs]);
  const [form, setForm] = React.useState<FormState>(initial);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setForm(initial()); }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => createBatch({ client_id: form.client_id, month: form.month, kind: form.kind, title: form.title, file_url: form.file_url || null, brief_id: form.brief_id || null, items: toItems(form.rows) }),
      { success: "Batch enregistré · en contrôle agence.", refresh: false, onSuccess: (l) => { setOpen(false); router.push(`/studio/livrables/${l.id}`); } });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent side="right" title="Nouveau batch" description="Un lien Frame pour toute la livraison, et la liste des vidéos ou visuels qu'il contient. Le batch passe en contrôle agence avant d'être proposé au client.">
        <form onSubmit={submit} className="space-y-4">
          <BatchFields form={form} setForm={setForm} briefs={briefs} clients={clients} />
          <DialogFooter className={FOOTER}><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer le batch</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditLivrableDialog({ livrable, briefs, open, onOpenChange }: { livrable: Livrable; briefs: BriefOption[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { exec, pending } = useAction();
  const [form, setForm] = React.useState<FormState>(() => ({
    client_id: livrable.client_id, month: livrable.month.slice(0, 7), kind: livrable.kind, title: livrable.title, file_url: livrable.file_url ?? "", brief_id: livrable.brief_id ?? "",
    rows: livrable.items?.length ? livrable.items.map(fromItem) : [blank()],
  }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => updateBatch(livrable.id, { month: form.month, kind: form.kind, title: form.title, file_url: form.file_url || null, brief_id: form.brief_id || null, items: toItems(form.rows) }),
      { success: "Batch mis à jour.", onSuccess: () => onOpenChange(false) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" title="Modifier le batch" description="Titre, lien Frame et liste des éléments. Le statut du batch ne change pas.">
        <form onSubmit={submit} className="space-y-4">
          <BatchFields form={form} setForm={setForm} briefs={briefs} lockClient />
          <DialogFooter className={FOOTER}><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
