"use client";
import * as React from "react";
import { ChevronDown, ExternalLink, Sparkles, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { IA_GEN_STATUS, IA_STATUS, type IaConcept, type IaEditNotes, type IaGenStatus, type IaPart, type IaStatus } from "@/lib/data/types";

const STATUS_TONE: Record<IaStatus, "neutral" | "accent" | "success"> = { brouillon: "neutral", prompts_valides: "accent", en_generation: "accent", livre: "success" };
const GEN_TONE: Record<IaGenStatus, "neutral" | "success" | "warning"> = { en_cours: "neutral", ok: "success", a_relancer: "warning" };

/**
 * Lecture publique d'un dossier IA (comme la page publique d'un brief) : volet gauche avec la marque et la liste
 * des concepts ; à droite, le plan du concept sélectionné (parties, prompts, générations, notes de montage).
 * Navigation sans rechargement, volet repliable sur mobile.
 */
export function PublicIaReader({ title, client, concepts }: {
  title: string; client: { name: string; logo: string | null } | null; concepts: IaConcept[];
}) {
  const [active, setActive] = React.useState(0);
  const [navOpen, setNavOpen] = React.useState(false);
  const multi = concepts.length > 1;
  const current = concepts[active] ?? concepts[0] ?? null;

  const pageList = (
    <nav aria-label="Concepts du dossier" className="flex flex-col gap-0.5">
      {concepts.map((c, i) => {
        const on = i === active;
        return (
          <button key={c.id} type="button" onClick={() => { setActive(i); setNavOpen(false); }} aria-current={on ? "page" : undefined}
            className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition ${on ? "bg-accent-soft font-semibold text-fg" : "text-fg-2 hover:bg-surface-2"}`}>
            <span className={`mt-0.5 font-mono text-[11px] ${on ? "text-accent-2" : "text-muted-2"}`}>{c.code}</span>
            <span className="min-w-0 flex-1 leading-snug">{c.title}</span>
          </button>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        {client ? <><Avatar name={client.name} src={client.logo} size={22} square /><span className="min-w-0 truncate font-medium text-fg-2">{client.name}</span></> : <Sparkles className="size-4 text-muted" />}
      </div>
      <h1 className="text-[17px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
        <Badge tone="outline">Production IA</Badge>
        {multi ? <span>· {concepts.length} concepts</span> : null}
      </div>
    </div>
  );

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto grid w-full max-w-6xl gap-0 lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border px-4 py-8 lg:block">
          <div className="sticky top-8 flex flex-col gap-5">
            {brand}
            {concepts.length ? <div><p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Concepts</p>{pageList}</div> : null}
            <a href="https://icon-flow.fr" target="_blank" rel="noopener noreferrer" className="px-2.5 text-[11.5px] text-muted-2 transition hover:text-accent-2">Préparé par icon-flow ↗</a>
          </div>
        </aside>

        <div className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
          <div className="mb-6 lg:hidden">
            <div className="mb-3">{brand}</div>
            {multi ? (
              <>
                <button type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] font-medium">
                  <span className="font-mono text-[11px] text-accent-2">{current?.code}</span>
                  <span className="min-w-0 flex-1 truncate text-left">{current?.title}</span>
                  <ChevronDown className={`size-4 text-muted transition ${navOpen ? "rotate-180" : ""}`} />
                </button>
                {navOpen ? <div className="mt-2 rounded-xl border border-border bg-surface p-1.5">{pageList}</div> : null}
              </>
            ) : null}
          </div>

          <article className="mx-auto max-w-3xl">
            {current ? (
              <>
                <header className="mb-5 flex flex-wrap items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[12px] font-semibold text-accent-fg" aria-hidden>{current.code}</span>
                  <h2 className="min-w-0 flex-1 text-[22px] font-semibold tracking-tight">{current.title}</h2>
                  <Badge tone={STATUS_TONE[current.status]}>{IA_STATUS[current.status]}</Badge>
                </header>
                <ConceptView concept={current} />
              </>
            ) : (
              <div className="rounded-2xl border border-border bg-surface p-10 text-center">
                <Sparkles className="mx-auto mb-3 size-6 text-muted-2" />
                <p className="text-[15px] font-semibold">Dossier en préparation</p>
                <p className="mt-1 text-[13px] text-muted">Les concepts arriveront ici dès qu&apos;ils seront prêts.</p>
              </div>
            )}

            <footer className="mt-12 flex items-center justify-between gap-3 border-t border-border pt-6 text-[12px] text-muted lg:hidden">
              <span>Partagé via Iconflow Studio</span>
              <a href="https://icon-flow.fr" className="font-medium text-fg-2 transition hover:text-accent-2" target="_blank" rel="noopener noreferrer">icon-flow.fr</a>
            </footer>
          </article>
        </div>
      </div>
    </main>
  );
}

function ConceptView({ concept }: { concept: IaConcept }) {
  return (
    <div className="space-y-4">
      {concept.parts.length ? concept.parts.map((part) => <PartView key={part.id} code={concept.code} part={part} />) : (
        <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">Aucune partie pour ce concept pour l&apos;instant.</p>
      )}
      <EditNotesView notes={concept.edit_notes} />
    </div>
  );
}

function PartView({ code, part }: { code: string; part: IaPart }) {
  const dialogue = part.text_start || part.text_end;
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-accent-2">{code}-{part.id}</span>
        <h3 className="text-[15px] font-semibold">Partie {part.number}</h3>
        {part.validated ? <Badge tone="accent">Validée</Badge> : null}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {part.duration ? <Badge tone="outline">{part.duration}s</Badge> : null}
          {part.resolution ? <Badge tone="outline">{part.resolution}</Badge> : null}
          {part.model ? <Badge tone="outline">{part.model}</Badge> : null}
        </span>
      </div>

      {dialogue ? <p className="mt-3 text-[13.5px] leading-relaxed text-fg-2"><span className="text-muted">Dialogue : </span>« {part.text_start}{part.text_start && part.text_end ? " … " : ""}{part.text_end} »{part.word_count ? <span className="text-muted-2"> · {part.word_count} mots</span> : null}</p> : null}
      {part.ref_on ? <p className="mt-2 text-[13px] text-muted">Vidéo de référence branchée{part.ref_excerpt ? ` — ${part.ref_excerpt}` : ""}{part.ref_reason ? ` · ${part.ref_reason}` : ""}</p> : null}

      {part.media.some((m) => m.tag || m.label || m.file) ? (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Médias à brancher</p>
          <ul className="space-y-1 text-[12.5px]">
            {part.media.filter((m) => m.tag || m.label || m.file).map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-accent-2">{m.tag}</span>
                {m.label ? <span className="text-muted">{m.label}</span> : null}
                {m.file ? <a href={m.file} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg-2 hover:text-accent-2"><ExternalLink className="size-3" />fichier</a> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {part.prompt ? (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Prompt</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-fg-2">{part.prompt}</pre>
        </div>
      ) : null}

      {part.generations.length ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Générations</p>
          <ul className="space-y-1.5">
            {part.generations.map((g) => (
              <li key={g.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 text-[12.5px] ${g.starred ? "border-warning/40 bg-warning/5" : "border-border"}`}>
                {g.starred ? <Star className="size-3.5 shrink-0 fill-current text-warning" /> : null}
                <span className="font-mono">v{g.version}</span>
                <Badge tone={GEN_TONE[g.status]}>{IA_GEN_STATUS[g.status]}</Badge>
                {g.url ? <a href={g.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-2 hover:underline"><ExternalLink className="size-3.5" />Voir la vidéo</a> : <span className="text-muted-2">lien à venir</span>}
                {g.qc ? <span className="w-full text-[12px] text-muted">{g.qc}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function EditNotesView({ notes }: { notes: IaEditNotes }) {
  const has = notes.texts.some((t) => t.tc || t.text) || notes.overlays || notes.music || notes.mentions;
  if (!has) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold">Notes de montage</h3>
      {notes.texts.some((t) => t.tc || t.text) ? (
        <ul className="mt-2 space-y-1 text-[12.5px]">
          {notes.texts.filter((t) => t.tc || t.text).map((t, i) => <li key={i} className="flex gap-2"><span className="font-mono text-accent-2">{t.tc || "—"}</span><span className="text-fg-2">{t.text}</span></li>)}
        </ul>
      ) : null}
      <div className="mt-2 grid gap-1.5 text-[12.5px] sm:grid-cols-3">
        {notes.overlays ? <p><span className="text-muted">Incrustations : </span>{notes.overlays}</p> : null}
        {notes.music ? <p><span className="text-muted">Musique : </span>{notes.music}</p> : null}
        {notes.mentions ? <p><span className="text-muted">Mentions : </span>{notes.mentions}</p> : null}
      </div>
    </section>
  );
}
