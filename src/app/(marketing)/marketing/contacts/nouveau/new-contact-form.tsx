"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { MkHeaderActions } from "@/components/marketing/chrome";
import { MkFieldLabel } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { addContactAction, contactFacetsAction } from "@/lib/actions/marketing-contacts";
import { cn } from "@/lib/utils";
import { EMAIL_OK, MK_FIELD } from "../contact-ui";
import { TagInput } from "../tag-input";

/** « Ajouter un contact » : en-tête « Enregistrer » sur téléphone, formulaire centré sur ordinateur. */
export function NewContactForm({ sales }: { sales: boolean }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ firstName: "", lastName: "", email: "", phone: "", company: "", source: "" });
  const [tags, setTags] = React.useState<string[]>([]);
  const [tried, setTried] = React.useState(false);
  const [suggest, setSuggest] = React.useState<{ tags: string[]; sources: string[] }>({ tags: [], sources: [] });
  const formId = React.useId(), sourcesId = React.useId();
  React.useEffect(() => { contactFacetsAction().then((r) => { if (r.ok) setSuggest({ tags: r.data.tags.map((t) => t.name), sources: r.data.sources.map((t) => t.name) }); }); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const email = f.email.trim(), phone = f.phone.trim();
  const errors = {
    email: email && !EMAIL_OK.test(email) ? "Cet e-mail n'est pas valide." : "",
    phone: phone && phone.replace(/\D/g, "").length < 8 ? "Ce numéro est trop court." : "",
    contact: !email && !phone ? "Indique au moins un e-mail ou un téléphone." : "",
  };
  const invalid = !!(errors.email || errors.phone || errors.contact);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault(); setTried(true);
    if (invalid) { toast.error(errors.contact || errors.email || errors.phone); return; }
    exec(() => addContactAction({ ...f, tags }), {
      refresh: false,
      onSuccess: (r) => {
        if (r.created) toast.success("Contact ajouté.");
        else toast.info("Ce contact existait déjà (même e-mail ou téléphone) : sa fiche a été complétée, la voici.");
        router.push(`/marketing/contacts/${r.contactId}`);
        router.refresh();
      },
    });
  };
  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, error?: string, className?: string) => (
    <div className={className}>
      <MkFieldLabel htmlFor={`${formId}-${k}`} required={(k === "email" || k === "phone") && !email && !phone && tried}>{label}</MkFieldLabel>
      <input id={`${formId}-${k}`} value={f[k]} onChange={set(k)} aria-invalid={tried && (!!error || ((k === "email" || k === "phone") && !!errors.contact))} className={MK_FIELD} {...props} />
      {tried && error ? <p className="mt-1 text-[13px] text-mk-danger">{error}</p> : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <MkHeaderActions>
        <button type="submit" form={formId} disabled={pending} className="h-10 rounded-full px-4 text-[16px] font-semibold text-accent-2 transition active:bg-mk-chip disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </MkHeaderActions>
      <div className="mb-5 hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-8 text-mk-strong">Ajouter un contact</h1>
        <p className="mt-1 text-[14px] text-mk-sub">Si une fiche existe déjà avec cet e-mail ou ce téléphone, elle est complétée : jamais de doublon.</p>
      </div>
      <form id={formId} onSubmit={submit} noValidate className="lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:shadow-soft">
        <div className="space-y-4 lg:p-6">
          <p className={cn("flex items-start gap-2 rounded-lg bg-mk-chip px-3 py-2.5 text-[14px] text-mk-text", tried && errors.contact && "bg-mk-danger/10 text-mk-danger")}>
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            <span>Au moins un e-mail ou un téléphone.{sales ? " Un prospect est aussi ouvert à ton nom, pour que tu retrouves ce contact." : ""}</span>
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {field("firstName", "Prénom", { maxLength: 80, autoComplete: "off", autoFocus: true })}
            {field("lastName", "Nom", { maxLength: 80, autoComplete: "off" })}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {field("email", "E-mail", { type: "email", inputMode: "email", maxLength: 254, autoComplete: "off", placeholder: "nom@exemple.fr" }, errors.email)}
            {field("phone", "Téléphone", { type: "tel", inputMode: "tel", maxLength: 40, autoComplete: "off", placeholder: "06 12 34 56 78" }, errors.phone)}
          </div>
          {field("company", "Entreprise", { maxLength: 120, autoComplete: "off" })}
          <div><MkFieldLabel htmlFor={`${formId}-tags`}>Étiquettes</MkFieldLabel><TagInput id={`${formId}-tags`} value={tags} onChange={setTags} suggestions={suggest.tags} placeholder="Tape une étiquette puis Entrée ou une virgule" /></div>
          <div>
            {field("source", "Source", { maxLength: 120, autoComplete: "off", list: sourcesId, placeholder: "Ex. : Recommandation" })}
            <datalist id={sourcesId}>{suggest.sources.map((s) => <option key={s} value={s} />)}</datalist>
            <p className="mt-1 text-[13px] text-mk-sub">Vide : « manuel ».</p>
          </div>
        </div>
        <div className="hidden items-center justify-end gap-2 border-t border-mk-line px-6 py-4 lg:flex">
          <Link href="/marketing/contacts" className="inline-flex h-9 items-center rounded-lg border border-mk-input bg-surface px-4 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip">Annuler</Link>
          <button type="submit" disabled={pending} className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </div>
  );
}
