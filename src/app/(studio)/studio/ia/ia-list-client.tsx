"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createIaPlan } from "@/lib/actions/ia";

/** Création d'un plan IA : client, code stable (V01…) et titre, puis ouverture du plan. */
export function NewIaPlanDialog({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [clientId, setClientId] = React.useState(clients[0]?.id ?? "");
  const [code, setCode] = React.useState("V01");
  const [title, setTitle] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => createIaPlan({ client_id: clientId, code, title }), {
      success: "Plan IA créé.", refresh: false,
      onSuccess: (p) => { setOpen(false); setTitle(""); router.push(`/studio/ia/${p.id}`); },
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!clients.length}><Plus />Nouveau plan</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" title="Nouveau plan IA" description="Un plan de production par concept. Le code (V01…) sert d'identifiant stable pour les parties (V01-P1, V01-P2…).">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Client" required>
              <NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Field label="Code" hint="V01, V02…"><Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={16} placeholder="V01" /></Field>
              <Field label="Titre du concept" required><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. Routine du soir" required /></Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" loading={pending} disabled={!clientId}>Créer le plan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
