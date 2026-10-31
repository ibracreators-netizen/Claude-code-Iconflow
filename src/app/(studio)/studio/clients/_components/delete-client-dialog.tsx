"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { deleteClient } from "@/lib/actions/clients";

/**
 * Suppression définitive d'un client (administrateur à accès complet) : confirmation forte, le nom du client est retapé.
 * `redirectTo` : page ouverte après la suppression (depuis la fiche → liste des clients) ; sinon la page courante est rafraîchie.
 */
export function DeleteClientDialog({ client, open, onOpenChange, onDeleted, redirectTo }: {
  client: { id: string; name: string } | null; open: boolean; onOpenChange: (open: boolean) => void; onDeleted?: (id: string) => void; redirectTo?: string;
}) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [typed, setTyped] = useState("");
  const normalize = (s: string) => s.trim().toLocaleLowerCase("fr");
  const match = !!client && normalize(typed) === normalize(client.name);

  async function confirm() {
    if (!client || !match) return;
    const res = await exec(() => deleteClient(client.id), { success: `${client.name} a été supprimé définitivement`, refresh: !redirectTo });
    if (!res.ok) return;
    setTyped(""); onOpenChange(false); onDeleted?.(client.id);
    if (redirectTo) router.push(redirectTo);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setTyped(""); onOpenChange(o); }}>
      <DialogContent title="Supprimer définitivement ce client ?" description="Aucun retour en arrière possible. Pour le mettre de côté sans rien perdre, utilise plutôt « Archiver ».">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
          <div className="flex gap-3 rounded-lg border border-danger/30 bg-danger/8 px-3.5 py-3 text-[13px] text-fg-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <p>Toutes les données de <span className="font-semibold text-fg">{client?.name}</span> disparaissent : suivi, contacts, briefs, livrables, documents, fichiers, factures, messages et Brain. Ses comptes perdent l&apos;accès à l&apos;espace client.</p>
          </div>
          <Field label="Tape le nom du client pour confirmer" hint={client ? `À saisir : ${client.name}` : undefined}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={client?.name ?? ""} autoFocus autoComplete="off" spellCheck={false} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" variant="danger" disabled={!match} loading={pending}><Trash2 />Supprimer définitivement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
