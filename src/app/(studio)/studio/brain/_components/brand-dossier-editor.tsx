"use client";
import * as React from "react";
import { Check, Images, Pencil, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveBrandDossier } from "@/lib/actions/brain";
import { applyImportProposal, dismissImportProposal, removeDossierImage } from "@/lib/actions/brain-import";
import { dossierImages, dossierProposal, hostOf, type DossierImage, type ImportProposal } from "@/lib/brain/dossier-extras";
import { useAction } from "@/lib/hooks/use-action";
import type { BrandDossier, BrandDossierData } from "@/lib/data/types";
import { fmt } from "@/lib/utils";

type Persona = { nom: string; resume: string };

export function BrandDossierEditor({ clientId, clientName, dossier }: { clientId: string; clientName: string; dossier: BrandDossier | null }) {
  const data = React.useMemo<BrandDossierData>(() => dossier?.data ?? {}, [dossier]);
  const proposal = React.useMemo(() => dossierProposal(data), [data]);
  const images = React.useMemo(() => dossierImages(data), [data]);
  const [editing, setEditing] = React.useState(false);
  const [promesse, setPromesse] = React.useState(data.promesse ?? "");
  const [ton, setTon] = React.useState(data.ton ?? "");
  const [personas, setPersonas] = React.useState<Persona[]>(Array.isArray(data.personas) ? data.personas : []);
  const [concurrents, setConcurrents] = React.useState<string[]>(Array.isArray(data.concurrents) ? data.concurrents : []);
  const [tag, setTag] = React.useState("");
  const { exec, pending } = useAction();

  const reset = () => { setPromesse(data.promesse ?? ""); setTon(data.ton ?? ""); setPersonas(Array.isArray(data.personas) ? data.personas : []); setConcurrents(Array.isArray(data.concurrents) ? data.concurrents : []); };
  // Les données annexes (galerie, proposition d'import) sont conservées telles quelles par l'étalement de `data`.
  const save = () => exec(() => saveBrandDossier(clientId, { ...data, promesse, ton, personas: personas.filter((p) => p.nom.trim()), concurrents }), { success: "Dossier de marque enregistré", onSuccess: () => setEditing(false) });
  const addTag = () => { const t = tag.trim(); if (t && !concurrents.includes(t)) setConcurrents([...concurrents, t]); setTag(""); };
  const empty = !data.promesse && !data.ton && !personas.length && !concurrents.length;

  return (
    <Card className="animate-rise scroll-mt-20" id="dossier">
      <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent-2" />Dossier de marque</span>}
        description={dossier ? <span suppressHydrationWarning>{`Mis à jour ${fmt.relative(dossier.updated_at)}`}</span> : `Le socle du Brain de ${clientName} : promesse, personas, ton, concurrents.`}
        action={editing ? (
          <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => { reset(); setEditing(false); }}><X />Annuler</Button><Button size="sm" loading={pending} onClick={save}><Save />Enregistrer</Button></div>
        ) : <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil />{empty ? "Compléter" : "Modifier"}</Button>} />
      <CardBody>
        {!editing && proposal ? <ProposalBanner clientId={clientId} proposal={proposal} /> : null}
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
          <p className="text-[13.5px] text-muted">Le dossier est vide. Renseigne la promesse, le ton, les personas et les concurrents : c&apos;est la base de chaque script.{images.length ? "" : " Tu peux aussi l'importer depuis le site de la marque, juste au-dessus."}</p>
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
        {!editing && images.length ? <Gallery clientId={clientId} images={images} /> : null}
      </CardBody>
    </Card>
  );
}

/** Proposition issue d'un import de site : aperçu, puis « Appliquer » (un clic) ou « Ignorer ». */
function ProposalBanner({ clientId, proposal }: { clientId: string; proposal: ImportProposal }) {
  const { exec, pending } = useAction();
  return (
    <div className="mb-5 rounded-xl border border-accent/30 bg-accent-soft/60 p-4" role="region" aria-label="Proposition de dossier">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold"><Sparkles className="size-4 shrink-0 text-accent-2" />Proposition issue du site {hostOf(proposal.url)}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">{proposal.mode === "ia" ? "Structurée par IA" : "Lecture simple du site"}{proposal.created_at ? ` · ${fmt.dateTime(proposal.created_at)}` : ""} · En l&apos;appliquant, la promesse et le ton remplacent les actuels ; personas et concurrents s&apos;ajoutent.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => exec(() => dismissImportProposal(clientId), { success: "Proposition ignorée" })}>Ignorer</Button>
          <Button size="sm" loading={pending} onClick={() => exec(() => applyImportProposal(clientId), { success: "Dossier de marque mis à jour" })}><Check />Appliquer au dossier</Button>
        </div>
      </div>
      <dl className="mt-3 grid gap-3 text-[13px] md:grid-cols-2">
        <div className="md:col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Promesse</dt><dd className="mt-1 font-medium leading-snug">{proposal.promesse || <span className="text-muted">—</span>}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Ton</dt><dd className="mt-1 text-fg-2">{proposal.ton || <span className="text-muted">—</span>}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Concurrents</dt><dd className="mt-1 flex flex-wrap gap-1.5">{proposal.concurrents.length ? proposal.concurrents.map((c) => <Badge key={c} tone="outline">{c}</Badge>) : <span className="text-muted">Aucun cité</span>}</dd></div>
        <div className="md:col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Personas</dt>
          <dd className="mt-1 grid gap-2 md:grid-cols-2">{proposal.personas.length ? proposal.personas.map((p, i) => <div key={i} className="rounded-lg bg-surface/70 p-2.5 hairline"><p className="font-semibold">{p.nom}</p>{p.resume ? <p className="mt-0.5 text-[12.5px] text-muted">{p.resume}</p> : null}</div>) : <span className="text-muted">Aucun persona détecté : à compléter.</span>}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Galerie des visuels trouvés sur le site (dossier.data.images). */
function Gallery({ clientId, images }: { clientId: string; images: DossierImage[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const [broken, setBroken] = React.useState<Set<string>>(() => new Set());
  const { exec } = useAction();
  const ok = images.filter((i) => !broken.has(i.url));
  const shown = showAll ? ok : ok.slice(0, 12);
  if (!ok.length) return null;
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><Images className="size-3.5" />Images du site · {ok.length}</p>
        {ok.length > 12 ? <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? "Réduire" : "Tout afficher"}</Button> : null}
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {shown.map((img) => (
          <li key={img.url} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2 hairline">
            <a href={img.url} target="_blank" rel="noopener noreferrer" className="block size-full" title={img.alt ?? undefined}>
              {/* Images distantes de sites tiers : balise native, sans optimisation Next (hôtes inconnus). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt ?? ""} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" onError={() => setBroken((s) => new Set(s).add(img.url))} />
            </a>
            <button type="button" aria-label="Retirer cette image" onClick={() => exec(() => removeDossierImage(clientId, img.url), { success: "Image retirée" })}
              className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><X className="size-3" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
