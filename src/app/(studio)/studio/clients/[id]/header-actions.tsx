"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, BookOpenText, FileText, MessageSquare, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { HEALTH, SEGMENTS, type Client, type ClientHealth, type ClientSegment } from "@/lib/data/types";
import { useAction } from "@/lib/hooks/use-action";
import { archiveClient, updateClient } from "@/lib/actions/clients";

export function ClientHeaderActions({ client }: { client: Client }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [edit, setEdit] = useState(false);
  const [archive, setArchive] = useState(false);
  const archived = client.status === "archived";

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => Number(String(f.get(k) ?? "0").replace(",", ".")) || 0;
    const res = await exec(() => updateClient(client.id, {
      name: String(f.get("name") ?? "").trim() || client.name, sector: String(f.get("sector") ?? "").trim() || null, segment: f.get("segment") as ClientSegment, health: f.get("health") as ClientHealth,
      website: String(f.get("website") ?? "").trim() || null, city: String(f.get("city") ?? "").trim() || null, contact_email: String(f.get("contact_email") ?? "").trim() || null,
      monthly_budget: num("monthly_budget"), retainer: num("retainer"), performance_fee_pct: num("performance_fee_pct"), current_step: Math.min(5, Math.max(1, num("current_step") || 1)),
      tags: String(f.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    }), { success: "Fiche client mise à jour" });
    if (res.ok) setEdit(false);
  }

  return (
    <>
      <Link href={`/studio/messages?client=${client.id}`} className="inline-flex h-9 items-center gap-2 rounded-md bg-surface-2 px-3.5 text-sm font-medium hairline transition hover:bg-surface-3"><MessageSquare className="size-4" />Messagerie</Link>
      <Link href={`/studio/briefs?new=1&client=${client.id}`} className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition hover:bg-accent-2"><FileText className="size-4" />Nouveau brief</Link>
      <Dropdown>
        <DropdownTrigger asChild><Button variant="secondary" size="icon" aria-label="Plus d'actions"><MoreHorizontal /></Button></DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => setEdit(true)}><Pencil />Modifier la fiche</DropdownItem>
          <DropdownItem asChild><Link href={`/studio/documents?new=1&client=${client.id}`}><BookOpenText />Nouveau document</Link></DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger={!archived} onSelect={() => setArchive(true)}>{archived ? <><ArchiveRestore />Restaurer le client</> : <><Archive />Archiver le client</>}</DropdownItem>
        </DropdownContent>
      </Dropdown>

      <ConfirmDialog open={archive} onOpenChange={setArchive} title={archived ? "Restaurer ce client ?" : "Archiver ce client ?"} danger={!archived} loading={pending}
        description={archived ? "Le client redevient actif et réapparaît dans le pipeline." : "Le client disparaît des listes actives. Ses données, briefs et fichiers sont conservés. Aucun accès n'est modifié."}
        confirmLabel={archived ? "Restaurer" : "Archiver"} onConfirm={async () => { const r = await exec(() => archiveClient(client.id, !archived), { success: archived ? "Client restauré" : "Client archivé" }); if (r.ok) { setArchive(false); router.refresh(); } }} />

      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent title="Modifier la fiche" description="Informations commerciales et contrat.">
          <form onSubmit={onSave} className="space-y-4">
            <Field label="Nom" required><Input name="name" defaultValue={client.name} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Segment"><NativeSelect name="segment" defaultValue={client.segment}>{Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
              <Field label="Santé"><NativeSelect name="health" defaultValue={client.health}>{Object.entries(HEALTH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
              <Field label="Secteur"><Input name="sector" defaultValue={client.sector ?? ""} /></Field>
              <Field label="Ville"><Input name="city" defaultValue={client.city ?? ""} /></Field>
              <Field label="Email de contact"><Input name="contact_email" type="email" defaultValue={client.contact_email ?? ""} /></Field>
              <Field label="Site web"><Input name="website" type="url" defaultValue={client.website ?? ""} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Budget ads / mois (€)"><Input name="monthly_budget" type="number" min={0} step={100} defaultValue={client.monthly_budget} /></Field>
              <Field label="Retainer (€)"><Input name="retainer" type="number" min={0} step={50} defaultValue={client.retainer} /></Field>
              <Field label="Fee performance (%)"><Input name="performance_fee_pct" type="number" min={0} max={100} step={0.5} defaultValue={client.performance_fee_pct} /></Field>
              <Field label="Étape onboarding (1-5)"><Input name="current_step" type="number" min={1} max={5} defaultValue={client.current_step} /></Field>
            </div>
            <Field label="Tags" hint="Séparés par des virgules"><Input name="tags" defaultValue={client.tags.join(", ")} placeholder="beauté, scaling, meta" /></Field>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setEdit(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
