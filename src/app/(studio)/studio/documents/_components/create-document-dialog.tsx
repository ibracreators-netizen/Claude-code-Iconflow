"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { createDocument } from "@/lib/actions/documents";
import { useAction } from "@/lib/hooks/use-action";
import { DOC_KIND, type DocKind, type Document } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const QUICK_ICONS = ["📄", "🎯", "📞", "🎬", "📘", "🧩", "🚀", "💶", "🧠", "✅", "📊", "✍️"];

export function CreateDocumentDialog({ clients, templates, defaultClient, autoOpen }: { clients: Array<{ id: string; name: string }>; templates: Pick<Document, "id" | "title" | "icon" | "content">[]; defaultClient?: string; autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(!!autoOpen);
  const [title, setTitle] = React.useState("");
  const [icon, setIcon] = React.useState("📄");
  const [kind, setKind] = React.useState<DocKind>("doc");
  const [client, setClient] = React.useState(defaultClient && defaultClient !== "interne" ? defaultClient : "");
  const [template, setTemplate] = React.useState("");
  const { exec, pending } = useAction();
  const close = (o: boolean) => { setOpen(o); if (!o && autoOpen) router.replace("/studio/documents"); };
  const submit = () => {
    const tpl = templates.find((t) => t.id === template);
    exec(() => createDocument({ title: title.trim() || "Sans titre", icon, kind, client_id: client || null, content: tpl?.content ?? "" }), {
      success: "Document créé", refresh: false, onSuccess: (d) => router.push(`/studio/documents/${d.id}`),
    });
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Nouveau document</Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent title="Nouveau document" description="Stratégie, compte-rendu, brief, SOP… tout vit ici, plus besoin de Notion ou Docs.">
          <div className="grid gap-4">
            <div className="flex gap-3">
              <div className="shrink-0">
                <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Icône</span>
                <Input value={icon} onChange={(e) => setIcon(e.target.value.slice(-2))} className="w-14 text-center text-lg" aria-label="Icône" />
              </div>
              <Field label="Titre" className="flex-1" required><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Stratégie Q4 · Lashéa" onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
            </div>
            <div className="flex flex-wrap gap-1">{QUICK_ICONS.map((i) => <button key={i} type="button" onClick={() => setIcon(i)} className={cn("flex size-8 items-center justify-center rounded-md text-base transition hover:bg-surface-2", icon === i && "bg-accent-soft ring-1 ring-accent/40")}>{i}</button>)}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type"><NativeSelect value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>{(Object.keys(DOC_KIND) as DocKind[]).map((k) => <option key={k} value={k}>{DOC_KIND[k]}</option>)}</NativeSelect></Field>
              <Field label="Client"><NativeSelect value={client} onChange={(e) => setClient(e.target.value)}><option value="">Interne agence</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            </div>
            {templates.length ? <Field label="Partir d'un template" hint="Le contenu du template est copié dans le nouveau document."><NativeSelect value={template} onChange={(e) => setTemplate(e.target.value)}><option value="">Page vierge</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.title}</option>)}</NativeSelect></Field> : null}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => close(false)}>Annuler</Button><Button loading={pending} onClick={submit}>Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
