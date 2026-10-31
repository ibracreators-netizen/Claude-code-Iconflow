"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Inbox, Library, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { DocumentFolder } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { FolderMenu } from "./folder-menu";
import { NewFolderDialog } from "./folder-dialogs";
import { buildTree, folderHref, folderPath, paramsFrom, UNFILED, type FolderNode } from "./library";

/**
 * Volet des dossiers. Sur grand écran : colonne fixe à gauche. Sur mobile : une barre qui affiche le dossier courant
 * et se déplie pour montrer l'arborescence. Les compteurs tiennent compte des filtres actifs (client, type, recherche).
 */
export function FolderTree({ folders, currentKey, counts, totalCount, unfiledCount }: { folders: DocumentFolder[]; currentKey: string; counts: Record<string, number>; totalCount: number; unfiledCount: number }) {
  const sp = useSearchParams();
  const params = paramsFrom(sp);
  const roots = React.useMemo(() => buildTree(folders), [folders]);
  const current = currentKey && currentKey !== UNFILED ? folders.find((f) => f.id === currentKey) ?? null : null;
  const ancestors = React.useMemo(() => new Set(folderPath(folders, current?.id).map((f) => f.id)), [folders, current?.id]);
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [newRoot, setNewRoot] = React.useState(false);
  const isOpen = (id: string) => toggled[id] ?? ancestors.has(id);
  const currentLabel = current ? current.name : currentKey === UNFILED ? "Non classés" : "Tous les documents";
  const currentCount = current ? counts[current.id] ?? 0 : currentKey === UNFILED ? unfiledCount : totalCount;
  const onNavigate = () => setMobileOpen(false);

  const renderNode = (node: FolderNode) => {
    const active = node.id === current?.id;
    const open = isOpen(node.id);
    const hasChildren = node.children.length > 0;
    return (
      <li key={node.id}>
        <div className={cn("group flex items-center rounded-lg pr-0.5 transition", active ? "bg-accent-soft" : "hover:bg-surface-2")} style={{ paddingLeft: node.depth * 14 }}>
          <button type="button" onClick={() => setToggled((t) => ({ ...t, [node.id]: !open }))} aria-label={open ? `Replier ${node.name}` : `Déplier ${node.name}`} aria-expanded={open}
            className={cn("flex size-6 shrink-0 items-center justify-center rounded text-muted-2 transition hover:text-fg", !hasChildren && "invisible")} tabIndex={hasChildren ? 0 : -1}>
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
          <Link href={folderHref(node.id, params)} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-[13px]", active ? "font-medium text-fg" : "text-fg-2")}>
            {active || (open && hasChildren) ? <FolderOpen className={cn("size-4 shrink-0", active ? "text-accent-2" : "text-muted")} /> : <Folder className="size-4 shrink-0 text-muted" />}
            <span className="truncate">{node.name}</span>
            <span className={cn("ml-auto pl-2 text-[11px] tabular", active ? "text-accent-2" : "text-muted")}>{counts[node.id] ?? 0}</span>
          </Link>
          <FolderMenu folder={node} folders={folders} count={counts[node.id] ?? 0} className="lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:focus-visible:opacity-100 lg:data-[state=open]:opacity-100" />
        </div>
        {hasChildren && open ? <ul>{node.children.map(renderNode)}</ul> : null}
      </li>
    );
  };

  const tree = (
    <nav aria-label="Dossiers">
      <ul className="space-y-0.5">
        <RootLink href={folderHref(null, params)} active={!current && currentKey !== UNFILED} icon={Library} label="Tous les documents" count={totalCount} onNavigate={onNavigate} />
        <RootLink href={folderHref(UNFILED, params)} active={currentKey === UNFILED} icon={Inbox} label="Non classés" count={unfiledCount} onNavigate={onNavigate} />
      </ul>
      <div className="mb-1.5 mt-4 flex items-center justify-between pl-2.5 pr-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Dossiers</p>
        <Tooltip label="Nouveau dossier principal"><button type="button" onClick={() => setNewRoot(true)} className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Nouveau dossier principal"><FolderPlus className="size-3.5" /></button></Tooltip>
      </div>
      {roots.length ? <ul className="space-y-0.5">{roots.map(renderNode)}</ul> : <p className="px-2.5 py-2 text-[12.5px] leading-relaxed text-muted">Aucun dossier pour l&apos;instant. Crée le premier pour ranger tes documents.</p>}
    </nav>
  );

  return (
    <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <button type="button" onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen} aria-controls="documents-folders"
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left shadow-soft transition hover:border-border-strong lg:hidden">
        <FolderOpen className="size-4 shrink-0 text-accent-2" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{currentLabel}</span>
        <span className="text-[11.5px] tabular text-muted">{currentCount}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", mobileOpen && "rotate-180")} />
      </button>
      <div id="documents-folders" className={cn("mt-2 rounded-xl border border-border bg-surface p-2 shadow-soft lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none", !mobileOpen && "hidden lg:block")}>
        {tree}
      </div>
      {newRoot ? <NewFolderDialog parentId={null} onClose={() => setNewRoot(false)} /> : null}
    </aside>
  );
}

function RootLink({ href, active, icon: Icon, label, count, onNavigate }: { href: string; active: boolean; icon: LucideIcon; label: string; count: number; onNavigate: () => void }) {
  return (
    <li>
      <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition", active ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2")}>
        <Icon className={cn("size-4 shrink-0", active ? "text-accent-2" : "text-muted")} />
        <span className="truncate">{label}</span>
        <span className={cn("ml-auto text-[11px] tabular", active ? "text-accent-2" : "text-muted")}>{count}</span>
      </Link>
    </li>
  );
}
