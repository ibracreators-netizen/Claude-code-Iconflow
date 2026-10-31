"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FolderInput, FolderMinus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { moveDocument } from "@/lib/actions/documents";
import { useAction } from "@/lib/hooks/use-action";
import type { DocumentFolder } from "@/lib/data/types";
import { MoveToDialog } from "./folder-dialogs";

/** Menu ⋯ d'un document dans la bibliothèque : ouvrir, déplacer vers un dossier, retirer du dossier. */
export function DocumentMenu({ doc, folders }: { doc: { id: string; title: string; folder_id: string | null }; folders: DocumentFolder[] }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [move, setMove] = React.useState(false);
  const inFolder = !!doc.folder_id && folders.some((f) => f.id === doc.folder_id);
  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${doc.title}`} className="shrink-0 text-muted hover:text-fg"><MoreHorizontal /></Button></DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => router.push(`/studio/documents/${doc.id}`)}><ArrowUpRight />Ouvrir</DropdownItem>
          <DropdownItem onSelect={() => setMove(true)}><FolderInput />Déplacer vers…</DropdownItem>
          {inFolder ? <><DropdownSeparator /><DropdownItem onSelect={() => exec(() => moveDocument(doc.id, null), { success: "Document retiré du dossier" })}><FolderMinus />Retirer du dossier</DropdownItem></> : null}
        </DropdownContent>
      </Dropdown>
      {move ? (
        <MoveToDialog title="Déplacer le document" description={`« ${doc.title} »`} folders={folders} value={inFolder ? doc.folder_id : null} pending={pending} onClose={() => setMove(false)}
          onPick={async (folderId) => { await exec(() => moveDocument(doc.id, folderId), { success: folderId ? "Document déplacé" : "Document retiré du dossier", onSuccess: () => setMove(false) }); }} />
      ) : null}
    </>
  );
}
