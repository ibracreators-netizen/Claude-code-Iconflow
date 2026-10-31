"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderInput, FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteFolder, updateFolder } from "@/lib/actions/documents";
import { useAction } from "@/lib/hooks/use-action";
import type { DocumentFolder } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { MoveToDialog, NewFolderDialog, RenameFolderDialog } from "./folder-dialogs";
import { folderHref, paramsFrom, plural, subtreeIds } from "./library";

type Action = "new" | "rename" | "move" | "delete";

/**
 * Menu ⋯ d'un dossier : sous-dossier, renommer, déplacer, supprimer.
 * `count` : documents du dossier (sous-dossiers compris), pour un message de suppression exact.
 */
export function FolderMenu({ folder, folders, count, className }: { folder: DocumentFolder; folders: DocumentFolder[]; count?: number; className?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { exec, pending } = useAction();
  const [action, setAction] = React.useState<Action | null>(null);
  const close = () => setAction(null);
  const subtree = subtreeIds(folders, folder.id);
  const subCount = subtree.size - 1;

  const remove = async () => {
    const current = sp.get("folder");
    const leaving = !!current && subtree.has(current);
    const res = await exec(() => deleteFolder(folder.id), { success: count ? `Dossier supprimé · ${plural(count, "document")} désormais non classé${count > 1 ? "s" : ""}` : "Dossier supprimé", refresh: !leaving });
    if (!res.ok) return;
    close();
    // Le dossier affiché (ou l'un de ses parents) vient de disparaître : on remonte au parent.
    if (leaving) router.push(folderHref(folder.parent_id, paramsFrom(sp)));
  };

  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour le dossier ${folder.name}`} className={cn("shrink-0 text-muted hover:text-fg", className)} onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => setAction("new")}><FolderPlus />Nouveau sous-dossier</DropdownItem>
          <DropdownItem onSelect={() => setAction("rename")}><Pencil />Renommer</DropdownItem>
          <DropdownItem onSelect={() => setAction("move")}><FolderInput />Déplacer vers…</DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger onSelect={() => setAction("delete")}><Trash2 />Supprimer</DropdownItem>
        </DropdownContent>
      </Dropdown>

      {action === "new" ? <NewFolderDialog parentId={folder.id} parentName={folder.name} onClose={close} /> : null}
      {action === "rename" ? <RenameFolderDialog folder={folder} onClose={close} /> : null}
      {action === "move" ? (
        <MoveToDialog title="Déplacer le dossier" description={`« ${folder.name} » et son contenu.`} folders={folders} value={folder.parent_id} excludeIds={subtree}
          rootLabel="Racine" rootHint="dossier principal" pending={pending} onClose={close}
          onPick={async (parentId) => { await exec(() => updateFolder(folder.id, { parent_id: parentId }), { success: "Dossier déplacé", onSuccess: close }); }} />
      ) : null}
      <ConfirmDialog open={action === "delete"} onOpenChange={(o) => !o && close()} title={`Supprimer « ${folder.name} » ?`} confirmLabel="Supprimer le dossier" danger loading={pending}
        description={[
          subCount ? `${plural(subCount, "sous-dossier")} supprimé${subCount > 1 ? "s" : ""} avec lui.` : null,
          count ? `${plural(count, "document")} ne ${count > 1 ? "sont" : "est"} pas supprimé${count > 1 ? "s" : ""} : ${count > 1 ? "ils redeviennent" : "il redevient"} « Non classé${count > 1 ? "s" : ""} ».` : "Aucun document ne sera supprimé.",
        ].filter(Boolean).join(" ")}
        onConfirm={remove} />
    </>
  );
}
