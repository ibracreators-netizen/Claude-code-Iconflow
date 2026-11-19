"use client";
import * as React from "react";
import { Copy, ExternalLink, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MkFab } from "@/components/marketing/chrome";
import { useAction } from "@/lib/hooks/use-action";
import { deleteSalesDocumentAction, saveSalesDocumentAction } from "@/lib/actions/marketing-payments";
import { dayIn, displayUrl, DOC_KINDS, docKindLabel, formatCreated, type DocKind, type SalesDocument } from "@/lib/marketing/payments";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY, CopyButton, DateRange, FilterMenu, FormDialog, FormField, Heading, INPUT, Pager, Pill, RowMenu, SearchBox, urlProblem, useCopy, usePaged, type MenuItem, type PillTone } from "./parts";
import { PhoneEmpty } from "./links-client";

const TONE: Record<DocKind, PillTone> = { contrat: "link", devis: "warn", document: "teal", autre: "neutral" };
const TH = "h-11 whitespace-nowrap px-4 text-left text-[12px] font-medium text-mk-sub";
const HELP = "Le fichier reste dans ton outil (Google Drive, Yousign…) : ici, on garde le lien pour l'envoyer vite.";

/** Onglet « Documents et contrats » : même présentation que les liens de paiement. */
export function DocumentsView({ docs, canEdit, timezone }: { docs: SalesDocument[]; canEdit: boolean; timezone: string }) {
  const { exec, pending } = useAction();
  const { copied, copy } = useCopy();
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState({ from: "", to: "" });
  const [kinds, setKinds] = React.useState<DocKind[]>([]);
  const [editing, setEditing] = React.useState<SalesDocument | "new" | null>(null);
  const [removing, setRemoving] = React.useState<SalesDocument | null>(null);

  const rows = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (t && ![d.name, d.url, d.note ?? "", docKindLabel(d.kind)].some((v) => v.toLowerCase().includes(t))) return false;
      if (kinds.length && !kinds.includes(d.kind)) return false;
      if (range.from || range.to) { const day = dayIn(d.created_at, timezone); if ((range.from && day < range.from) || (range.to && day > range.to)) return false; }
      return true;
    });
  }, [docs, q, kinds, range, timezone]);
  const paged = usePaged(rows, [q, kinds.join(), range.from, range.to]);
  const reset = () => { setQ(""); setKinds([]); setRange({ from: "", to: "" }); };

  const menu = (d: SalesDocument): MenuItem[] => [
    { label: "Ouvrir le document", icon: ExternalLink, onSelect: () => window.open(d.url, "_blank", "noopener,noreferrer") },
    { label: "Copier le lien", icon: Copy, onSelect: () => copy(d.id, d.url) },
    ...(canEdit ? [
      { label: "Modifier", icon: Pencil, onSelect: () => setEditing(d) },
      { label: "Supprimer", icon: Trash2, danger: true, separated: true, onSelect: () => setRemoving(d) },
    ] : []),
  ];
  const create = canEdit ? <button type="button" onClick={() => setEditing("new")} className={BTN_PRIMARY}><Plus strokeWidth={2.2} />Ajouter un document</button> : null;

  return (
    <>
      <Heading title="Documents et contrats" sub="Contrats, devis et documents à envoyer aux prospects" action={create} />

      <section className="hidden overflow-hidden rounded-[12px] border border-mk-line bg-surface shadow-soft lg:block">
        <div className="flex items-center gap-3 border-b border-mk-line px-4 py-3">
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <span className="ml-auto" />
          <SearchBox value={q} onChange={setQ} />
          <FilterMenu title="Type" options={DOC_KINDS} selected={kinds} onChange={setKinds} />
        </div>
        {docs.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon ring-8 ring-mk-chip/50"><FileText className="size-6" strokeWidth={1.7} /></span>
            <p className="mt-4 text-[16px] font-semibold text-mk-strong">Aucun document pour l&apos;instant</p>
            <p className="mt-1 max-w-md text-[14px] text-mk-sub">{canEdit ? HELP : "L'administrateur ajoute ici les contrats et devis. Tu pourras ensuite copier leur lien et l'envoyer."}</p>
            {canEdit ? <button type="button" onClick={() => setEditing("new")} className={cn(BTN_PRIMARY, "mt-5")}><Plus strokeWidth={2.2} />Ajouter un document</button> : null}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center"><p className="text-[16px] font-semibold text-mk-strong">Aucun document ne correspond à ta recherche</p><button type="button" onClick={reset} className={BTN_SECONDARY}>Effacer les filtres</button></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-[14px]">
                <thead className="border-b border-mk-line bg-bg">
                  <tr><th scope="col" className={TH}>Nom</th><th scope="col" className={TH}>Type</th><th scope="col" className={TH}>Lien</th><th scope="col" className={TH}>Créé à</th><th scope="col" className={cn(TH, "w-14")}><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {paged.slice.map((d) => (
                    <tr key={d.id} className="h-16 border-b border-mk-line transition last:border-b-0 hover:bg-mk-chip/50">
                      <td className="max-w-[320px] px-4 py-2.5">
                        <p className="truncate font-semibold text-mk-strong">{d.name}</p>
                        {d.note ? <p className="truncate text-[13px] text-mk-sub">{d.note}</p> : null}
                      </td>
                      <td className="px-4 py-2.5"><Pill tone={TONE[d.kind]}>{docKindLabel(d.kind)}</Pill></td>
                      <td className="px-4 py-2.5">
                        <span className="flex max-w-[340px] items-center gap-2">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.url} className="min-w-0 truncate text-mk-sub transition hover:text-accent-2 hover:underline">{displayUrl(d.url)}</a>
                          <CopyButton done={copied === d.id} onClick={() => copy(d.id, d.url)} />
                          <a href={d.url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le document" title="Ouvrir le document" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-mk-input bg-surface text-mk-icon transition hover:border-accent/60 hover:text-accent-2"><ExternalLink className="size-[15px]" strokeWidth={1.8} /></a>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-mk-text tabular">{formatCreated(d.created_at, timezone)}</td>
                      <td className="px-2 py-2.5 text-right"><RowMenu items={menu(d)} label={`Actions : ${d.name}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-mk-line"><Pager page={paged.page} pages={paged.pages} size={paged.size} onPage={paged.setPage} onSize={paged.setSize} /></div>
          </>
        )}
      </section>
      {docs.length > 0 ? <p className="mt-3 hidden text-[13px] text-mk-sub lg:block">{HELP}</p> : null}

      <div className="space-y-3 lg:hidden">
        {docs.length > 0 ? (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-mk-sub" strokeWidth={1.8} aria-hidden />
            <span className="sr-only">Rechercher un document</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un document" className="h-12 w-full rounded-[10px] border border-mk-input bg-surface pl-11 pr-3 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
        ) : null}
        {docs.length === 0 ? (
          <PhoneEmpty>{canEdit ? "Aucun document pour l'instant. Appuie sur + pour ajouter un contrat ou un devis." : "Aucun document pour l'instant. L'administrateur ajoute ici les contrats et devis."}</PhoneEmpty>
        ) : rows.length === 0 ? (
          <PhoneEmpty>Aucun document ne correspond à ta recherche.</PhoneEmpty>
        ) : (
          <ul className="space-y-3">
            {rows.map((d) => (
              <li key={d.id} className="rounded-[12px] border border-mk-line bg-surface p-4 shadow-soft">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold leading-snug text-mk-strong">{d.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2"><Pill tone={TONE[d.kind]}>{docKindLabel(d.kind)}</Pill><span className="text-[13px] text-mk-sub">{formatCreated(d.created_at, timezone)}</span></div>
                  </div>
                  {canEdit ? <RowMenu items={menu(d).slice(2)} label={`Actions : ${d.name}`} className="-mr-2 -mt-1 size-10" /> : null}
                </div>
                {d.note ? <p className="mt-2 line-clamp-2 text-[14px] text-mk-sub">{d.note}</p> : null}
                <p className="mt-2 truncate text-[13px] text-mk-sub">{displayUrl(d.url)}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => copy(d.id, d.url)} className={cn("inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[8px] text-[15px] font-semibold transition active:scale-[0.99]", copied === d.id ? "bg-mk-success-soft text-mk-success" : "bg-accent text-accent-fg")}>
                    <Copy className="size-[18px]" strokeWidth={2} />{copied === d.id ? "Lien copié" : "Copier le lien"}
                  </button>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-mk-input bg-surface px-4 text-[15px] font-medium text-mk-text transition active:bg-mk-chip"><ExternalLink className="size-[18px]" strokeWidth={1.8} />Ouvrir</a>
                </div>
              </li>
            ))}
          </ul>
        )}
        {docs.length > 0 ? <p className="px-1 pt-1 text-[13px] text-mk-sub">{HELP}</p> : null}
      </div>
      {canEdit ? <MkFab onClick={() => setEditing("new")} label="Ajouter un document" /> : null}

      {editing ? <DocDialog key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} danger loading={pending} confirmLabel="Supprimer"
        title="Supprimer ce document ?" description={removing ? `« ${removing.name} » disparaît de la liste. Le fichier lui-même reste dans ton outil.` : undefined}
        onConfirm={() => { const r = removing; if (r) exec(() => deleteSalesDocumentAction(r.id), { success: "Document supprimé.", onSuccess: () => setRemoving(null) }); }} />
    </>
  );
}

function DocDialog({ initial, onClose }: { initial: SalesDocument | null; onClose: () => void }) {
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ name: initial?.name ?? "", kind: initial?.kind ?? ("contrat" as DocKind), url: initial?.url ?? "", note: initial?.note ?? "" });
  const [tried, setTried] = React.useState(false);
  const nameErr = tried && !f.name.trim() ? "Donne un nom au document." : null;
  const urlErr = f.url.trim() ? urlProblem(f.url) : tried ? "Colle le lien (il commence par « https:// »)." : null;
  const submit = () => {
    setTried(true);
    if (!f.name.trim() || !f.url.trim() || urlProblem(f.url)) return;
    exec(() => saveSalesDocumentAction({ id: initial?.id ?? null, name: f.name, kind: f.kind, url: f.url, note: f.note }), { success: initial ? "Document enregistré." : "Document ajouté.", onSuccess: onClose });
  };
  return (
    <FormDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={initial ? "Modifier le document" : "Nouveau document"} description={HELP} onSubmit={submit} submitLabel={initial ? "Enregistrer" : "Ajouter le document"} pending={pending}>
      <FormField label="Nom" required htmlFor="doc-name" error={nameErr}>
        <input id="doc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoFocus placeholder="Ex. Contrat d'accompagnement 2026" className={cn(INPUT, nameErr && "border-mk-danger")} />
      </FormField>
      <div>
        <p className="mb-1.5 text-[15px] font-medium text-mk-text lg:text-[14px]">Type</p>
        <div role="radiogroup" aria-label="Type de document" className="flex flex-wrap gap-2">
          {DOC_KINDS.map((k) => (
            <button key={k.value} type="button" role="radio" aria-checked={f.kind === k.value} onClick={() => setF({ ...f, kind: k.value })}
              className={cn("inline-flex h-9 items-center rounded-full border px-4 text-[14px] font-medium transition", f.kind === k.value ? "border-accent bg-accent-soft text-accent-2" : "border-mk-input bg-surface text-mk-text hover:bg-mk-chip")}>{k.label}</button>
          ))}
        </div>
      </div>
      <FormField label="Lien du document" required htmlFor="doc-url" error={urlErr} hint="Lien de partage Google Drive, Yousign, Docusign, Notion…">
        <input id="doc-url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} maxLength={2000} placeholder="https://drive.google.com/…" className={cn(INPUT, urlErr && "border-mk-danger")} />
      </FormField>
      <FormField label="Note" htmlFor="doc-note" hint="Facultatif. Ex. à envoyer après la signature du devis.">
        <textarea id="doc-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} rows={3} className={cn(INPUT, "h-auto min-h-[88px] resize-y py-2.5 leading-relaxed lg:h-auto")} />
      </FormField>
    </FormDialog>
  );
}
