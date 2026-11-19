"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Lock, Plus, Search, UserPlus, X } from "lucide-react";
import { NativeSelect } from "@/components/ui/input";
import { MkHeaderActions } from "@/components/marketing/chrome";
import { MkFieldLabel, MkInitials } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { createProspectAction } from "@/lib/actions/marketing-crm";
import { searchContactsAction, type ContactHit } from "@/lib/actions/marketing-prospects";
import { MARKETING_ROLE, type MarketingRole, type Member, type Stage } from "@/lib/marketing/types";
import { stageHex } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const PIPELINE = "IconFlow — Ventes";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const FIELD = "h-12 w-full rounded-[10px] border border-mk-input bg-surface px-3.5 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60 lg:text-[15px]";
const HINT = "mt-1.5 text-[13.5px] leading-snug text-mk-sub";

/** Montant saisi (« 1 500,50 ») → nombre ; vide → null ; illisible → NaN. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s  €]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? Math.round(n * 100) / 100 : Number.NaN;
}

export function NewProspectForm({ stages, members, initialStage, salesRole }: { stages: Stage[]; members: Member[]; initialStage: string; salesRole: MarketingRole | null }) {
  const router = useRouter();
  const formId = React.useId();
  const { exec, pending } = useAction();
  // Contact : un contact existant (recherche) ou un nouveau (nom, email, téléphone).
  const [mode, setMode] = React.useState<"recherche" | "nouveau">("recherche");
  const [picked, setPicked] = React.useState<ContactHit | null>(null);
  const [nc, setNc] = React.useState({ name: "", email: "", phone: "", company: "" });
  const [title, setTitle] = React.useState<string | null>(null); // null : suit le nom du contact
  const [stage, setStage] = React.useState(initialStage);
  const [value, setValue] = React.useState("");
  const [source, setSource] = React.useState("");
  const [setter, setSetter] = React.useState("");
  const [closer, setCloser] = React.useState("");

  const contactName = picked ? picked.name ?? picked.email ?? picked.phone ?? "" : nc.name.trim();
  const dealTitle = title ?? contactName;
  const amount = parseAmount(value);
  const emailBad = mode === "nouveau" && !!nc.email.trim() && !EMAIL_RE.test(nc.email.trim());
  const contactOk = picked ? true : mode === "nouveau" && !emailBad && !!(nc.name.trim() || nc.email.trim() || nc.phone.replace(/\D/g, "").length >= 6);
  const valid = contactOk && !!dealTitle.trim() && !Number.isNaN(amount) && !!stage;
  const people = members.filter((m) => m.marketing_role !== "media_buyer");
  const current = stages.find((s) => s.id === stage);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || pending) return;
    const c = picked ? { contact_id: picked.id, name: picked.name, email: picked.email, phone: picked.phone, company: picked.company } : { name: nc.name, email: nc.email, phone: nc.phone, company: nc.company };
    exec(() => createProspectAction({
      ...c,
      // Un nom identique à celui du contact n'est pas recopié : le prospect suit la fiche si elle est renommée.
      title: dealTitle.trim() && dealTitle.trim() !== contactName ? dealTitle.trim() : null,
      value: amount, source: source.trim() || "manuel", stage_key: current?.key ?? null,
      ...(salesRole ? {} : { setter_id: setter || null, closer_id: closer || null }),
    }), {
      refresh: false,
      onSuccess: (r) => {
        if (r.createdProspect) toast.success("Prospect ajouté.");
        else toast.info("Ce contact avait déjà un prospect en cours : il a été complété, rien n'a été écrasé.");
        router.push(`/marketing/crm/${r.prospectId}`);
      },
    });
  };

  const fillFromSearch = (q: string) => {
    const t = q.trim();
    setNc({ name: EMAIL_RE.test(t) || /^[+\d][\d\s.()-]{5,}$/.test(t) ? "" : t, email: EMAIL_RE.test(t) ? t : "", phone: /^[+\d][\d\s.()-]{5,}$/.test(t) ? t : "", company: "" });
    setPicked(null); setMode("nouveau");
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <MkHeaderActions>
        <button type="submit" form={formId} disabled={!valid || pending} className="-mr-1 inline-flex h-11 items-center rounded-full px-3 text-[17px] font-semibold text-accent-2 transition active:bg-mk-chip disabled:text-mk-sub disabled:opacity-60">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </MkHeaderActions>
      <Link href="/marketing/crm" className="mb-4 hidden items-center gap-1.5 text-[14px] font-medium text-mk-sub transition hover:text-mk-strong lg:inline-flex"><ArrowLeft className="size-4" />Prospects</Link>

      <form id={formId} onSubmit={submit} noValidate className="space-y-5 lg:rounded-[12px] lg:border lg:border-mk-line lg:bg-surface lg:p-8 lg:shadow-soft">
        <div className="hidden lg:block">
          <h1 className="text-[20px] font-semibold text-mk-strong">Ajouter un prospect</h1>
          <p className="mt-1 text-[14px] text-mk-sub">Une affaire dans le pipeline {PIPELINE}, rattachée à un contact.</p>
        </div>

        {/* ─── Contact ─── */}
        <div>
          <MkFieldLabel required htmlFor={picked ? undefined : mode === "recherche" ? `${formId}-contact` : `${formId}-nom`}>Contact</MkFieldLabel>
          {picked ? (
            <>
              <div className="flex items-center gap-3 rounded-[10px] border border-mk-input bg-surface px-3 py-2.5">
                <MkInitials name={picked.name ?? picked.email ?? "?"} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-mk-strong">{picked.name ?? picked.email ?? picked.phone ?? "Sans nom"}</p>
                  <p className="truncate text-[14px] text-mk-sub">{[picked.email, picked.phone, picked.company].filter(Boolean).join(" · ") || "Aucune coordonnée"}</p>
                </div>
                <button type="button" onClick={() => { setPicked(null); setMode("recherche"); }} aria-label="Changer de contact" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-mk-icon transition hover:bg-mk-chip"><X className="size-5" /></button>
              </div>
              {picked.openDeal ? (
                <p className={HINT}>Ce contact a déjà un prospect en cours{picked.openDeal.stage ? <> (« {picked.openDeal.stage} »)</> : null} : il sera complété, pas doublé. <Link href={`/marketing/crm/${picked.openDeal.id}`} className="font-medium text-accent-2 underline">L&apos;ouvrir</Link></p>
              ) : <p className={HINT}>Un nouveau prospect sera créé pour ce contact.</p>}
            </>
          ) : mode === "recherche" ? (
            <>
              <ContactSearch id={`${formId}-contact`} onPick={(c) => { setPicked(c); setMode("recherche"); }} onCreate={fillFromSearch} />
              <button type="button" onClick={() => fillFromSearch("")} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-[8px] text-[15px] font-medium text-accent-2"><UserPlus className="size-[18px]" />Nouveau contact</button>
            </>
          ) : (
            <div className="space-y-4 rounded-[12px] border border-mk-line p-4">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[15px] font-semibold text-mk-strong">Nouveau contact</p>
                <button type="button" onClick={() => setMode("recherche")} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-1 text-[14px] font-medium text-accent-2"><Search className="size-4" />Chercher un contact</button>
              </div>
              <div><MkFieldLabel htmlFor={`${formId}-nom`}>Nom</MkFieldLabel><input id={`${formId}-nom`} aria-describedby={`${formId}-dup`} value={nc.name} onChange={(e) => setNc((v) => ({ ...v, name: e.target.value }))} autoComplete="off" maxLength={160} placeholder="Prénom Nom" className={FIELD} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <MkFieldLabel htmlFor={`${formId}-email`}>Email</MkFieldLabel>
                  <input id={`${formId}-email`} type="email" inputMode="email" autoComplete="off" value={nc.email} onChange={(e) => setNc((v) => ({ ...v, email: e.target.value }))} maxLength={254} placeholder="nom@exemple.fr" aria-invalid={emailBad || undefined} className={cn(FIELD, emailBad && "border-mk-danger focus:border-mk-danger focus:ring-mk-danger/20")} />
                  {emailBad ? <p className="mt-1.5 text-[13.5px] text-mk-danger">Cet email n&apos;est pas valide.</p> : null}
                </div>
                <div><MkFieldLabel htmlFor={`${formId}-tel`}>Téléphone</MkFieldLabel><input id={`${formId}-tel`} type="tel" inputMode="tel" autoComplete="off" value={nc.phone} onChange={(e) => setNc((v) => ({ ...v, phone: e.target.value }))} maxLength={40} placeholder="06 12 34 56 78" className={FIELD} /></div>
              </div>
              <div><MkFieldLabel htmlFor={`${formId}-entreprise`}>Entreprise</MkFieldLabel><input id={`${formId}-entreprise`} value={nc.company} onChange={(e) => setNc((v) => ({ ...v, company: e.target.value }))} maxLength={120} className={FIELD} /></div>
              <p id={`${formId}-dup`} className="text-[13.5px] leading-snug text-mk-sub">Il faut au moins un nom, un email ou un téléphone. Si un contact existe déjà avec cet email ou ce téléphone, le prospect lui est rattaché : aucune fiche en double.</p>
            </div>
          )}
        </div>

        {/* ─── L'affaire ─── */}
        <div>
          <MkFieldLabel required htmlFor={`${formId}-titre`}>Nom du prospect</MkFieldLabel>
          <input id={`${formId}-titre`} value={dealTitle} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Le nom du contact, par défaut" className={FIELD} />
          {title !== null && contactName && title !== contactName ? <button type="button" onClick={() => setTitle(null)} className="mt-1.5 text-[13.5px] font-medium text-accent-2">Reprendre le nom du contact</button> : null}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <MkFieldLabel htmlFor={`${formId}-pipeline`}>Pipeline</MkFieldLabel>
            <div className="relative"><input id={`${formId}-pipeline`} value={PIPELINE} readOnly className={cn(FIELD, "bg-mk-chip pr-10 text-mk-text")} /><Lock className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-mk-sub" aria-hidden /></div>
          </div>
          <div>
            <MkFieldLabel required htmlFor={`${formId}-etape`}>Étape</MkFieldLabel>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-2.5 -translate-y-1/2 rounded-full" style={{ background: stageHex(current) }} />
              <NativeSelect id={`${formId}-etape`} value={stage} onChange={(e) => setStage(e.target.value)} className={cn(FIELD, "pl-9 pr-9")}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
            </div>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <MkFieldLabel htmlFor={`${formId}-valeur`}>Valeur (€)</MkFieldLabel>
            <input id={`${formId}-valeur`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" maxLength={16} aria-invalid={Number.isNaN(amount) || undefined} className={cn(FIELD, "tabular", Number.isNaN(amount) && "border-mk-danger focus:border-mk-danger focus:ring-mk-danger/20")} />
            {Number.isNaN(amount) ? <p className="mt-1.5 text-[13.5px] text-mk-danger">Écris un montant, par exemple 1500 ou 1 500,50.</p> : null}
          </div>
          <div>
            <MkFieldLabel htmlFor={`${formId}-source`}>Source</MkFieldLabel>
            <input id={`${formId}-source`} value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} placeholder="manuel" className={FIELD} />
          </div>
        </div>
        {salesRole ? (
          <p className="rounded-[10px] bg-mk-chip px-3.5 py-3 text-[14px] text-mk-text">Tu deviens {MARKETING_ROLE[salesRole].toLowerCase()} de ce prospect automatiquement.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <MkFieldLabel htmlFor={`${formId}-setter`}>Setter</MkFieldLabel>
              <NativeSelect id={`${formId}-setter`} value={setter} onChange={(e) => setSetter(e.target.value)} className={cn(FIELD, "pr-9")}><option value="">Personne</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
            </div>
            <div>
              <MkFieldLabel htmlFor={`${formId}-closer`}>Closer</MkFieldLabel>
              <NativeSelect id={`${formId}-closer`} value={closer} onChange={(e) => setCloser(e.target.value)} className={cn(FIELD, "pr-9")}><option value="">Personne</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
            </div>
          </div>
        )}

        <div className="hidden items-center justify-end gap-3 border-t border-mk-line pt-6 lg:flex">
          <Link href="/marketing/crm" className="inline-flex h-10 items-center rounded-[8px] border border-mk-input bg-surface px-4 text-[14px] font-medium text-mk-strong shadow-soft transition hover:bg-bg">Annuler</Link>
          <button type="submit" disabled={!valid || pending} className="inline-flex h-10 items-center rounded-[8px] bg-accent px-5 text-[14px] font-medium text-accent-fg shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </div>
  );
}

