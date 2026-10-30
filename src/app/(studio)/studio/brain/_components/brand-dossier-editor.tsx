"use client";
import * as React from "react";
import { Pencil, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveBrandDossier } from "@/lib/actions/brain";
import { useAction } from "@/lib/hooks/use-action";
import type { BrandDossier, BrandDossierData } from "@/lib/data/types";
import { fmt } from "@/lib/utils";

type Persona = { nom: string; resume: string };

export function BrandDossierEditor({ clientId, clientName, dossier }: { clientId: string; clientName: string; dossier: BrandDossier | null }) {
  const data = React.useMemo<BrandDossierData>(() => dossier?.data ?? {}, [dossier]);
  const [editing, setEditing] = React.useState(false);
  const [promesse, setPromesse] = React.useState(data.promesse ?? "");
  const [ton, setTon] = React.useState(data.ton ?? "");
  const [personas, setPersonas] = React.useState<Persona[]>(Array.isArray(data.personas) ? data.personas : []);
  const [concurrents, setConcurrents] = React.useState<string[]>(Array.isArray(data.concurrents) ? data.concurrents : []);
  const [tag, setTag] = React.useState("");
  const { exec, pending } = useAction();

  const reset = () => { setPromesse(data.promesse ?? ""); setTon(data.ton ?? ""); setPersonas(Array.isArray(data.personas) ? data.personas : []); setConcurrents(Array.isArray(data.concurrents) ? data.concurrents : []); };
  const save = () => exec(() => saveBrandDossier(clientId, { ...data, promesse, ton, personas: personas.filter((p) => p.nom.trim()), concurrents }), { success: "Dossier de marque enregistré", onSuccess: () => setEditing(false) });
  const addTag = () => { const t = tag.trim(); if (t && !concurrents.includes(t)) setConcurrents([...concurrents, t]); setTag(""); };
  const empty = !data.promesse && !data.ton && !personas.length && !concurrents.length;

  return (
    <Card className="animate-rise">
      <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent-2" />Dossier de marque</span>}
        description={dossier ? `Mis à jour ${fmt.relative(dossier.updated_at)}` : `Le socle du Brain de ${clientName} : promesse, personas, ton, concurrents.`}
        action={editing ? (
          <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => { reset(); setEditing(false); }}><X />Annuler</Button><Button size="sm" loading={pending} onClick={save}><Save />Enregistrer</Button></div>
        ) : <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil />{empty ? "Compléter" : "Modifier"}</Button>} />
      <CardBody>
        {editing ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Field label="Promesse" hint="Une phrase. Le bénéfice principal, concret." className="lg:col-span-2"><Textarea rows={2} value={promesse} onChange={(e) => setPromesse(e.target.value)} placeholder="Des extensions de cils salon à la maison, 6 semaines de tenue…" /></Field>
            <Field label="Ton de la marque"><Textarea rows={3} value={ton} onChange={(e) => setTon(e.target.value)} placeholder="Complice, direct, sans jargon…" /></Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Concurrents</span>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-surface p-2">
                {concurrents.map((c) => <Badge key={c} tone="neutral" className="pr-1">{c}<button type="button" onClick={() => setConcurrents(concurrents.filter((x) => x !== c))} className="ml-0.5 rounded-full p-0.5 hover:bg-surface-3" aria-label={`Retirer ${c}`}><X className="size-3" /></button></Badge>)}
                <input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} onBlur={addTag} placeholder="Ajouter + Entrée" className="min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-2" />
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-medium text-fg-2">Personas</span><Button variant="ghost" size="sm" onClick={() => setPersonas([...personas, { nom: "", resume: "" }])}><Plus />Ajouter un persona</Button></div>
              <div className="grid gap-3 md:grid-cols-2">
                {personas.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border bg-surface-2/50 p-3">
                    <div className="flex gap-2"><Input value={p.nom} onChange={(e) => setPersonas(personas.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))} placeholder="Camille, 29 ans, cadre pressée" /><Button variant="ghost" size="icon" onClick={() => setPersonas(personas.filter((_, j) => j !== i))} aria-label="Supprimer"><Trash2 /></Button></div>
                    <Textarea className="mt-2" rows={2} value={p.resume} onChange={(e) => setPersonas(personas.map((x, j) => j === i ? { ...x, resume: e.target.value } : x))} placeholder="Ce qu'il veut, ce qui le freine, où il achète." />
                  </div>
                ))}
                {!personas.length ? <p className="text-[13px] text-muted">Aucun persona. Ajoute au moins la cible principale.</p> : null}
              </div>
            </div>
          </div>
        ) : empty ? (
          <p className="text-[13.5px] text-muted">Le dossier est vide. Renseigne la promesse, le ton, les personas et les concurrents : c&apos;est la base de chaque script.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Promesse</p><p className="mt-1.5 text-[17px] font-medium leading-snug tracking-tight text-balance">{data.promesse || <span className="text-muted">Non renseignée</span>}</p></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Ton de la marque</p><p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{data.ton || <span className="text-muted">Non renseigné</span>}</p></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Concurrents</p><div className="mt-1.5 flex flex-wrap gap-1.5">{concurrents.length ? concurrents.map((c) => <Badge key={c}>{c}</Badge>) : <span className="text-[13px] text-muted">Aucun</span>}</div></div>
            <div className="lg:col-span-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Personas</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">{personas.length ? personas.map((p, i) => <div key={i} className="rounded-lg border border-border bg-surface-2/50 p-3"><p className="text-[13.5px] font-semibold">{p.nom}</p><p className="mt-1 text-[13px] text-muted">{p.resume}</p></div>) : <span className="text-[13px] text-muted">Aucun persona</span>}</div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
