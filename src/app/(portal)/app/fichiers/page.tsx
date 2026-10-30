import { FolderOpen } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { FileList, UploadZone } from "./client";

export const metadata = { title: "Fichiers" };

export default async function FilesPage() {
  const store = await requireClient();
  const files = await store.files({ clientId: store.clientId });
  const folders = [...new Set(files.map((f) => f.folder))].sort((a, b) => a.localeCompare(b));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Espace" title="Fichiers" description="Exports, brand kit, rushs partagés… et votre espace de dépôt pour nous transmettre vos éléments." />
      <UploadZone clientId={store.clientId} connected={isSupabaseConfigured()} />
      {files.length ? folders.map((folder) => (
        <section key={folder}>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted"><FolderOpen className="size-4" />{folder}<span className="text-muted-2">· {files.filter((f) => f.folder === folder).length}</span></h2>
          <FileList files={files.filter((f) => f.folder === folder)} connected={isSupabaseConfigured()} />
        </section>
      )) : <div className="card"><EmptyState icon={FolderOpen} title="Aucun fichier partagé" description="Les exports et ressources partagés par l'équipe apparaîtront ici." /></div>}
    </div>
  );
}
