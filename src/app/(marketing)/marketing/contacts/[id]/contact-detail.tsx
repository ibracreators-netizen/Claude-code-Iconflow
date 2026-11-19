"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, Copy, Mail, Pencil, Phone, Target, type LucideIcon } from "lucide-react";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { MkHeaderActions } from "@/components/marketing/chrome";
import { MkEmpty, MkFieldLabel } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { updateContactAction } from "@/lib/actions/marketing-crm";
import { contactFacetsAction } from "@/lib/actions/marketing-contacts";
import { euro } from "@/lib/marketing/ui";
import type { Contact } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { agoLabel, ContactAvatar, contactName, createdLabel, EMAIL_OK, MK_FIELD, TagPill } from "../contact-ui";
import { TagInput } from "../tag-input";

export interface ContactDeal { id: string; title: string; stage: string; color: string; value: number | null; created_at: string }
type Tab = "infos" | "prospects" | "historique";

/**
 * Fiche contact au style LeadConnector.
 * Téléphone : carte d'identité, ronds d'action, puis onglets Informations / Prospects / Historique.
 * Ordinateur : deux colonnes, les informations à gauche, les onglets Prospects / Historique à droite.
 */
export function ContactDetail({ contact, deals, timezone, now, canProspects, history }: {
  contact: Contact; deals: ContactDeal[]; timezone: string; now: string; canProspects: boolean; history: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<Tab>("infos");
  const [editing, setEditing] = React.useState(false);
  const name = contactName(contact);
  // Sur ordinateur, les informations restent à gauche : l'onglet de droite affiché par défaut est « Prospects ».
  const rightTab: Exclude<Tab, "infos"> = tab === "historique" ? "historique" : "prospects";
  const tabs: Array<{ key: Tab; label: string; count?: number }> = [{ key: "infos", label: "Informations" }, { key: "prospects", label: "Prospects", count: deals.length }, { key: "historique", label: "Historique" }];

  return (
    <div>
      <nav aria-label="Fil d'Ariane" className="mb-4 hidden items-center gap-1.5 text-[14px] text-mk-sub lg:flex">
        <Link href="/marketing/contacts" className="font-medium transition hover:text-accent-2">Contacts</Link>
        <ChevronRight className="size-4" />
        <span className="truncate font-medium text-mk-strong">{name}</span>
      </nav>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="contents lg:block lg:space-y-4">
          {/* Carte d'identité */}
          <section className="order-1 -mx-4 border-b border-mk-line px-4 pb-5 lg:mx-0 lg:rounded-xl lg:border lg:bg-surface lg:p-5 lg:shadow-soft">
            <div className="flex items-center gap-4">
              <ContactAvatar contact={contact} seed={contact.id} size={56} className="text-[19px]" />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[20px] font-semibold leading-tight text-mk-strong">{name}</h1>
                {contact.phone ? <p className="mt-1 truncate text-[15px] text-mk-sub lg:text-[14px]">{contact.phone}</p> : null}
                {contact.email ? <p className="truncate text-[15px] text-mk-sub lg:text-[14px]">{contact.email}</p> : null}
              </div>
            </div>
            <div className="mt-5 flex justify-around gap-2 lg:justify-start lg:gap-6">
              <RoundAction icon={Phone} label="Appeler" href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : undefined} />
              <RoundAction icon={Mail} label="E-mail" href={contact.email ? `mailto:${contact.email}` : undefined} />
              <CopyAction phone={contact.phone} email={contact.email} />
            </div>
          </section>

          {/* Informations : un onglet sur téléphone, la colonne de gauche sur ordinateur */}
          <section className={cn("order-3 lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:shadow-soft", tab !== "infos" && "hidden lg:block")}>
            {editing
              ? <ContactEditForm contact={contact} onDone={() => setEditing(false)} />
              : <ContactInfo contact={contact} timezone={timezone} now={now} onEdit={() => setEditing(true)} />}
          </section>
        </div>

        <div className="contents lg:block">
          <div role="tablist" aria-label="Fiche du contact" className="order-2 -mx-4 flex border-b border-mk-line px-1 lg:mx-0 lg:gap-6 lg:px-0">
            {tabs.map((t) => {
              const on = tab === t.key, onDesktop = rightTab === t.key;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                  className={cn("-mb-px flex-1 border-b-2 px-2 pb-3 pt-1 text-[15px] font-semibold transition lg:flex-none lg:px-0 lg:text-[14px] lg:font-medium",
                    on ? "border-accent text-accent-2" : "border-transparent text-mk-sub hover:text-mk-strong",
                    t.key === "infos" && "lg:hidden",
                    onDesktop ? "lg:border-accent lg:text-accent-2" : "lg:border-transparent lg:text-mk-sub")}>
                  {t.label}{t.count ? <span className="ml-1.5 text-[13px] font-medium text-mk-sub tabular">{t.count}</span> : null}
                </button>
              );
            })}
          </div>
          <div className={cn("order-3 lg:mt-4", tab === "infos" && "hidden lg:block")}>
            {rightTab === "prospects" ? <ContactDeals deals={deals} canProspects={canProspects} timezone={timezone} /> : (
              <section className="lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:p-5 lg:shadow-soft">{history}</section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Rond cerclé + libellé (comme `MkRoundLink`), grisé quand l'information manque. */
const RoundAction = React.forwardRef<HTMLButtonElement, { icon: LucideIcon; label: string; href?: string; onClick?: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function RoundAction({ icon: Icon, label, href, onClick, ...rest }, ref) {
    const inner = (
      <>
        <span className="flex size-14 items-center justify-center rounded-full border border-mk-input bg-surface text-mk-icon transition group-hover:border-accent/60 group-hover:text-accent-2 group-active:scale-95 lg:size-12"><Icon className="size-6 lg:size-5" strokeWidth={1.7} /></span>
        <span className="text-[12px] font-medium text-mk-text">{label}</span>
      </>
    );
    const cls = "group flex w-[72px] flex-col items-center gap-2 rounded-xl py-1 disabled:pointer-events-none disabled:opacity-40";
    if (href) return <a href={href} className={cls}>{inner}</a>;
    return <button ref={ref} type="button" onClick={onClick} disabled={!onClick && !rest["aria-haspopup"]} className={cls} {...rest}>{inner}</button>;
  },
);

function CopyAction({ phone, email }: { phone: string | null; email: string | null }) {
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copié.`); } catch { toast.error("La copie n'est pas possible sur ce navigateur."); }
  };
  if (phone && email) {
    return (
      <Dropdown>
        <DropdownTrigger asChild><RoundAction icon={Copy} label="Copier" aria-haspopup="menu" /></DropdownTrigger>
        <DropdownContent align="center" className="min-w-[200px]">
          <DropdownItem onSelect={() => copy(phone, "Numéro")}><Phone />Copier le numéro</DropdownItem>
          <DropdownItem onSelect={() => copy(email, "E-mail")}><Mail />Copier l&apos;e-mail</DropdownItem>
        </DropdownContent>
      </Dropdown>
    );
  }
  const only = phone ?? email;
  return <RoundAction icon={Copy} label="Copier" onClick={only ? () => copy(only, phone ? "Numéro" : "E-mail") : undefined} />;
}

function ContactInfo({ contact, timezone, now, onEdit }: { contact: Contact; timezone: string; now: string; onEdit: () => void }) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Nom", value: contact.name },
    { label: "E-mail", value: contact.email ? <a href={`mailto:${contact.email}`} className="break-all hover:text-accent-2">{contact.email}</a> : null },
    { label: "Téléphone", value: contact.phone ? <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="hover:text-accent-2">{contact.phone}</a> : null },
    { label: "Entreprise", value: contact.company },
    { label: "Étiquettes", value: contact.tags?.length ? <span className="flex flex-wrap gap-1.5">{contact.tags.map((t) => <TagPill key={t} className="max-w-full">{t}</TagPill>)}</span> : null },
    { label: "Source", value: contact.source },
    { label: "Créé le", value: createdLabel(contact.created_at, timezone) },
    { label: "Dernière activité", value: contact.last_activity_at ? <>{agoLabel(contact.last_activity_at, now)}<span className="block text-[13px] text-mk-sub">{createdLabel(contact.last_activity_at, timezone)}</span></> : null },
  ];
  return (
    <div className="lg:p-5">
      <div className="flex items-center justify-end gap-3 pb-1 lg:justify-between">
        <h2 className="hidden text-[16px] font-semibold text-mk-strong lg:block">Informations</h2>
        <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-mk-input bg-surface px-3 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip [&_svg]:size-4"><Pencil />Modifier</button>
      </div>
      <dl className="divide-y divide-mk-line">
        {rows.map((r) => (
          <div key={r.label} className="py-3">
            <dt className="text-[13px] font-medium text-mk-sub">{r.label}</dt>
            <dd className="mt-0.5 text-[16px] text-mk-strong lg:text-[14px]">{r.value ?? <span className="text-mk-sub">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ContactEditForm({ contact, onDone }: { contact: Contact; onDone: () => void }) {
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ name: contact.name ?? "", email: contact.email ?? "", phone: contact.phone ?? "", company: contact.company ?? "", source: contact.source ?? "" });
  const [tags, setTags] = React.useState<string[]>(contact.tags ?? []);
  const [tried, setTried] = React.useState(false);
  const [suggest, setSuggest] = React.useState<{ tags: string[]; sources: string[] }>({ tags: [], sources: [] });
  const formId = React.useId(), sourcesId = React.useId();
  React.useEffect(() => { contactFacetsAction().then((r) => { if (r.ok) setSuggest({ tags: r.data.tags.map((t) => t.name), sources: r.data.sources.map((t) => t.name) }); }); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const email = f.email.trim(), phone = f.phone.trim();
  const errors = {
    email: email && !EMAIL_OK.test(email) ? "Cet e-mail n'est pas valide." : "",
    phone: phone && phone.replace(/\D/g, "").length < 8 ? "Ce numéro est trop court." : "",
    contact: !email && !phone ? "Garde au moins un e-mail ou un téléphone." : "",
  };
  const invalid = !!(errors.email || errors.phone || errors.contact);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault(); setTried(true);
    if (invalid) return;
    exec(() => updateContactAction(contact.id, { name: f.name, email, phone, company: f.company, source: f.source, tags }), { success: "Contact enregistré.", onSuccess: onDone });
  };
  return (
    <form id={formId} onSubmit={submit} noValidate className="space-y-4 lg:p-5">
      <MkHeaderActions>
        <button type="submit" form={formId} disabled={pending} className="h-10 rounded-full px-4 text-[16px] font-semibold text-accent-2 transition active:bg-mk-chip disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </MkHeaderActions>
      <h2 className="text-[17px] font-semibold text-mk-strong lg:text-[16px]">Modifier le contact</h2>
      <div><MkFieldLabel htmlFor={`${formId}-name`}>Nom</MkFieldLabel><input id={`${formId}-name`} value={f.name} onChange={set("name")} maxLength={160} autoComplete="off" className={MK_FIELD} /></div>
      <div>
        <MkFieldLabel htmlFor={`${formId}-email`}>E-mail</MkFieldLabel>
        <input id={`${formId}-email`} type="email" inputMode="email" value={f.email} onChange={set("email")} maxLength={254} autoComplete="off" aria-invalid={tried && !!errors.email} className={MK_FIELD} />
        {tried && errors.email ? <p className="mt-1 text-[13px] text-mk-danger">{errors.email}</p> : null}
      </div>
      <div>
        <MkFieldLabel htmlFor={`${formId}-phone`}>Téléphone</MkFieldLabel>
        <input id={`${formId}-phone`} type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} maxLength={40} autoComplete="off" aria-invalid={tried && !!errors.phone} className={MK_FIELD} />
        {tried && errors.phone ? <p className="mt-1 text-[13px] text-mk-danger">{errors.phone}</p> : null}
      </div>
      {tried && errors.contact ? <p className="text-[13px] text-mk-danger">{errors.contact}</p> : null}
      <div><MkFieldLabel htmlFor={`${formId}-company`}>Entreprise</MkFieldLabel><input id={`${formId}-company`} value={f.company} onChange={set("company")} maxLength={120} className={MK_FIELD} /></div>
      <div><MkFieldLabel htmlFor={`${formId}-tags`}>Étiquettes</MkFieldLabel><TagInput id={`${formId}-tags`} value={tags} onChange={setTags} suggestions={suggest.tags} /></div>
      <div>
        <MkFieldLabel htmlFor={`${formId}-source`}>Source</MkFieldLabel>
        <input id={`${formId}-source`} value={f.source} onChange={set("source")} maxLength={120} list={sourcesId} className={MK_FIELD} />
        <datalist id={sourcesId}>{suggest.sources.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <p className="text-[13px] text-mk-sub">Le nom et le téléphone sont aussi mis à jour sur les prospects de ce contact.</p>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className="h-11 flex-1 rounded-lg border border-mk-input bg-surface px-4 text-[15px] font-medium text-mk-text transition hover:bg-mk-chip lg:h-9 lg:flex-none lg:text-[14px]">Annuler</button>
        <button type="submit" disabled={pending} className="h-11 flex-1 rounded-lg bg-accent px-4 text-[15px] font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50 lg:h-9 lg:flex-none lg:text-[14px] lg:font-medium">{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}

function ContactDeals({ deals, canProspects, timezone }: { deals: ContactDeal[]; canProspects: boolean; timezone: string }) {
  const day = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: timezone }), [timezone]);
  if (!deals.length) return <MkEmpty>Aucun prospect pour ce contact.</MkEmpty>;
  return (
    <ul className="-mx-4 lg:mx-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:shadow-soft">
      {deals.map((d) => {
        const body = (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><Target className="size-5" strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1 border-b border-mk-line py-3.5 pr-1 group-last/deal:border-b-0">
              <span className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-mk-strong lg:text-[14px]">{d.title}</span>
                {d.value != null ? <span className="shrink-0 text-[15px] font-semibold text-mk-strong tabular lg:text-[14px]">{euro.format(d.value)}</span> : null}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <span className="inline-flex h-6 max-w-[60%] items-center gap-1.5 truncate rounded-full px-2.5 text-[12px] font-semibold" style={{ color: d.color, background: `color-mix(in oklab, ${d.color} 15%, transparent)` }}>
                  <span className="size-1.5 shrink-0 rounded-full bg-current" />{d.stage}
                </span>
                <span className="truncate text-[13px] text-mk-sub">créé le {day.format(new Date(d.created_at))}</span>
              </span>
            </span>
            {canProspects ? <ChevronRight className="size-5 shrink-0 text-mk-icon" /> : null}
          </>
        );
        const cls = "flex items-center gap-3.5 pl-4 pr-3 transition";
        return <li key={d.id} className="group/deal">{canProspects ? <Link href={`/marketing/crm/${d.id}`} className={cn(cls, "hover:bg-mk-chip/60 active:bg-mk-chip")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
      })}
    </ul>
  );
}
