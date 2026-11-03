"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createIaPlan } from "@/lib/actions/ia";

/** Création d'un dossier IA (= un brief) : client + nom. On y ajoute ensuite autant de concepts qu'on veut. */
export function NewIaPlanDialog({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [clientId, setClientId] = React.useState(clients[0]?.id ?? "");
  const [title, setTitle] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => createIaPlan({ client_id: clientId, title }), {
      success: "Dossier créé.", refresh: false,
      onSuccess: (p) => { setOpen(false); setTitle(""); router.push(`/studio/ia/${p.id}`); },
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!clients.length}><Plus />Nouveau dossier</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" title="Nouveau dossier IA" description="Un dossier par campagne (comme un brief). À l'intérieur, tu ajoutes autant de concepts que tu veux — chaque concept a son code stable (V01, V02…).">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Client" required>
              <NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Nom du dossier" required><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. Lancement sérum — novembre" required /></Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" loading={pending} disabled={!clientId}>Créer le dossier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
