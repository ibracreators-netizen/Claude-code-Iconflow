"use client";
import * as React from "react";
import { AlertTriangle, ExternalLink, Import, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createBrainEntry, deleteBrainEntry, updateBrainEntry } from "@/lib/actions/brain";
import { useAction } from "@/lib/hooks/use-action";
import { BRAIN_KIND, BRAIN_SECTIONS, type BrainEntry, type BrainEntryKind } from "@/lib/data/types";
import { Chip, SearchParam, useSetParams } from "./url-controls";

const KINDS = Object.keys(BRAIN_KIND) as BrainEntryKind[];

export function BrainEntries({ clientId, clientName, entries, kind, q }: { clientId: string; clientName: string; entries: BrainEntry[]; kind: string; q: string }) {
  const set = useSetParams();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BrainEntry | null>(null);
  const [deleting, setDeleting] = React.useState<BrainEntry | null>(null);
  const { exec, pending } = useAction();

  const needle = q.trim().toLowerCase();
  const filtered = entries.filter((e) => (!kind || e.kind === kind) && (!needle || `${e.title ?? ""} ${e.content} ${e.section}`.toLowerCase().includes(needle)));
  const sections = [...BRAIN_SECTIONS as readonly string[], ...Array.from(new Set(entries.map((e) => e.section))).filter((s) => !(BRAIN_SECTIONS as readonly string[]).includes(s))];
  const toSettle = entries.filter((e) => e.kind === "conflit" || e.kind === "manque").length;
  const counts = Object.fromEntries(KINDS.map((k) => [k, entries.filter((e) => e.kind === k).length]));

  return (
    <section className="animate-rise">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Fiches du Brain</h2>
          <p className="text-[13px] text-muted">{entries.length} fiche{entries.length > 1 ? "s" : ""} · sources, informations déclarées et points à vérifier. Réservé à l&apos;agence.</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchParam placeholder="Rechercher une fiche…" defaultValue={q} className="w-full md:w-[240px]" />
          <Button onClick={() => setOpen(true)}><Plus />Nourrir le Brain</Button>
        </div>
      </div>
      {toSettle ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px]">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span><strong>{toSettle} point{toSettle > 1 ? "s" : ""} à trancher</strong> (conflits et manques) avant d&apos;écrire les prochains scripts.</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => set({ kind: kind === "conflit" ? "manque" : "conflit" })}>Voir</Button>
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={!kind} onClick={() => set({ kind: null })} count={entries.length}>Toutes</Chip>
        {KINDS.map((k) => <Chip key={k} active={kind === k} onClick={() => set({ kind: kind === k ? null : k })} count={counts[k]}>{BRAIN_KIND[k]}</Chip>)}
      </div>

      {!filtered.length ? (
        <EmptyState icon={Import} title={entries.length ? "Aucune fiche ne correspond" : `Le Brain de ${clientName} est vide`} description={entries.length ? "Modifie les filtres ou la recherche." : "Ajoute des faits, directives et références : chaque fiche nourrit les angles et les scripts."} action={!entries.length ? <Button onClick={() => setOpen(true)}><Plus />Première fiche</Button> : undefined} />
      ) : (
        <div className="space-y-7">
          {sections.filter((s) => filtered.some((e) => e.section === s)).map((section) => (
            <div key={section}>
              <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{section}<span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular">{filtered.filter((e) => e.section === section).length}</span></h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.filter((e) => e.section === section).map((e) => (
                  <article key={e.id} className="group card flex flex-col p-4 transition hover:border-border-strong">
                    <div className="flex items-center gap-2">
                      <StatusBadge kind="brain" value={e.kind} />
                      <Badge tone="outline" className="gap-1">{e.origin === "import" ? <Import className="size-3" /> : <UserRound className="size-3" />}{e.origin === "import" ? "Import" : "Manuel"}</Badge>
                      <div className="ml-auto flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(e)} aria-label="Modifier"><Pencil /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(e)} aria-label="Supprimer"><Trash2 /></Button>
                      </div>
                    </div>
                    {e.title ? <h4 className="mt-2.5 text-[14px] font-semibold leading-snug">{e.title}</h4> : null}
                    <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{e.content}</p>
                    {e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 truncate text-[12px] text-muted transition hover:text-accent-2"><ExternalLink className="size-3" />{e.source_url.replace(/^https?:\/\//, "")}</a> : null}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <EntryDialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }} entry={editing} sections={sections} pending={pending}
        onSubmit={(values) => {
          if (editing) return exec(() => updateBrainEntry(editing.id, values), { success: "Fiche mise à jour", onSuccess: () => setEditing(null) });
          return exec(() => createBrainEntry({ client_id: clientId, ...values }), { success: "Fiche ajoutée au Brain", onSuccess: () => setOpen(false) });
        }} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Supprimer cette fiche ?" description={deleting?.title ?? deleting?.content.slice(0, 80)} confirmLabel="Supprimer" danger loading={pending}
        onConfirm={async () => { await exec(() => deleteBrainEntry(deleting!.id), { success: "Fiche supprimée", onSuccess: () => setDeleting(null) }); }} />
    </section>
  );
}

function EntryDialog({ open, onOpenChange, entry, sections, onSubmit, pending }: { open: boolean; onOpenChange: (o: boolean) => void; entry: BrainEntry | null; sections: string[]; onSubmit: (v: { section: string; kind: BrainEntryKind; title: string; content: string; source_url: string | null }) => void; pending: boolean }) {
  const [section, setSection] = React.useState(entry?.section ?? sections[0]);
  const [custom, setCustom] = React.useState("");
  const [kind, setKind] = React.useState<BrainEntryKind>(entry?.kind ?? "note");
  const [title, setTitle] = React.useState(entry?.title ?? "");
  const [content, setContent] = React.useState(entry?.content ?? "");
  const [url, setUrl] = React.useState(entry?.source_url ?? "");
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { setSection(entry?.section ?? sections[0]); setCustom(""); setKind(entry?.kind ?? "note"); setTitle(entry?.title ?? ""); setContent(entry?.content ?? ""); setUrl(entry?.source_url ?? ""); setErr(""); } }, [open, entry, sections]);
  const submit = () => {
    const s = section === "__custom" ? custom.trim() : section;
    if (!s || !title.trim() || !content.trim()) { setErr("Rubrique, titre et contenu sont requis."); return; }
    if (url && !/^https?:\/\//.test(url)) { setErr("Le lien source doit commencer par http(s)://"); return; }
    onSubmit({ section: s, kind, title: title.trim(), content: content.trim(), source_url: url.trim() || null });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={entry ? "Modifier la fiche" : "Nourrir le Brain"} description="Une information par fiche. Distingue ce qui est prouvé de ce qui est déclaré.">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rubrique" required>
              <NativeSelect value={section} onChange={(e) => setSection(e.target.value)}>{sections.map((s) => <option key={s} value={s}>{s}</option>)}<option value="__custom">Autre rubrique…</option></NativeSelect>
            </Field>
            <Field label="Type" required><NativeSelect value={kind} onChange={(e) => setKind(e.target.value as BrainEntryKind)}>{(Object.keys(BRAIN_KIND) as BrainEntryKind[]).map((k) => <option key={k} value={k}>{BRAIN_KIND[k]}</option>)}</NativeSelect></Field>
          </div>
          {section === "__custom" ? <Field label="Nom de la rubrique" required><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ex. Logistique" /></Field> : null}
          <Field label="Titre" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Tenue annoncée 6 semaines" maxLength={500} /></Field>
          <Field label="Contenu" required><Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Le fait, la source, le contexte…" /></Field>
          <Field label="Lien source" hint="Optionnel · HTTP(S)"><Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
          {err ? <p className="text-[13px] text-danger" role="alert">{err}</p> : null}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button loading={pending} onClick={submit}>{entry ? "Enregistrer" : "Ajouter"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
