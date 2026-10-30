"use client";
import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { saveBrandDossier } from "@/lib/actions/portal";
import type { BrandDossierData } from "@/lib/data/types";

type Persona = { nom: string; resume: string };

export function BrainEditor({ clientId, initial }: { clientId: string; initial: BrandDossierData; updatedAt: string | null }) {
  const [editing, setEditing] = React.useState(false);
  const [promesse, setPromesse] = React.useState(initial.promesse ?? "");
  const [ton, setTon] = React.useState(initial.ton ?? "");
  const [personas, setPersonas] = React.useState<Persona[]>(initial.personas?.length ? initial.personas : []);
  const [concurrents, setConcurrents] = React.useState((initial.concurrents ?? []).join("\n"));
  const { exec, pending } = useAction();
  const empty = !initial.promesse && !initial.ton && !initial.personas?.length && !initial.concurrents?.length;

  const save = () => exec(() => saveBrandDossier(clientId, { ...initial, promesse: promesse.trim(), ton: ton.trim(), personas: personas.filter((p) => p.nom.trim() || p.resume.trim()), concurrents: concurrents.split("\n").map((s) => s.trim()).filter(Boolean) }), { success: "Brain mis à jour. Merci !", onSuccess: () => setEditing(false) });

  if (editing) {
    return (
      <form className="card space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2 className="text-[15px] font-semibold tracking-tight">Compléter mon Brain</h2>
        <Field label="Votre promesse" hint="En une phrase : ce que votre produit change pour vos clients."><Textarea value={promesse} onChange={(e) => setPromesse(e.target.value)} rows={2} placeholder="Ex. Des extensions de cils salon à la maison, 6 semaines de tenue." /></Field>
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-medium text-fg-2">Vos clients types (personas)</span><Button type="button" size="sm" variant="ghost" onClick={() => setPersonas([...personas, { nom: "", resume: "" }])}><Plus />Ajouter</Button></div>
          <div className="space-y-3">
            {personas.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-[1fr_2fr_auto]">
                <Input value={p.nom} placeholder="Ex. Camille, 29 ans, cadre pressée" onChange={(e) => setPersonas(personas.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
                <Input value={p.resume} placeholder="Ce qu'elle cherche, ce qui la freine" onChange={(e) => setPersonas(personas.map((x, j) => (j === i ? { ...x, resume: e.target.value } : x)))} />
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Retirer" onClick={() => setPersonas(personas.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            {!personas.length ? <p className="text-[12.5px] text-muted">Ajoutez au moins un persona : c&apos;est la base des angles.</p> : null}
          </div>
        </div>
        <Field label="Ton de la marque" hint="Comment vous parlez à vos clients : complice, expert, direct…"><Textarea value={ton} onChange={(e) => setTon(e.target.value)} rows={2} /></Field>
        <Field label="Concurrents" hint="Un par ligne."><Textarea value={concurrents} onChange={(e) => setConcurrents(e.target.value)} rows={3} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button><Button type="submit" loading={pending}>Enregistrer</Button></div>
      </form>
    );
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Votre dossier de marque</h2>
        <Button size="sm" variant={empty ? "primary" : "secondary"} onClick={() => setEditing(true)}><Pencil />{empty ? "Compléter mon Brain" : "Modifier"}</Button>
      </div>
      {empty ? <p className="text-[13.5px] text-muted">Votre Brain est encore vide. Quelques minutes suffisent pour poser la promesse, vos clients types et votre ton : l&apos;équipe s&apos;appuie dessus pour chaque script.</p> : (
        <dl className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2"><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Promesse</dt><dd className="mt-1 text-[16px] font-medium leading-snug tracking-tight">{initial.promesse || <span className="text-muted-2">Non renseignée</span>}</dd></div>
          <div><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Personas</dt><dd className="mt-1 space-y-2">{initial.personas?.length ? initial.personas.map((p, i) => <div key={i} className="rounded-lg bg-surface-2 p-3"><p className="text-[13.5px] font-medium">{p.nom}</p><p className="text-[12.5px] text-muted">{p.resume}</p></div>) : <span className="text-[13px] text-muted-2">Non renseignés</span>}</dd></div>
          <div className="space-y-5">
            <div><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Ton de la marque</dt><dd className="mt-1 text-[13.5px] text-fg-2">{initial.ton || <span className="text-muted-2">Non renseigné</span>}</dd></div>
            <div><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Concurrents</dt><dd className="mt-1 flex flex-wrap gap-1.5">{initial.concurrents?.length ? initial.concurrents.map((c) => <span key={c} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px]">{c}</span>) : <span className="text-[13px] text-muted-2">Non renseignés</span>}</dd></div>
          </div>
        </dl>
      )}
    </section>
  );
}