/** Recherche d'un contact existant (nom, email, téléphone), au clavier comme à la souris. */
function ContactSearch({ id, onPick, onCreate }: { id: string; onPick: (c: ContactHit) => void; onCreate: (q: string) => void }) {
  const listId = `${id}-liste`;
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<ContactHit[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const timer = React.useRef<number | null>(null);
  const seq = React.useRef(0);
  const ready = q.trim().length >= 2;

  const onChange = (v: string) => {
    setQ(v); setOpen(true); setActive(-1); setError(null);
    if (timer.current) window.clearTimeout(timer.current);
    const text = v.trim();
    if (text.length < 2) { seq.current++; setHits([]); setBusy(false); return; }
    setBusy(true);
    const mine = ++seq.current;
    timer.current = window.setTimeout(async () => {
      const res = await searchContactsAction(text).catch(() => ({ ok: false as const, error: "La recherche n'a pas répondu. Réessaie." }));
      if (mine !== seq.current) return;
      setBusy(false);
      if (res.ok) setHits(res.data); else { setHits([]); setError(res.error); }
    }, 250);
  };
  React.useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const options = ready ? hits.length + 1 : 0; // + « Créer le contact »
  const choose = (i: number) => { if (i < hits.length) onPick(hits[i]); else onCreate(q); setOpen(false); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!options) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % options); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive((a) => (a <= 0 ? options - 1 : a - 1)); }
    else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-mk-sub" strokeWidth={1.8} aria-hidden />
      <input id={id} role="combobox" aria-expanded={open && ready} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        value={q} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        autoComplete="off" placeholder="Rechercher par nom, email ou téléphone" className={cn(FIELD, "pl-11")} />
      {open && ready ? (
        <ul id={listId} role="listbox" aria-label="Contacts trouvés" className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-y-auto rounded-[10px] border border-mk-line bg-surface p-1 shadow-pop">
          {busy && !hits.length ? <li className="px-3 py-3 text-[14px] text-mk-sub" aria-live="polite">Recherche…</li> : null}
          {!busy && error ? <li className="px-3 py-3 text-[14px] text-mk-danger">{error}</li> : null}
          {!busy && !error && !hits.length ? <li className="px-3 py-3 text-[14px] text-mk-sub">Aucun contact trouvé pour « {q.trim()} ».</li> : null}
          {hits.map((c, i) => (
            <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2", i === active ? "bg-mk-chip" : "hover:bg-mk-chip/70")}>
              <MkInitials name={c.name ?? c.email ?? "?"} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-mk-strong">{c.name ?? c.email ?? c.phone ?? "Sans nom"}</span>
                <span className="block truncate text-[13px] text-mk-sub">{[c.email, c.phone].filter(Boolean).join(" · ") || "Aucune coordonnée"}{c.openDeal ? " · prospect en cours" : ""}</span>
              </span>
            </li>
          ))}
          <li id={`${listId}-${hits.length}`} role="option" aria-selected={active === hits.length} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(hits.length)}
            className={cn("mt-0.5 flex cursor-pointer items-center gap-3 rounded-[8px] border-t border-mk-line px-2.5 py-2.5 text-[15px] font-medium text-accent-2", active === hits.length ? "bg-mk-chip" : "hover:bg-mk-chip/70")}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft"><Plus className="size-[18px]" /></span>
            <span className="min-w-0 truncate">Créer le contact « {q.trim()} »</span>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
