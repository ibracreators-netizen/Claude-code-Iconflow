import { Fragment } from "react";
import Link from "next/link";
import { BookOpenText, ChevronRight, Folder, FolderOpen, Inbox, Library, Share2 } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ClientChip } from "@/components/shared/client-chip";
import { DOC_KIND } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { CreateDocumentDialog } from "./_components/create-document-dialog";
import { DocumentFilters } from "./_components/filters";
import { DocumentMenu } from "./_components/document-menu";
import { FolderMenu } from "./_components/folder-menu";
import { FolderTree } from "./_components/folder-tree";
import { NewFolderButton } from "./_components/folder-dialogs";
import { UNFILED, countBySubtree, folderHref, folderPath, isUnfiled, paramsFrom, plural, subtreeIds } from "./_components/library";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await requireAgency("documents");
  const [clients, docs, folders] = await Promise.all([store.clients(), store.documents(), store.folders()]);
  const params = paramsFrom(sp);
  const q = (sp.q ?? "").trim().toLowerCase();
  const hasFilters = !!(q || sp.client || sp.kind);
  const folderIds = new Set(folders.map((f) => f.id));
  const byId = new Map(folders.map((f) => [f.id, f]));

  // Où sommes-nous ? Un dossier, les non classés, ou tout. Un identifiant inconnu (dossier supprimé) revient à « tout ».
  const key = sp.folder ?? "";
  const current = key && key !== UNFILED ? byId.get(key) ?? null : null;
  const mode: "all" | "unfiled" | "folder" = current ? "folder" : key === UNFILED ? "unfiled" : "all";
  const path = current ? folderPath(folders, current.id) : [];

  // Les filtres client / type / recherche s'appliquent partout ; le volet compte les documents qui y répondent, dossier par dossier.
  const faceted = docs.filter((d) => (!sp.client || (sp.client === "interne" ? d.client_id === null : d.client_id === sp.client)) && (!sp.kind || d.kind === sp.kind) && (!q || d.title.toLowerCase().includes(q)));
  const counts = countBySubtree(folders, faceted);
  const unfiled = faceted.filter((d) => isUnfiled(d, folderIds));
  // Dans un dossier : ses documents directs ; une recherche fouille aussi ses sous-dossiers.
  const subtree = current ? subtreeIds(folders, current.id) : null;
  const shown = mode === "all" ? faceted : mode === "unfiled" ? unfiled : faceted.filter((d) => !!d.folder_id && (q ? subtree!.has(d.folder_id) : d.folder_id === current!.id));
  const subFolders = current ? folders.filter((f) => f.parent_id === current.id) : [];
  const childCount = (id: string) => folders.filter((f) => f.parent_id === id).length;

  const name = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "Client archivé";
  const templates = docs.filter((d) => d.kind === "template").map((d) => ({ id: d.id, title: d.title, icon: d.icon, content: d.content }));
  const recent = docs.slice(0, 4);
  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));
  const crumbLink = "inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-surface-2 hover:text-fg";

  const empty = mode === "folder"
    ? (hasFilters ? { icon: FolderOpen, title: "Aucun document ici", description: "Aucun document de ce dossier ne correspond à ces filtres." } : subFolders.length ? { icon: FolderOpen, title: "Aucun document directement ici", description: "Les documents de ce dossier sont rangés dans ses sous-dossiers." } : { icon: FolderOpen, title: "Dossier vide", description: "Crée un document ici, ou déplace-en un depuis son menu ⋯ → « Déplacer vers… »." })
    : mode === "unfiled"
      ? (hasFilters ? { icon: Inbox, title: "Aucun document non classé", description: "Aucun document sans dossier ne correspond à ces filtres." } : { icon: Inbox, title: "Tout est rangé", description: "Aucun document sans dossier. Les nouveaux documents créés hors d'un dossier apparaîtront ici." })
      : { icon: BookOpenText, title: "Aucun document", description: docs.length ? "Aucun document ne correspond à ces filtres." : "Crée ton premier document : une stratégie, un compte-rendu, une SOP." };

  return (
    <>
      <PageHeader eyebrow="Connaissance" title="Documents" description="Stratégies, comptes-rendus, briefs, SOP et templates, rangés en dossiers. Rédigés ici, partagés au client en un clic."
        actions={<><NewFolderButton parentId={current?.id ?? null} parentName={current?.name} /><CreateDocumentDialog clients={clientOptions} templates={templates} folders={folders} defaultClient={sp.client} defaultFolder={current?.id ?? null} autoOpen={sp.new === "1"} /></>} />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
        <FolderTree folders={folders} currentKey={mode === "folder" ? current!.id : mode === "unfiled" ? UNFILED : ""} counts={counts} totalCount={faceted.length} unfiledCount={unfiled.length} />

        <section className="min-w-0" aria-label="Contenu de la bibliothèque">
          {/* Fil d'Ariane + actions du dossier courant */}
          <div className="mb-4 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <nav aria-label="Fil d'Ariane" className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px] text-muted">
                {mode === "all" ? <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 font-medium text-fg"><Library className="size-3.5 text-accent-2" />Tous les documents</span>
                  : <Link href={folderHref(null, params)} className={crumbLink}><Library className="size-3.5" />Documents</Link>}
                {mode === "unfiled" ? <><ChevronRight className="size-3.5 shrink-0 opacity-60" /><span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 font-medium text-fg"><Inbox className="size-3.5 text-accent-2" />Non classés</span></> : null}
                {path.map((f, i) => {
                  const last = i === path.length - 1;
                  return (
                    <Fragment key={f.id}>
                      <ChevronRight className="size-3.5 shrink-0 opacity-60" />
                      {last ? <span className="inline-flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 font-medium text-fg" aria-current="page"><FolderOpen className="size-3.5 shrink-0 text-accent-2" /><span className="truncate">{f.name}</span></span>
                        : <Link href={folderHref(f.id, params)} className={crumbLink}><Folder className="size-3.5 shrink-0" /><span className="truncate">{f.name}</span></Link>}
                    </Fragment>
                  );
                })}
              </nav>
              <p className="mt-1 px-1.5 text-[12.5px] tabular text-muted">
                {plural(shown.length, "document")}{mode === "folder" && subFolders.length ? ` · ${plural(subFolders.length, "sous-dossier")}` : ""}{mode === "folder" && q ? " · sous-dossiers compris" : ""}
              </p>
            </div>
            {current ? <FolderMenu folder={current} folders={folders} count={counts[current.id] ?? 0} /> : null}
          </div>

          {mode === "all" && !hasFilters && recent.length ? (
            <div className="mb-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Récents</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {recent.map((d) => (
                  <Link key={d.id} href={`/studio/documents/${d.id}`} className="card group p-4 transition hover:border-border-strong hover:shadow-pop">
                    <div className="text-2xl">{d.icon}</div>
                    <h3 className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight group-hover:text-accent-2">{d.title}</h3>
                    <p className="mt-1 truncate text-[12px] text-muted">{d.client_id ? name(d.client_id) : "Interne"} · {fmt.relative(d.updated_at)}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-4"><DocumentFilters clients={clientOptions} client={sp.client ?? ""} kind={sp.kind ?? ""} q={sp.q ?? ""} /></div>

          {subFolders.length ? (
            <div className="mb-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Sous-dossiers</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {subFolders.map((f) => {
                  const n = childCount(f.id);
                  return (
                    <div key={f.id} className="card group flex min-w-0 items-center gap-2 p-2.5 pl-3 transition hover:border-border-strong hover:shadow-pop">
                      <Link href={folderHref(f.id, params)} className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-2"><Folder className="size-4.5" /></span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[13.5px] font-medium leading-snug group-hover:text-accent-2">{f.name}</span>
                          <span className="block truncate text-[12px] tabular text-muted">{plural(counts[f.id] ?? 0, "document")}{n ? ` · ${plural(n, "sous-dossier")}` : ""}</span>
                        </span>
                      </Link>
                      <FolderMenu folder={f} folders={folders} count={counts[f.id] ?? 0} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!shown.length ? (
            <div className={cn(subFolders.length && "card")}><EmptyState icon={empty.icon} title={empty.title} description={empty.description} compact={!!subFolders.length} /></div>
          ) : (
            <>
              {subFolders.length ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Documents</p> : null}
              <div className="card divide-y divide-border">
                {shown.map((d) => {
                  const f = d.folder_id ? byId.get(d.folder_id) : undefined;
                  const showFolder = !!f && (mode !== "folder" || f.id !== current!.id);
                  return (
                    <div key={d.id} className="group flex items-center gap-2 px-3 py-2.5 transition hover:bg-surface-2/60 sm:gap-3 sm:px-4">
                      <Link href={`/studio/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-lg">{d.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium group-hover:text-accent-2">{d.title}</span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-muted">
                            <span className="shrink-0">Modifié {fmt.relative(d.updated_at)}</span>
                            {d.shared_with_client ? <span className="inline-flex shrink-0 items-center gap-1 text-accent-2"><Share2 className="size-3" />Partagé</span> : null}
                            {showFolder ? <span className="inline-flex min-w-0 items-center gap-1" title={folderPath(folders, f.id).map((p) => p.name).join(" / ")}><Folder className="size-3 shrink-0" /><span className="truncate">{f.name}</span></span> : null}
                          </span>
                        </span>
                      </Link>
                      <Badge tone={d.kind === "template" ? "violet" : d.kind === "strategie" ? "accent" : "neutral"} className="hidden sm:inline-flex">{DOC_KIND[d.kind]}</Badge>
                      <span className="hidden w-[150px] justify-end md:flex">{d.client_id ? <ClientChip name={name(d.client_id)} /> : <span className="text-[12.5px] text-muted">Interne</span>}</span>
                      <DocumentMenu doc={{ id: d.id, title: d.title, folder_id: d.folder_id }} folders={folders} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
