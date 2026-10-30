"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Archive, ArchiveRestore, ArrowLeft, Bold, Code2, Copy, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Minus, Printer, Quote, Redo2, SlidersHorizontal, Strikethrough, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { archiveDocument, createDocument, updateDocument } from "@/lib/actions/documents";
import { useAction } from "@/lib/hooks/use-action";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DOC_KIND, type DocKind, type Document } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";

const QUICK_ICONS = ["📄", "🎯", "📞", "🎬", "📘", "🧩", "🚀", "💶", "🧠", "✅", "📊", "✍️"];

function T({ on, label, icon: Icon, active }: { on: () => void; label: string; icon: typeof Bold; active?: boolean }) {
  return (
    <Tooltip label={label}><button type="button" onMouseDown={(e) => { e.preventDefault(); on(); }} className={cn("rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg", active && "bg-accent-soft text-fg")} aria-label={label} aria-pressed={active}><Icon className="size-4" /></button></Tooltip>
  );
}

export function DocumentEditor({ doc, clients, authorName }: { doc: Document; clients: Array<{ id: string; name: string }>; authorName: string | null }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [title, setTitle] = React.useState(doc.title);
  const [icon, setIcon] = React.useState(doc.icon);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [props, setProps] = React.useState(false);
  const [iconPick, setIconPick] = React.useState(false);
  const [words, setWords] = React.useState(0);
  const timer = React.useRef<number | undefined>(undefined);
  const archived = !!doc.archived_at;

  const persist = React.useCallback((patch: Partial<Pick<Document, "title" | "icon" | "content">>) => {
    window.clearTimeout(timer.current);
    setDirty(true);
    timer.current = window.setTimeout(() => {
      exec(() => updateDocument(doc.id, patch), { refresh: false, onSuccess: () => { setSavedAt(new Date()); setDirty(false); } });
    }, 1000);
  }, [doc.id, exec]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !archived,
    extensions: [StarterKit, Placeholder.configure({ placeholder: "Commence à écrire… Titres, listes, citations : tout est là." })],
    content: doc.content || "<p></p>",
    editorProps: { attributes: { class: "prose-editor", spellcheck: "true" } },
    onCreate: ({ editor }) => setWords(editor.getText().split(/\s+/).filter(Boolean).length),
    onUpdate: ({ editor }) => { setWords(editor.getText().split(/\s+/).filter(Boolean).length); persist({ content: editor.getHTML() }); },
  });

  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const setProp = (patch: Partial<Pick<Document, "kind" | "client_id" | "shared_with_client">>) => exec(() => updateDocument(doc.id, patch), { success: "Propriété mise à jour" });

  return (
    <div className="mx-auto max-w-[920px]">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        <Tooltip label="Retour aux documents"><Link href="/studio/documents" className="no-print mr-1 inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg" aria-label="Retour aux documents"><ArrowLeft className="size-4" /></Link></Tooltip>
        <Link href="/studio/documents" className="hover:text-fg">Documents</Link><span>/</span>
        {doc.client_id ? <><Link href={`/studio/clients/${doc.client_id}`} className="hover:text-fg">{clients.find((c) => c.id === doc.client_id)?.name ?? "Client"}</Link><span>/</span></> : <><span>Interne</span><span>/</span></>}
        <span className="truncate text-fg-2">{title || "Sans titre"}</span>
        <span className="ml-auto flex items-center gap-2">
          {archived ? <Badge tone="warning">Archivé</Badge> : null}
          <span className={cn("text-[12px]", dirty ? "text-warning" : "text-muted")}>{dirty || pending ? "Enregistrement…" : savedAt ? `Enregistré · ${fmt.relative(savedAt)}` : `Modifié ${fmt.relative(doc.updated_at)}`}</span>
          <Tooltip label="Imprimer / PDF"><Button variant="ghost" size="icon-sm" onClick={() => window.print()} className="no-print"><Printer /></Button></Tooltip>
          {!archived ? <Tooltip label="Supprimer (archiver)"><Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} className="no-print text-muted hover:text-danger" aria-label="Supprimer le document"><Trash2 /></Button></Tooltip> : null}
          <Button variant="secondary" size="sm" onClick={() => setProps(true)} className="no-print"><SlidersHorizontal />Propriétés</Button>
        </span>
      </div>

      <div className="relative">
        <button type="button" onClick={() => setIconPick((v) => !v)} className="mb-2 flex size-14 items-center justify-center rounded-xl text-4xl transition hover:bg-surface-2" aria-label="Changer l'icône">{icon}</button>
        {iconPick ? <div className="absolute z-10 mt-1 flex w-[300px] flex-wrap gap-1 rounded-lg border border-border bg-surface p-2 shadow-pop">{QUICK_ICONS.map((i) => <button key={i} type="button" onClick={() => { setIcon(i); setIconPick(false); persist({ icon: i }); }} className="flex size-9 items-center justify-center rounded-md text-xl hover:bg-surface-2">{i}</button>)}<input className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2 text-sm" placeholder="Ou colle un emoji" onChange={(e) => { const v = e.target.value.trim().slice(-2); if (v) { setIcon(v); persist({ icon: v }); } }} /></div> : null}
        <input value={title} readOnly={archived} onChange={(e) => { setTitle(e.target.value); persist({ title: e.target.value || "Sans titre" }); }} placeholder="Sans titre" className="w-full bg-transparent text-[36px] font-semibold tracking-[-0.025em] outline-none placeholder:text-muted-2" aria-label="Titre du document" />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          <Badge>{DOC_KIND[doc.kind]}</Badge>
          {doc.shared_with_client ? <Badge tone="accent">Partagé avec le client</Badge> : doc.client_id ? <Badge tone="outline">Privé agence</Badge> : null}
          <span>{words} mot{words > 1 ? "s" : ""}</span>
        </div>
      </div>

      {!archived && editor ? (
        <div className="no-print sticky top-16 z-20 mt-5 flex flex-wrap items-center gap-0.5 rounded-lg border border-border glass px-1.5 py-1">
          <T on={() => editor.chain().focus().toggleBold().run()} label="Gras" icon={Bold} active={editor.isActive("bold")} />
          <T on={() => editor.chain().focus().toggleItalic().run()} label="Italique" icon={Italic} active={editor.isActive("italic")} />
          <T on={() => editor.chain().focus().toggleStrike().run()} label="Barré" icon={Strikethrough} active={editor.isActive("strike")} />
          <span className="mx-1 h-5 w-px bg-border" />
          <T on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Titre 1" icon={Heading1} active={editor.isActive("heading", { level: 1 })} />
          <T on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Titre 2" icon={Heading2} active={editor.isActive("heading", { level: 2 })} />
          <T on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Titre 3" icon={Heading3} active={editor.isActive("heading", { level: 3 })} />
          <span className="mx-1 h-5 w-px bg-border" />
          <T on={() => editor.chain().focus().toggleBulletList().run()} label="Liste" icon={List} active={editor.isActive("bulletList")} />
          <T on={() => editor.chain().focus().toggleOrderedList().run()} label="Liste numérotée" icon={ListOrdered} active={editor.isActive("orderedList")} />
          <T on={() => editor.chain().focus().toggleBlockquote().run()} label="Citation" icon={Quote} active={editor.isActive("blockquote")} />
          <T on={() => editor.chain().focus().toggleCodeBlock().run()} label="Bloc de code" icon={Code2} active={editor.isActive("codeBlock")} />
          <T on={() => editor.chain().focus().setHorizontalRule().run()} label="Séparateur" icon={Minus} />
          <span className="mx-1 h-5 w-px bg-border" />
          <T on={() => editor.chain().focus().undo().run()} label="Annuler" icon={Undo2} />
          <T on={() => editor.chain().focus().redo().run()} label="Rétablir" icon={Redo2} />
        </div>
      ) : null}

      <div className="mt-6">
        {editor ? <EditorContent editor={editor} /> : <div className="skeleton h-40" />}
      </div>

      <Dialog open={props} onOpenChange={setProps}>
        <DialogContent title="Propriétés" description="Type, espace client et partage." side="right">
          <div className="grid gap-5">
            <Field label="Type"><NativeSelect value={doc.kind} onChange={(e) => setProp({ kind: e.target.value as DocKind })}>{(Object.keys(DOC_KIND) as DocKind[]).map((k) => <option key={k} value={k}>{DOC_KIND[k]}</option>)}</NativeSelect></Field>
            <Field label="Espace" hint="Un document interne n'est jamais visible du client."><NativeSelect value={doc.client_id ?? ""} onChange={(e) => setProp({ client_id: e.target.value || null, shared_with_client: e.target.value ? doc.shared_with_client : false })}><option value="">Interne agence</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div><p className="text-[13.5px] font-medium">Partagé avec le client</p><p className="text-[12px] text-muted">{doc.client_id ? "Visible dans son espace Documents." : "Choisis d'abord un client."}</p></div>
              <Switch checked={doc.shared_with_client} disabled={!doc.client_id || pending} onCheckedChange={(v) => setProp({ shared_with_client: v })} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
              <div><dt className="text-muted">Auteur</dt><dd className="font-medium">{authorName ?? "—"}</dd></div>
              <div><dt className="text-muted">Créé</dt><dd className="font-medium">{fmt.dateLong(doc.created_at)}</dd></div>
              <div><dt className="text-muted">Modifié</dt><dd className="font-medium">{fmt.dateTime(doc.updated_at)}</dd></div>
              <div><dt className="text-muted">Mots</dt><dd className="font-medium tabular">{words}</dd></div>
            </dl>
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => exec(() => createDocument({ title: `${title} (copie)`, icon, kind: doc.kind, client_id: doc.client_id, content: editor?.getHTML() ?? doc.content }), { success: "Document dupliqué", refresh: false, onSuccess: (d) => router.push(`/studio/documents/${d.id}`) })}><Copy />Dupliquer</Button>
              {archived ? <Button variant="secondary" onClick={() => exec(() => archiveDocument(doc.id, false), { success: "Document restauré" })}><ArchiveRestore />Restaurer</Button>
                : <Button variant="danger" onClick={() => exec(() => archiveDocument(doc.id, true), { success: "Document archivé", onSuccess: () => router.push("/studio/documents") })}><Archive />Archiver</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Supprimer ce document ?" description="Il est déplacé dans les archives et reste restaurable depuis ses propriétés." confirmLabel="Supprimer" danger loading={pending}
        onConfirm={async () => { await exec(() => archiveDocument(doc.id, true), { success: "Document supprimé (archivé).", onSuccess: () => router.push("/studio/documents") }); }} />
    </div>
  );
}
