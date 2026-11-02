"use client";
import * as React from "react";
import Image from "next/image";
import { Check, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { addAvatar, removeAvatar } from "@/lib/actions/avatars";
import type { Avatar as AvatarT } from "@/lib/data/types";
import { CastingShare } from "./casting-share";

/** Studio : proposer / retirer les avatars (casting) d'un client. Le client « retient » les siens dans son espace. */
export function AvatarsPanel({ clientId, avatars, castingLink }: { clientId: string; avatars: AvatarT[]; castingLink?: { id: string; token: string } | null }) {
  const [adding, setAdding] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<AvatarT | null>(null);
  const add = useAction();
  const del = useAction();
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add.exec(() => addAvatar(clientId, { name, preview_url: url || null }), {
      success: "Avatar proposé au client.",
      onSuccess: () => { setAdding(false); setName(""); setUrl(""); },
    });
  };

  return (
    <Card>
      <CardHeader
        title="Avatars proposés"
        description="Le casting que tu proposes au client. Il apparaît dans son espace « Avatars », où il retient ceux qui lui ressemblent."
        action={<div className="flex flex-wrap items-center gap-2"><CastingShare clientId={clientId} link={castingLink ?? null} /><Button size="sm" onClick={() => setAdding(true)}><Plus />Ajouter un avatar</Button></div>}
      />
      <CardBody>
        {avatars.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {avatars.map((a) => (
              <li key={a.id} className={`group card overflow-hidden transition ${a.chosen ? "ring-1 ring-accent/50" : ""}`}>
                <div className="relative aspect-[4/5] bg-surface-2">
                  {a.preview_url ? (
                    <Image src={a.preview_url} alt={`Portrait de ${a.name}`} fill unoptimized sizes="(max-width: 640px) 50vw, 20vw" className="object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>
                  )}
                  {a.chosen ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg shadow"><Check className="size-3" />Retenu</span>
                  ) : null}
                  <button onClick={() => setToDelete(a)} aria-label={`Retirer ${a.name}`} className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-bg/70 text-muted opacity-0 backdrop-blur transition hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"><Trash2 className="size-3.5" /></button>
                </div>
                <div className="p-3">
                  <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                  <p className="text-[11.5px] text-muted">{a.chosen ? "Retenu par le client" : "Proposé"}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={UserRound} title="Aucun avatar proposé" description="Ajoute des profils (visages) qui pourraient incarner la marque du client. Il les verra dans son espace et retiendra ceux qui lui conviennent."
            action={<Button size="sm" onClick={() => setAdding(true)}><Plus />Ajouter un avatar</Button>} />
        )}
      </CardBody>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent side="right" title="Ajouter un avatar" description="Un profil de casting proposé au client. Donne-lui un nom parlant et, si tu as une image, colle son lien.">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nom" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Femme 25-34 · lifestyle" maxLength={120} required /></Field>
            <Field label="Lien de l'image" hint="Lien HTTPS d'un portrait (facultatif). L'upload de fichiers pourra être ajouté plus tard.">
              <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
              <Button type="submit" loading={add.pending}>Proposer au client</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} danger title="Retirer cet avatar ?"
        description={toDelete ? `« ${toDelete.name} » sera retiré de l'espace du client. Action définitive.` : ""}
        confirmLabel="Retirer" loading={del.pending}
        onConfirm={async () => { if (toDelete) await del.exec(() => removeAvatar(toDelete.id, clientId), { success: "Avatar retiré.", onSuccess: () => setToDelete(null) }); }} />
    </Card>
  );
}
