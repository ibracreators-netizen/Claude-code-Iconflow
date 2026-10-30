"use client";
import * as React from "react";
import { Check, ExternalLink, Pencil, Send, ShieldCheck, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { addLivrableComment, transitionLivrable } from "@/lib/actions/livrables";
import { allowedLivrableTransition, LIVRABLE_STATUS, type Livrable, type LivrableComment, type LivrableStatus } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { EditLivrableDialog, type BriefOption } from "../livrables-client";

const FLOW: LivrableStatus[] = ["en_controle", "attente_client", "valide"];

function safeUrl(v: string | null) {
  if (!v) return null;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password ? u : null; } catch { return null; }
}

export function LivrablePreview({ url, title }: { url: string | null; title: string }) {
  const u = safeUrl(url);
  if (!u) return <Card><EmptyState icon={Video} title="Aucun fichier renseigné" description="Ajoute un lien HTTPS (Frame.io, Drive, .mp4) via « Modifier » pour afficher l'aperçu ici." /></Card>;
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u.pathname);
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video bg-black">
        {isVideo ? <video controls preload="metadata" className="size-full" src={u.href} /> : <iframe src={u.href} title={title} className="size-full" allow="fullscreen" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-muted">
        <span className="truncate font-mono">{u.hostname}{u.pathname.length > 1 ? u.pathname : ""}</span>
        <a href={u.href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 font-medium text-fg transition hover:text-accent-2">Ouvrir le lien <ExternalLink className="size-3.5" /></a>
      </div>
    </Card>
  );
}

export function LivrableStatusCard({ livrable }: { livrable: Livrable }) {
  const { exec, pending } = useAction();
  const [confirm, setConfirm] = React.useState(false);
  const canPropose = allowedLivrableTransition("agency", livrable, "attente_client");
  const step = FLOW.indexOf(livrable.status);
  const explain = livrable.status === "en_controle" ? "En contrôle agence · le client ne peut pas encore valider."
    : livrable.status === "attente_client" ? "Proposé au client · en attente de sa décision."
    : livrable.status === "correction" ? "Correction demandée par le client. Dépose une nouvelle version puis re-propose."
    : "Validé par le client.";
  return (
    <Card>
      <CardHeader title="Circuit de validation" description={explain} />
      <CardBody className="space-y-4">
        <ol className="space-y-1.5">
          {FLOW.map((s, i) => {
            const done = step > i && livrable.status !== "correction", current = step === i;
            return (
              <li key={s} className={cn("flex items-center gap-2.5 text-[13px]", done ? "text-muted" : current ? "font-medium text-fg" : "text-muted-2")}>
                <span className={cn("flex size-5 items-center justify-center rounded-full border text-[10px]", done ? "border-accent bg-accent text-accent-fg" : current ? "border-accent text-accent-2" : "border-border")}>{done ? <Check className="size-3" /> : i + 1}</span>
                {LIVRABLE_STATUS[s]}
              </li>
            );
          })}
          {livrable.status === "correction" ? <li className="flex items-center gap-2.5 text-[13px] font-medium text-danger"><span className="flex size-5 items-center justify-center rounded-full border border-danger text-[10px]">!</span>{LIVRABLE_STATUS.correction}</li> : null}
        </ol>
        {canPropose ? (
          <div className="border-t border-border pt-4">
            <Button className="w-full" loading={pending} onClick={() => setConfirm(true)}><ShieldCheck />Contrôle terminé · proposer au client</Button>
          </div>
        ) : null}
      </CardBody>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Proposer ce livrable au client ?" description={`${livrable.title} passera en attente de validation client. Le client pourra valider ou demander une correction.`} confirmLabel="Proposer au client" withComment commentLabel="Message pour le client (optionnel)" loading={pending}
        onConfirm={async (comment) => { await exec(() => transitionLivrable(livrable.id, "attente_client", comment), { success: "Livrable proposé au client.", onSuccess: () => setConfirm(false) }); }} />
    </Card>
  );
}

export function CommentsThread({ livrableId, comments, meId }: { livrableId: string; comments: Array<LivrableComment & { authorName: string }>; meId: string }) {
  const { exec, pending } = useAction();
  const [body, setBody] = React.useState("");
  const send = (e: React.FormEvent) => { e.preventDefault(); if (!body.trim()) return; exec(() => addLivrableComment(livrableId, body), { success: "Commentaire envoyé.", onSuccess: () => setBody("") }); };
  return (
    <div className="space-y-4">
      {comments.length ? (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className={cn("flex gap-3", c.author === meId && "flex-row-reverse text-right")}>
              <Avatar name={c.authorName} size={28} />
              <div className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13.5px]", c.author === meId ? "bg-accent-soft" : "bg-surface-2")}>
                <p className="whitespace-pre-wrap">{c.body}</p>
                <p className="mt-1 text-[11px] text-muted">{c.authorName} · {fmt.dateTime(c.created_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="text-[13px] text-muted">Aucun commentaire pour l&apos;instant.</p>}
      <form onSubmit={send} className="flex items-end gap-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Écrire un commentaire…" className="min-h-[44px]" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(e); }} />
        <Button type="submit" size="icon" loading={pending} aria-label="Envoyer"><Send /></Button>
      </form>
    </div>
  );
}

export function EditLivrableButton({ livrable, briefs }: { livrable: Livrable; briefs: BriefOption[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Pencil />Modifier</Button>
      {open ? <EditLivrableDialog livrable={livrable} briefs={briefs} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
