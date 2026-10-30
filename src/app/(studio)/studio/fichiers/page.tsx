import { requireAgency } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { FilesExplorer } from "./_components/files-explorer";

export const metadata = { title: "Fichiers" };

export default async function FilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await requireAgency();
  const [clients, all, profiles] = await Promise.all([store.clients(), store.files(), store.profiles()]);
  const scopes = [{ id: null as string | null, name: "Agence" }, ...clients.map((c) => ({ id: c.id as string | null, name: c.name }))];
  const scope = scopes.find((s) => (s.id ?? "agence") === (sp.client ?? "agence")) ?? scopes[0];
  const files = all.filter((f) => f.client_id === scope.id);
  const usage: Record<string, number> = {};
  all.forEach((f) => { const k = f.client_id ?? "agence"; usage[k] = (usage[k] ?? 0) + f.size; });
  const uploaders = Object.fromEntries(profiles.map((p) => [p.id, p.display_name ?? p.email ?? "—"]));
  return (
    <>
      <PageHeader eyebrow="Connaissance" title="Fichiers" description="Rushs, exports, brand kits et contrats, rangés par client. Le remplaçant de Drive, avec partage client maîtrisé." />
      <FilesExplorer scopes={scopes} scope={scope} files={files} folder={sp.folder ?? ""} q={sp.q ?? ""} uploaders={uploaders} usage={usage} />
    </>
  );
}
