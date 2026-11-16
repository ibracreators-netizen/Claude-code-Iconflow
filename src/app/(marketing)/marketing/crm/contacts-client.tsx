"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, Save, Search, X } from "lucide-react";
import { SortTh } from "@/components/shared/sort-th";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createContactAction, updateContactAction } from "@/lib/actions/marketing-crm";
import type { Contact } from "@/lib/marketing/types";

type SortKey = "name" | "activity" | "created";
const nameOf = (c: Contact) => c.name ?? c.email ?? c.phone ?? "Sans nom";

export function ContactsTable({ contacts, deals, timezone, canExport }: { contacts: Contact[]; deals: Record<string, number>; timezone: string; canExport: boolean }) {
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "activity", dir: -1 });
  const fmt = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "2-digit", timeZone: timezone }), [timezone]);
  const tags = React.useMemo(() => [...new Set(contacts.flatMap((c) => c.tags ?? []))].sort((a, b) => a.localeCompare(b, "fr")), [contacts]);
  const rows = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    const by: Record<SortKey, (a: Contact, b: Contact) => number> = {
      name: (a, b) => nameOf(a).localeCompare(nameOf(b), "fr"),
      activity: (a, b) => (a.last_activity_at ?? "").localeCompare(b.last_activity_at ?? ""),
      created: (a, b) => a.created_at.localeCompare(b.created_at),
    };
    return contacts.filter((c) => (!tag || (c.tags ?? []).includes(tag)) && (!t || [c.name, c.email, c.phone, c.company].some((v) => (v ?? "").toLowerCase().includes(t)))).sort((a, b) => by[sort.key](a, b) * sort.dir);
  }, [contacts, q, tag, sort]);
  const th = { sort, onSort: setSort, desc: ["activity", "created"] as SortKey[] };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden /><span className="sr-only">Rechercher un contact</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, email, téléphone, entreprise" className="pl-9" />
        </label>
        {tags.length ? <NativeSelect aria-label="Filtrer par étiquette" value={tag} onChange={(e) => setTag(e.target.value)} className="h-9 w-auto"><option value="">Toutes les étiquettes</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect> : null}
        {q || tag ? <button type="button" onClick={() => { setQ(""); setTag(""); }} className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[13px] text-muted hover:text-fg"><X className="size-3.5" />Effacer</button> : null}
        <span className="ml-auto text-[12.5px] text-muted tabular">{rows.length} contact{rows.length > 1 ? "s" : ""}</span>
        {canExport ? <a href="/api/marketing/export?quoi=contacts" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-fg-2 transition hover:border-border-strong hover:text-fg"><Download className="size-3.5" />Exporter</a> : null}
      </div>
      {rows.length === 0 ? <div className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucun contact ne correspond à cette recherche.</div> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead><tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted"><SortTh k="name" {...th} className="pl-4">Contact</SortTh><SortTh {...th}>Téléphone</SortTh><SortTh {...th}>Entreprise</SortTh><SortTh {...th}>Étiquettes</SortTh><SortTh {...th} className="text-right">Affaires</SortTh><SortTh k="activity" {...th}>Dernière activité</SortTh><SortTh k="created" {...th} className="pr-4 text-right">Créé le</SortTh></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="transition hover:bg-surface-2/60">
                  <td className="max-w-[260px] px-3 py-3 pl-4"><Link href={`/marketing/crm/contacts/${c.id}`} className="flex items-center gap-2.5"><Avatar name={nameOf(c)} size={30} /><span className="min-w-0"><span className="block truncate font-medium hover:underline">{nameOf(c)}</span><span className="block truncate text-[12px] text-muted">{c.email ?? "sans email"}</span></span></Link></td>
                  <td className="whitespace-nowrap px-3 py-3 text-fg-2 tabular">{c.phone ?? <span className="text-muted-2">—</span>}</td>
                  <td className="max-w-[180px] truncate px-3 py-3 text-fg-2">{c.company ?? <span className="text-muted-2">—</span>}</td>
                  <td className="max-w-[220px] px-3 py-3"><div className="flex flex-wrap gap-1">{(c.tags ?? []).slice(0, 4).map((t) => <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-fg-2">{t}</span>)}{(c.tags ?? []).length > 4 ? <span className="text-[11.5px] text-muted">+{c.tags.length - 4}</span> : null}</div></td>
                  <td className="px-3 py-3 text-right tabular">{deals[c.id] ?? 0}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted tabular">{c.last_activity_at ? fmt.format(new Date(c.last_activity_at)) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 pr-4 text-right text-muted tabular">{fmt.format(new Date(c.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NewContactButton() {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: "", email: "", phone: "", company: "", tags: "", withProspect: true });
  const set = (k: "name" | "email" | "phone" | "company" | "tags") => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const valid = !!(f.name.trim() || f.email.trim() || f.phone.trim());
  const submit = () => exec(() => createContactAction({ name: f.name, email: f.email, phone: f.phone, company: f.company, tags: f.tags, withProspect: f.withProspect }), {
    refresh: false, onSuccess: (r) => { setOpen(false); router.push(`/marketing/crm/contacts/${r.contactId}`); router.refresh(); },
    success: "Contact enregistré.",
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Nouveau contact</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau contact" description="Si une fiche existe déjà avec cet email ou ce téléphone, elle est complétée : aucune fiche en double.">
          <div className="space-y-3">
            <Field label="Nom"><Input value={f.name} onChange={set("name")} autoFocus maxLength={160} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Email"><Input type="email" value={f.email} onChange={set("email")} maxLength={254} /></Field><Field label="Téléphone"><Input type="tel" value={f.phone} onChange={set("phone")} maxLength={40} /></Field></div>
            <Field label="Entreprise"><Input value={f.company} onChange={set("company")} maxLength={120} /></Field>
            <Field label="Étiquettes" hint="Séparées par des virgules"><Input value={f.tags} onChange={set("tags")} maxLength={300} /></Field>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.withProspect} onChange={(e) => setF((v) => ({ ...v, withProspect: e.target.checked }))} className="size-4 accent-[var(--color-accent)]" />Ouvrir aussi une affaire à l&apos;étape « Nouveau lead »</label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button loading={pending} disabled={!valid} onClick={submit}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ContactForm({ contact }: { contact: Contact }) {
  const { exec, pending } = useAction();
  const init = { name: contact.name ?? "", email: contact.email ?? "", phone: contact.phone ?? "", company: contact.company ?? "", tags: (contact.tags ?? []).join(", ") };
  const [f, setF] = React.useState(init);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <div className="space-y-4">
      <Field label="Nom"><Input value={f.name} onChange={set("name")} maxLength={160} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Email"><Input type="email" value={f.email} onChange={set("email")} maxLength={254} /></Field><Field label="Téléphone"><Input type="tel" value={f.phone} onChange={set("phone")} maxLength={40} /></Field></div>
      <Field label="Entreprise"><Input value={f.company} onChange={set("company")} maxLength={120} /></Field>
      <Field label="Étiquettes" hint="Séparées par des virgules"><Input value={f.tags} onChange={set("tags")} maxLength={400} /></Field>
      <Button size="sm" loading={pending} disabled={!dirty} onClick={() => exec(() => updateContactAction(contact.id, f), { success: "Contact enregistré." })}><Save />Enregistrer</Button>
    </div>
  );
}
