"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Archive, Download, FileArchive, FileImage, FileText, FileVideo, File as FileIcon, FolderOpen, FolderPlus, LayoutGrid, List, MoreHorizontal, Pencil, Search, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteFile, getFileUrl, registerFile, updateFile } from "@/lib/actions/files";
import { useAction } from "@/lib/hooks/use-action";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { FileAsset } from "@/lib/data/types";
import { cn, fmt, slugify } from "@/lib/utils";

export const DEFAULT_FOLDERS = ["Rushs", "Exports", "Brand kit", "Contrats", "Dépôt client", "Général"];

export function formatBytes(n: number) {
  if (n < 1024) return `${n} o`;
  const u = ["Ko", "Mo", "Go", "To"]; let i = -1; let v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1).replace(".", ",")} ${u[i]}`;
}
function MimeIcon({ mime, className }: { mime: string; className?: string }) {
  const Icon = mime.startsWith("video/") ? FileVideo : mime.startsWith("image/") ? FileImage : mime.includes("pdf") ? FileText : mime.includes("zip") || mime.includes("compressed") ? FileArchive : FileIcon;
  const tone = mime.startsWith("video/") ? "text-violet" : mime.startsWith("image/") ? "text-info" : mime.includes("pdf") ? "text-danger" : "text-muted";
  return <Icon className={cn(tone, className)} />;
}

type Scope = { id: string | null; name: string };
export function FilesExplorer({ scopes, scope, files, folder, q, uploaders, usage }: {
  scopes: Scope[]; scope: Scope; files: FileAsset[]; folder: string; q: string; uploaders: Record<string, string>; usage: Record<string, number>;
}) {
  const { exec, pending } = useAction();
  const [view, setView] = React.useState<"grid" | "list">("list");
  const [search, setSearch] = React.useState(q);
  const [upload, setUpload] = React.useState(false);
  const [editing, setEditing] = React.useState<FileAsset | null>(null);
  const [deleting, setDeleting] = React.useState<FileAsset | null>(null);
  const [newFolder, setNewFolder] = React.useState<string | null>(null);
  const folders = Array.from(new Set([...DEFAULT_FOLDERS, ...files.map((f) => f.folder), ...(newFolder ? [newFolder] : [])]));
  const needle = search.trim().toLowerCase();
  const shown = files.filter((f) => (!folder || f.folder === folder) && (!needle || f.name.toLowerCase().includes(needle)));
  const scopeKey = scope.id ?? "agence";
  const href = (patch: Record<string, string | null>) => { const p = new URLSearchParams({ client: scopeKey, ...(folder ? { folder } : {}) }); Object.entries(patch).forEach(([k, v]) => v ? p.set(k, v) : p.delete(k)); return `/studio/fichiers?${p.toString()}`; };

  const open = async (f: FileAsset) => {
    const res = await exec(() => getFileUrl(f.path), { refresh: false });
    if (res.ok && res.data) window.open(res.data, "_blank", "noopener");
    else if (res.ok) toast.info("Aperçu indisponible en démo : le fichier n'est pas stocké.");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <div>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Espaces</p>
          <ul className="space-y-0.5">
            {scopes.map((s) => (
              <li key={s.id ?? "agence"}>
                <Link href={`/studio/fichiers?client=${s.id ?? "agence"}`} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition", (s.id ?? "agence") === scopeKey ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2")}>
                  {s.id ? <Avatar name={s.name} size={20} square /> : <FolderOpen className="size-4 text-accent-2" />}<span className="truncate">{s.name}</span>
                  <span className="ml-auto text-[11px] tabular text-muted">{formatBytes(usage[s.id ?? "agence"] ?? 0)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between px-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Dossiers</p><button onClick={() => { const n = prompt("Nom du nouveau dossier"); if (n?.trim()) setNewFolder(n.trim()); }} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Nouveau dossier"><FolderPlus className="size-3.5" /></button></div>
          <ul className="space-y-0.5">
            <li><Link href={href({ folder: null })} className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition", !folder ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface-2")}>Tous<span className="text-[11px] tabular text-muted">{files.length}</span></Link></li>
            {folders.map((f) => <li key={f}><Link href={href({ folder: f })} className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition", folder === f ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface-2")}><span className="truncate">{f}</span><span className="text-[11px] tabular text-muted">{files.filter((x) => x.folder === f).length}</span></Link></li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-[12px] text-muted">
          <p className="font-medium text-fg-2">{scope.name}</p>
          <p className="mt-0.5 tabular">{files.length} fichier{files.length > 1 ? "s" : ""} · {formatBytes(files.reduce((a, f) => a + f.size, 0))}</p>
          <Progress value={Math.min(100, (files.reduce((a, f) => a + f.size, 0) / (50 * 1024 ** 3)) * 100)} className="mt-2" />
          <p className="mt-1 text-[11px]">sur 50 Go (bucket studio)</p>
        </div>
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Rechercher dans ${scope.name}…`} className="pl-8" /></div>
          <div className="inline-flex rounded-lg bg-surface-2 p-1"><button onClick={() => setView("list")} className={cn("rounded-md p-1.5", view === "list" ? "bg-surface shadow-soft" : "text-muted")} aria-label="Liste"><List className="size-4" /></button><button onClick={() => setView("grid")} className={cn("rounded-md p-1.5", view === "grid" ? "bg-surface shadow-soft" : "text-muted")} aria-label="Grille"><LayoutGrid className="size-4" /></button></div>
          <Button onClick={() => setUpload(true)}><UploadCloud />Téléverser</Button>
        </div>

        {!shown.length ? <EmptyState icon={FolderOpen} title={files.length ? "Aucun fichier ici" : `${scope.name} n'a pas encore de fichiers`} description="Rushs, exports, brand kit, contrats : dépose tout ici, partage au client ce qu'il doit voir." action={<Button onClick={() => setUpload(true)}><UploadCloud />Téléverser</Button>} /> : view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((f) => (
              <article key={f.id} className="group card flex flex-col p-4 transition hover:border-border-strong">
                <div className="flex items-start justify-between"><span className="flex size-10 items-center justify-center rounded-lg bg-surface-2"><MimeIcon mime={f.mime} className="size-5" /></span><FileMenu f={f} onOpen={() => open(f)} onEdit={() => setEditing(f)} onDelete={() => setDeleting(f)} /></div>
                <button onClick={() => open(f)} className="mt-3 truncate text-left text-[13.5px] font-medium hover:text-accent-2" title={f.name}>{f.name}</button>
                <p className="mt-0.5 text-[12px] text-muted tabular">{formatBytes(f.size)} · {f.folder}</p>
                <div className="mt-3 flex items-center justify-between text-[12px] text-muted"><span>{fmt.date(f.created_at)}</span><label className="flex items-center gap-1.5"><span>Client</span><Switch checked={f.shared_with_client} disabled={pending || !scope.id} onCheckedChange={(v) => exec(() => updateFile(f.id, { shared_with_client: v }), { success: v ? "Partagé avec le client" : "Partage retiré" })} /></label></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-border bg-surface-2/60 text-left text-[11.5px] font-semibold uppercase tracking-wider text-muted"><th className="h-10 px-4 pl-5">Nom</th><th className="hidden h-10 px-4 md:table-cell">Dossier</th><th className="hidden h-10 px-4 md:table-cell">Taille</th><th className="hidden h-10 px-4 lg:table-cell">Déposé par</th><th className="h-10 px-4">Client</th><th className="h-10 px-4 pr-5" /></tr></thead>
              <tbody>
                {shown.map((f) => (
                  <tr key={f.id} className="border-b border-border transition hover:bg-surface-2/50 last:border-0">
                    <td className="px-4 py-2.5 pl-5"><button onClick={() => open(f)} className="flex items-center gap-2.5 text-left hover:text-accent-2"><MimeIcon mime={f.mime} className="size-4 shrink-0" /><span className="truncate font-medium">{f.name}</span></button><span className="block pl-[26px] text-[11.5px] text-muted md:hidden">{formatBytes(f.size)} · {f.folder}</span></td>
                    <td className="hidden px-4 py-2.5 md:table-cell"><Badge>{f.folder}</Badge></td>
                    <td className="hidden px-4 py-2.5 tabular text-muted md:table-cell">{formatBytes(f.size)}</td>
                    <td className="hidden px-4 py-2.5 text-muted lg:table-cell">{f.uploaded_by ? uploaders[f.uploaded_by] ?? "—" : "—"} · {fmt.date(f.created_at)}</td>
                    <td className="px-4 py-2.5"><Switch checked={f.shared_with_client} disabled={pending || !scope.id} onCheckedChange={(v) => exec(() => updateFile(f.id, { shared_with_client: v }), { success: v ? "Partagé avec le client" : "Partage retiré" })} aria-label="Partager avec le client" /></td>
                    <td className="px-4 py-2.5 pr-5 text-right"><FileMenu f={f} onOpen={() => open(f)} onEdit={() => setEditing(f)} onDelete={() => setDeleting(f)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {upload ? <UploadDialog open onOpenChange={setUpload} scope={scope} folders={folders} defaultFolder={folder || "Général"} /> : null}
      {editing ? <EditFileDialog key={editing.id} file={editing} onOpenChange={(o) => !o && setEditing(null)} folders={folders} pending={pending} onSave={(patch) => exec(() => updateFile(editing.id, patch), { success: "Fichier mis à jour", onSuccess: () => setEditing(null) })} /> : null}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Supprimer ce fichier ?" description={`${deleting?.name} sera supprimé définitivement du stockage.`} confirmLabel="Supprimer" danger loading={pending} onConfirm={async () => { await exec(() => deleteFile(deleting!.id), { success: "Fichier supprimé", onSuccess: () => setDeleting(null) }); }} />
    </div>
  );
}

function FileMenu({ f, onOpen, onEdit, onDelete }: { f: FileAsset; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Dropdown>
      <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${f.name}`}><MoreHorizontal /></Button></DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={onOpen}><Download />Ouvrir / télécharger</DropdownItem>
        <DropdownItem onSelect={onEdit}><Pencil />Renommer / déplacer</DropdownItem>
        <DropdownSeparator />
        <DropdownItem danger onSelect={onDelete}><Trash2 />Supprimer</DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function EditFileDialog({ file, onOpenChange, folders, onSave, pending }: { file: FileAsset; onOpenChange: (o: boolean) => void; folders: string[]; onSave: (p: { name: string; folder: string }) => void; pending: boolean }) {
  const [name, setName] = React.useState(file.name); const [folder, setFolder] = React.useState(file.folder);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title="Renommer / déplacer">
        <div className="grid gap-4"><Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Dossier"><NativeSelect value={folder} onChange={(e) => setFolder(e.target.value)}>{folders.map((f) => <option key={f}>{f}</option>)}</NativeSelect></Field></div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button loading={pending} onClick={() => onSave({ name: name.trim() || file.name, folder })}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({ open, onOpenChange, scope, folders, defaultFolder }: { open: boolean; onOpenChange: (o: boolean) => void; scope: Scope; folders: string[]; defaultFolder: string }) {
  const { exec } = useAction();
  const [folder, setFolder] = React.useState(defaultFolder);
  const [queue, setQueue] = React.useState<Array<{ file: File; progress: number; status: "pending" | "uploading" | "done" | "error"; error?: string }>>([]);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const configured = isSupabaseConfigured();

  const add = (files: FileList | null) => { if (!files) return; setQueue((q) => [...q, ...Array.from(files).map((file) => ({ file, progress: 0, status: "pending" as const }))]); };
  const start = async () => {
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]; if (item.status !== "pending") continue;
      setQueue((q) => q.map((x, j) => j === i ? { ...x, status: "uploading", progress: 10 } : x));
      const path = `clients/${scope.id ?? "agence"}/${slugify(folder) || "general"}/${Date.now()}-${slugify(item.file.name.replace(/\.[^.]+$/, ""))}.${item.file.name.split(".").pop()}`;
      try {
        if (configured) {
          const { createClient } = await import("@/lib/supabase/client");
          const { error } = await createClient().storage.from("studio").upload(path, item.file, { upsert: false, contentType: item.file.type || undefined });
          if (error) throw error;
        }
        setQueue((q) => q.map((x, j) => j === i ? { ...x, progress: 80 } : x));
        const res = await exec(() => registerFile({ name: item.file.name, path, mime: item.file.type || "application/octet-stream", size: item.file.size, client_id: scope.id, livrable_id: null, folder, shared_with_client: false }), { refresh: i === queue.length - 1 });
        if (!res.ok) throw new Error(res.error);
        setQueue((q) => q.map((x, j) => j === i ? { ...x, status: "done", progress: 100 } : x));
      } catch (e) {
        setQueue((q) => q.map((x, j) => j === i ? { ...x, status: "error", error: (e as Error).message } : x));
      }
    }
    toast.success("Téléversement terminé");
  };
  const allDone = queue.length > 0 && queue.every((q) => q.status === "done" || q.status === "error");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Téléverser dans ${scope.name}`} description={configured ? "Stockage privé Supabase (bucket studio). Partage ensuite au client si besoin." : "Mode démo : les métadonnées sont enregistrées, le fichier n'est pas stocké."}>
        <div className="grid gap-4">
          <Field label="Dossier"><NativeSelect value={folder} onChange={(e) => setFolder(e.target.value)}>{folders.map((f) => <option key={f}>{f}</option>)}</NativeSelect></Field>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition", drag ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent/50 hover:bg-surface-2/60")}>
            <UploadCloud className="size-7 text-accent-2" /><p className="mt-2 text-[14px] font-medium">Glisse tes fichiers ici</p><p className="text-[12.5px] text-muted">ou clique pour parcourir · vidéos, images, PDF, archives · 500 Mo max</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          </div>
          {queue.length ? (
            <ul className="space-y-2">
              {queue.map((q, i) => (
                <li key={i} className="rounded-lg border border-border p-2.5 text-[13px]">
                  <div className="flex items-center gap-2"><MimeIcon mime={q.file.type} className="size-4" /><span className="truncate font-medium">{q.file.name}</span><span className="ml-auto text-[12px] tabular text-muted">{formatBytes(q.file.size)}</span>{q.status === "done" ? <Badge tone="success">OK</Badge> : q.status === "error" ? <Badge tone="danger">Erreur</Badge> : null}</div>
                  {q.status === "uploading" ? <Progress value={q.progress} className="mt-2" /> : q.error ? <p className="mt-1 text-[12px] text-danger">{q.error}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>{allDone ? "Fermer" : "Annuler"}</Button>{!allDone ? <Button disabled={!queue.some((q) => q.status === "pending")} onClick={start}><Archive />Envoyer {queue.filter((q) => q.status === "pending").length || ""}</Button> : null}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
