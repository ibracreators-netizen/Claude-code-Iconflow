"use client";
import * as React from "react";
import { Check, Folder, FolderPlus, Inbox, Search } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { createFolder, updateFolder } from "@/lib/actions/documents";
import { useAction } from "@/lib/hooks/use-action";
import type { DocumentFolder } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { buildTree, flattenTree, folderPath } from "./library";

/* Les dialogues sont montés à la demande (`{open ? <Dialog… /> : null}`) : leur état part toujours de zéro. */

/** Création d'un dossier dans `parentId` (ou à la racine si null). */
export function NewFolderDialog({ parentId, parentName, onClose, onCreated }: { parentId: string | null; parentName?: string | null; onClose: () => void; onCreated?: (folder: DocumentFolder) => void }) {
  const [name, setName] = React.useState("");
  const { exec, pending } = useAction();
  const submit = () => {
    const n = name.trim(); if (!n) return;
    exec(() => createFolder({ name: n, parent_id: parentId }), { success: "Dossier créé", onSuccess: (f) => { onCreated?.(f); onClose(); } });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={parentId ? "Nouveau sous-dossier" : "Nouveau dossier"} description={parentId ? `Créé dans « ${parentName ?? "ce dossier"} ».` : "Un dossier principal, visible dans le volet des dossiers."}>
        <Field label="Nom" required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={parentId ? "Comptes-rendus 2026" : "Production"} maxLength={120} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={pending} disabled={!name.trim()} onClick={submit}><FolderPlus />Créer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton « Nouveau dossier » autonome (en-tête de page). Crée dans le dossier courant, ou à la racine. */
export function NewFolderButton({ parentId, parentName, variant = "secondary", size, className }: { parentId: string | null; parentName?: string | null; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}><FolderPlus />{parentId ? "Nouveau sous-dossier" : "Nouveau dossier"}</Button>
      {open ? <NewFolderDialog parentId={parentId} parentName={parentName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function RenameFolderDialog({ folder, onClose }: { folder: DocumentFolder; onClose: () => void }) {
  const [name, setName] = React.useState(folder.name);
  const { exec, pending } = useAction();
  const submit = () => {
    const n = name.trim(); if (!n) return;
    if (n === folder.name) { onClose(); return; }
    exec(() => updateFolder(folder.id, { name: n }), { success: "Dossier renommé", onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Renommer le dossier">
        <Field label="Nom" required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} onFocus={(e) => e.target.select()} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={pending} disabled={!name.trim()} onClick={submit}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * « Déplacer vers… » : l'arborescence complète, une recherche, un choix.
 * `value` est l'emplacement actuel (null = racine / non classé) ; `excludeIds` grise les destinations interdites
 * (un dossier ne se déplace ni dans lui-même ni dans un de ses sous-dossiers).
 */
export function MoveToDialog({ title = "Déplacer vers…", description, folders, value, excludeIds, rootLabel = "Non classé", rootHint, onClose, onPick, pending }: {
  title?: string; description?: string; folders: DocumentFolder[]; value: string | null; excludeIds?: Set<string>; rootLabel?: string; rootHint?: string;
  onClose: () => void; onPick: (folderId: string | null) => void | Promise<void>; pending?: boolean;
}) {
  const [picked, setPicked] = React.useState<string | null>(value);
  const [q, setQ] = React.useState("");
  const items = React.useMemo(() => flattenTree(buildTree(folders)), [folders]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((f) => f.name.toLowerCase().includes(needle)) : items;
  const changed = picked !== value;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={description}>
        {items.length > 6 ? (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un dossier…" className="pl-8" aria-label="Rechercher un dossier" />
          </div>
        ) : null}
        <div role="listbox" aria-label="Destination" className="max-h-[50vh] overflow-y-auto rounded-lg border border-border p-1">
          {!needle ? <Option depth={0} icon={Inbox} label={rootLabel} hint={rootHint} selected={picked === null} current={value === null} onClick={() => setPicked(null)} /> : null}
          {shown.map((f) => {
            const disabled = excludeIds?.has(f.id) ?? false;
            const hint = needle ? folderPath(folders, f.parent_id).map((p) => p.name).join(" / ") : undefined;
            return <Option key={f.id} depth={needle ? 0 : f.depth} icon={Folder} label={f.name} hint={hint || undefined} selected={picked === f.id} current={value === f.id} disabled={disabled} onClick={() => setPicked(f.id)} />;
          })}
          {needle && !shown.length ? <p className="px-3 py-6 text-center text-[13px] text-muted">Aucun dossier ne porte ce nom.</p> : null}
          {!folders.length ? <p className="px-3 py-3 text-center text-[12.5px] text-muted">Pas encore de dossier : crée-en un depuis « Nouveau dossier ».</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button loading={pending} disabled={!changed} onClick={() => onPick(picked)}>Déplacer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Option({ depth, icon: Icon, label, hint, selected, current, disabled, onClick }: { depth: number; icon: typeof Folder; label: string; hint?: string; selected: boolean; current: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={selected} disabled={disabled} onClick={onClick} style={{ paddingLeft: 10 + depth * 16 }}
      className={cn("flex w-full items-center gap-2 rounded-md py-1.5 pr-2.5 text-left text-[13px] transition", selected ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2", disabled && "opacity-40 hover:bg-transparent")}>
      <Icon className={cn("size-4 shrink-0", selected ? "text-accent-2" : "text-muted")} />
      <span className="min-w-0 flex-1 truncate">{label}{hint ? <span className="ml-1.5 text-[11.5px] text-muted">{hint}</span> : null}</span>
      {current ? <span className="shrink-0 text-[11px] text-muted">Actuel</span> : null}
      {selected ? <Check className="size-3.5 shrink-0 text-accent-2" /> : null}
    </button>
  );
}
