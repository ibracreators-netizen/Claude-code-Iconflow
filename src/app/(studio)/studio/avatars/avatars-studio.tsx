"use client";
import * as React from "react";
import { Check, Plus, Trash2, UserRound } from "lucide-react";
import { ImageZoom } from "@/components/shared/image-zoom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ClientChip } from "@/components/shared/client-chip";
import { AvatarImageField, useAvatarImageSubmit, type AvatarImage } from "@/components/shared/avatar-image-field";
import { useAction } from "@/lib/hooks/use-action";
import { addAvatar, removeAvatar } from "@/lib/actions/avatars";
import type { Avatar as AvatarT } from "@/lib/data/types";

export type AvatarRow = AvatarT & { clientName: string };

/** Page Avatars (Production) : casting proposé à chaque client, avec sélecteur de client à l'ajout. */
export function AvatarsStudio({ clients, avatars, defaultClient, canUseFiles = true }: { clients: Array<{ id: string; name: string }>; avatars: AvatarRow[]; defaultClient?: string; canUseFiles?: boolean }) {
  const [adding, setAdding] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<AvatarRow | null>(null);
  const add = useAction();
  const del = useAction();
  const [clientId, setClientId] = React.useState(defaultClient || clients[0]?.id || "");
  const [name, setName] = React.useState("");
  const [image, setImage] = React.useState<AvatarImage>({ kind: "none" });
  const prepareImage = useAvatarImageSubmit();

  const open = () => { setClientId(defaultClient || clients[0]?.id || ""); setName(""); setImage({ kind: "none" }); setAdding(true); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    add.exec(async () => {
      if (!name.trim()) return { ok: false as const, error: "Donne un nom à l'avatar (ex. « Femme 25-34 · lifestyle »)." };
      try { return await addAvatar(clientId, { name, ...(await prepareImage(clientId, image)) }); }
      catch (err) { return { ok: false as const, error: (err as Error).message || "Envoi de l'image impossible." }; }
    }, { success: "Avatar proposé au client.", onSuccess: () => setAdding(false) });
  };

  return (
    <>
      <div className="mb-4"><Button size="sm" onClick={open} disabled={!clients.length}><Plus />Ajouter un avatar</Button></div>

      {avatars.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {avatars.map((a) => (
            <li key={a.id} className={`group card overflow-hidden transition ${a.chosen ? "ring-1 ring-accent/50" : ""}`}>
              <div className="relative aspect-[4/5] bg-surface-2">
                {a.preview_url ? (
                  <ImageZoom src={a.preview_url} alt={`Portrait de ${a.name}`} sizes="(max-width: 640px) 50vw, 20vw" thumbClassName="object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>
                )}
                {a.chosen ? (
                  <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg shadow"><Check className="size-3" />Retenu</span>
                ) : null}
                <button onClick={() => setToDelete(a)} aria-label={`Retirer ${a.name}`} className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-bg/70 text-muted opacity-0 backdrop-blur transition hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"><Trash2 className="size-3.5" /></button>
              </div>
              <div className="space-y-1.5 p-3">
                <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                <ClientChip name={a.clientName} href={`/studio/clients/${a.client_id}`} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card"><EmptyState icon={UserRound} title="Aucun avatar proposé" description="Ajoute des profils (visages) à proposer à un client. Il les verra dans son espace et retiendra ceux qui lui conviennent."
          action={<Button size="sm" onClick={open} disabled={!clients.length}><Plus />Ajouter un avatar</Button>} /></div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent side="right" title="Ajouter un avatar" description="Un profil de casting proposé à un client. Choisis le client, donne un nom et ajoute son portrait : importé, pris dans le dossier Avatars de ses fichiers, ou par lien.">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Client" required>
              <NativeSelect value={clientId} onChange={(e) => { setClientId(e.target.value); setImage((img) => (img.kind === "file" ? { kind: "none" } : img)); }} required>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Nom" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Femme 25-34 · lifestyle" maxLength={120} required /></Field>
            {clientId ? <AvatarImageField clientId={clientId} value={image} onChange={setImage} onSuggestName={(n) => setName((cur) => cur || n)} canUseFiles={canUseFiles} /> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
              <Button type="submit" loading={add.pending} disabled={!clientId}>Proposer au client</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} danger title="Retirer cet avatar ?"
        description={toDelete ? `« ${toDelete.name} » sera retiré de l'espace de ${toDelete.clientName}. Action définitive.` : ""}
        confirmLabel="Retirer" loading={del.pending}
        onConfirm={async () => { if (toDelete) await del.exec(() => removeAvatar(toDelete.id, toDelete.client_id), { success: "Avatar retiré.", onSuccess: () => setToDelete(null) }); }} />
    </>
  );
}
