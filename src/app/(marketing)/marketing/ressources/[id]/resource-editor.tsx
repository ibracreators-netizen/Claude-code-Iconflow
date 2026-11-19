"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Archive, Bold, Check, Heading2, Heading3, Italic, List, ListOrdered, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { archiveResourceAction, updateResourceAction } from "@/lib/actions/marketing-resources";
import { RESOURCE_KIND, RESOURCE_KINDS, type ResourceKind } from "@/lib/marketing/resources";
import { cn } from "@/lib/utils";
import { BTN_ICON, BTN_LIGHT, Pill, SELECT } from "../../reglages/kit";

/**
 * Lecture et écriture d'une ressource. Même éditeur et même format que les documents de Studio
 * (le contenu est stocké dans la même table). Lecture seule pour un commercial.
 */
export function ResourceEditor({ doc, canEdit }: { doc: { id: string; title: string; kind: string; content: string }; canEdit: boolean }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [title, setTitle] = React.useState(doc.title);
  const [state, setState] = React.useState<"idle" | "dirty" | "saved">("idle");
  const [confirm, setConfirm] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = React.useCallback((patch: { title?: string; content?: string; kind?: ResourceKind }) => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void exec(() => updateResourceAction(doc.id, patch), { refresh: false, onSuccess: () => setState("saved") }); }, 700);
  }, [doc.id, exec]);
  const editor = useEditor({
    immediatelyRender: false, editable: canEdit,
    extensions: [StarterKit, Placeholder.configure({ placeholder: "Écris ici le contenu de ce document." })],
    content: doc.content || "<p></p>",
    editorProps: { attributes: { class: "prose-editor", spellcheck: "true" } },
    onUpdate: ({ editor }) => { if (canEdit) save({ content: editor.getHTML() }); },
  });
  const tool = (label: string, active: boolean, run: () => void, icon: React.ReactNode) => (
    <Button type="button" size="icon-sm" variant="ghost" aria-label={label} aria-pressed={active} className={cn(BTN_ICON, active && "bg-accent-soft text-accent-2 hover:bg-accent-soft hover:text-accent-2")} onClick={run}>{icon}</Button>
  );
  return (
    <article className="mx-auto max-w-4xl lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:px-10 lg:py-8 lg:shadow-[var(--shadow-soft)]">
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        {canEdit
          ? <NativeSelect aria-label="Type de document" defaultValue={doc.kind} onChange={(e) => save({ kind: e.target.value as ResourceKind })} className={cn(SELECT, "h-10 w-40")}>{RESOURCE_KINDS.map((k) => <option key={k} value={k}>{RESOURCE_KIND[k]}</option>)}</NativeSelect>
          : <Pill>{RESOURCE_KIND[doc.kind as ResourceKind] ?? doc.kind}</Pill>}
        {canEdit
          ? <span className="inline-flex items-center gap-1 text-[13px] text-mk-sub" aria-live="polite">{state === "dirty" ? "Enregistrement…" : state === "saved" ? <><Check className="size-4 text-mk-success" aria-hidden />Enregistré</> : ""}</span>
          : <span className="text-[13px] text-mk-sub">Lecture seule</span>}
        {canEdit ? <Button size="sm" variant="outline" className={cn(BTN_LIGHT, "ml-auto")} onClick={() => setConfirm(true)}><Archive />Archiver</Button> : null}
      </div>
      {canEdit
        ? <input value={title} onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) save({ title: e.target.value }); }} maxLength={160} aria-label="Titre du document" className="mb-4 w-full bg-transparent text-[24px] font-semibold leading-tight tracking-[-0.01em] text-mk-strong outline-none placeholder:text-mk-sub lg:text-[28px]" placeholder="Sans titre" />
        : <h1 className="mb-4 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-mk-strong lg:text-[28px]">{doc.title}</h1>}
      {canEdit && editor ? (
        <div className="mb-4 flex flex-wrap items-center gap-0.5 rounded-[10px] border border-mk-line bg-surface p-1">
          {tool("Titre", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 />)}
          {tool("Sous-titre", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 />)}
          <span className="mx-1 h-5 w-px bg-mk-line" aria-hidden />
          {tool("Gras", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold />)}
          {tool("Italique", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic />)}
          <span className="mx-1 h-5 w-px bg-mk-line" aria-hidden />
          {tool("Liste à puces", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List />)}
          {tool("Liste numérotée", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered />)}
          {tool("Citation", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), <Quote />)}
        </div>
      ) : null}
      {editor ? (!canEdit && !doc.content.replace(/<[^>]+>/g, "").trim() ? <p className="text-[14px] text-mk-sub">Ce document est encore vide.</p> : <EditorContent editor={editor} className="text-[15px] text-mk-text" />) : <div className="skeleton h-40" />}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} loading={pending} danger title="Archiver ce document ?" description="Il disparaît des ressources de l'équipe. Les étapes d'onboarding qui y renvoient gardent leur intitulé, sans lien."
        confirmLabel="Archiver" onConfirm={() => { void exec(() => archiveResourceAction(doc.id), { success: "Document archivé.", refresh: false, onSuccess: () => router.push("/marketing/ressources") }); }} />
    </article>
  );
}
