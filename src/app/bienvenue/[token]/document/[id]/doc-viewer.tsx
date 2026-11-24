"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/** Liens du document : https seulement (tout autre lien reste du texte). */
const httpsOnly = (url: string) => /^https:\/\/[^\s]+$/i.test(url);

/**
 * Contenu d'une ressource en lecture seule : même éditeur et même rendu que la page Ressources (le schéma de l'éditeur
 * ne garde que ses blocs connus : aucun script, aucune image distante). Les liens s'ouvrent dans un nouvel onglet,
 * sans transmettre l'adresse du lien d'onboarding (noopener, noreferrer).
 */
export function DocViewer({ content }: { content: string }) {
  const editor = useEditor({
    immediatelyRender: false, editable: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: (url) => httpsOnly(url), HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" } } })],
    content,
    editorProps: { attributes: { class: "prose-editor !min-h-0", "aria-label": "Contenu du document" } },
  });
  return editor ? <EditorContent editor={editor} className="text-[16px] text-mk-text lg:text-[15px]" /> : <div className="skeleton h-40" />;
}
