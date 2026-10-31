"use client";
import * as React from "react";
import { Check, ExternalLink, Pencil, Send, ShieldCheck } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { addLivrableComment, transitionLivrable } from "@/lib/actions/livrables";
import { allowedLivrableTransition, LIVRABLE_STATUS, type Livrable, type LivrableComment, type LivrableStatus } from "@/lib/data/types";
import { batchLink } from "@/lib/batch";
import { cn, fmt } from "@/lib/utils";
import { EditLivrableDialog, type BriefOption } from "../livrables-client";

const FLOW: LivrableStatus[] = ["en_controle", "attente_client", "valide"];

/** Aperçu dans la page : vidéo directe ou cadre intégrable. Un lien Frame s'ouvre via le bandeau du batch. */
export function LivrablePreview({ url, title }: { url: string | null; title: string }) {
  const link = batchLink(url);
  if (!link || (!link.video && !link.embeddable)) return null;
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video bg-black">
        {link.video ? <video controls preload="metadata" className="size-full" src={link.href} /> : <iframe src={link.href} title={title} className="size-full" allow="fullscreen" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-muted">
        <span className="truncate font-mono">{link.display}</span>
        <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 font-medium text-fg transition hover:text-accent-2">{link.label} <ExternalLink className="size-3.5" /></a>
      </div>
    </Card>
  );
}

export function LivrableStatusCard({ livrable }: { livrable: Livrable }) {
  const { exec, pending } = useAction();
  const [confirm, setConfirm] = React.useState(false);
  const canPropose = allowedLivrableTransition("agency", livrable, "attente_client");
  const step = FLOW.indexOf(livrable.status);
  const explain = livrable.status === "en_controle" ? "En contrôle agence · le client voit le batch mais ne peut pas encore le valider."
    : livrable.status === "attente_client" ? "Proposé au client · il valide le batch entier ou demande des corrections."
    : livrable.status === "correction" ? "Corrections demandées par le client. Dépose la nouvelle version dans Frame, mets la liste à jour, puis re-propose."
    : "Batch validé par le client. Prêt à diffuser.";
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
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Proposer ce batch au client ?" description={`« ${livrable.title} » passera en attente de validation. Le client pourra valider le batch entier ou demander des corrections.`} confirmLabel="Proposer au client" withComment commentLabel="Message pour le client (optionnel)" loading={pending}
        onConfirm={async (comment) => { await exec(() => transitionLivrable(livrable.id, "attente_client", comment), { success: "Batch proposé au client.", onSuccess: () => setConfirm(false) }); }} />
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

export function EditLivrableButton({ livrable, briefs, label = "Modifier", variant = "secondary", size = "sm" }: { livrable: Livrable; briefs: BriefOption[]; label?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}><Pencil />{label}</Button>
      {open ? <EditLivrableDialog livrable={livrable} briefs={briefs} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
