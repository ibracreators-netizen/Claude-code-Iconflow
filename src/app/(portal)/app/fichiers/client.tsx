"use client";
import * as React from "react";
import { toast } from "sonner";
import { Download, FileArchive, FileImage, FileText, FileVideo, File as FileIcon, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, Th, Td, Tr } from "@/components/ui/misc";
import { useAction } from "@/lib/hooks/use-action";
import { getFileUrl, registerClientFile } from "@/lib/actions/portal";
import { createClient } from "@/lib/supabase/client";
import { fmt, slugify } from "@/lib/utils";
import type { FileAsset } from "@/lib/data/types";

function icon(mime: string) { if (mime.startsWith("video/")) return FileVideo; if (mime.startsWith("image/")) return FileImage; if (mime.includes("zip")) return FileArchive; if (mime.includes("pdf") || mime.startsWith("text/")) return FileText; return FileIcon; }
function size(b: number) { return b > 1e9 ? `${(b / 1e9).toFixed(1)} Go` : b > 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`; }

export function FileList({ files, connected }: { files: FileAsset[]; connected: boolean }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const open = async (f: FileAsset) => {
    if (!connected) { toast.info("Aperçu indisponible en démo."); return; }
    setBusy(f.id);
    const r = await getFileUrl(f.path);
    setBusy(null);
    if (r.ok && r.data) window.open(r.data, "_blank", "noopener"); else toast.error(r.ok ? "Lien indisponible." : r.error);
  };
  return (
    <Table>
      <thead><tr><Th>Fichier</Th><Th className="hidden sm:table-cell">Taille</Th><Th className="hidden sm:table-cell">Ajouté</Th><Th className="text-right">Action</Th></tr></thead>
      <tbody>{files.map((f) => { const I = icon(f.mime); return (
        <Tr key={f.id}><Td><span className="flex items-center gap-2.5"><I className="size-4 shrink-0 text-muted" /><span className="truncate font-medium">{f.name}</span></span></Td><Td className="hidden tabular text-muted sm:table-cell">{size(f.size)}</Td><Td className="hidden text-muted sm:table-cell">{fmt.date(f.created_at)}</Td><Td className="text-right"><Button size="sm" variant="ghost" loading={busy === f.id} onClick={() => open(f)}><Download />Ouvrir</Button></Td></Tr>
      ); })}</tbody>
    </Table>
  );
}

export function UploadZone({ clientId, connected }: { clientId: string; connected: boolean }) {
  const { exec, pending } = useAction();
  const [drag, setDrag] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handle = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > 500 * 1024 * 1024) { toast.error(`${file.name} dépasse 500 Mo.`); continue; }
        const path = `clients/${clientId}/depot/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ""))}${file.name.match(/\.[^.]+$/)?.[0] ?? ""}`;
        if (connected) {
          const { error } = await createClient().storage.from("studio").upload(path, file, { upsert: false, contentType: file.type || undefined });
          if (error) { toast.error(`Envoi impossible : ${error.message}`); continue; }
        }
        await exec(() => registerClientFile({ name: file.name, path, mime: file.type || "application/octet-stream", size: file.size, client_id: clientId }), { success: `${file.name} déposé.` });
      }
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  return (
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition ${drag ? "border-accent bg-accent-soft" : "border-border-strong bg-surface"}`}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-accent-2 hairline"><UploadCloud className="size-5" /></span>
      <p className="text-[14px] font-medium">Déposer un fichier pour l&apos;équipe</p>
      <p className="text-[12.5px] text-muted">Logos, packshots, rushs, documents… Glissez-déposez ou choisissez un fichier (500 Mo max).{connected ? "" : " En démo, seul le nom est enregistré."}</p>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => handle(e.target.files)} />
      <Button size="sm" variant="secondary" loading={uploading || pending} onClick={() => inputRef.current?.click()}>Choisir des fichiers</Button>
    </div>
  );
}
