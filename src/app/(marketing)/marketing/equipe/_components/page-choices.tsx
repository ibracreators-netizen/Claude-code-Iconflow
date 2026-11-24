"use client";
import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { NO_PAGE, SALES_PAGE_CHOICES } from "@/lib/marketing/invite-errors";
import { cn } from "@/lib/utils";
import { CHECKBOX } from "../../reglages/kit";

const ALL = SALES_PAGE_CHOICES.map((p) => p.key);
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));
const LINK = "inline-flex h-8 items-center font-medium text-accent-2 hover:underline disabled:opacity-50";

/**
 * « Pages auxquelles il a accès » : une case par page qu'un compte Setter, Closer ou Media buyer peut recevoir, avec une ligne
 * d'explication. La même dans la fenêtre « Inviter un membre » et dans Réglages › Équipe et accès.
 * `defaults` : les pages du rôle (lien « Valeurs du rôle »). Aucune case cochée : le message le dit, l'appelant bloque l'envoi.
 * Le serveur refiltre toujours la liste (assignablePages) : une case ne donne jamais plus que ce qu'un commercial peut recevoir.
 */
export function PageChoices({ value, onChange, defaults, note, title = "Pages auxquelles il a accès", disabled }: {
  value: string[]; onChange: (pages: string[]) => void; defaults?: string[]; note?: React.ReactNode; title?: string; disabled?: boolean;
}) {
  const id = React.useId();
  const picked = ALL.filter((k) => value.includes(k));
  const allOn = picked.length === ALL.length;
  const roleValues = defaults ? ALL.filter((k) => defaults.includes(k)) : null;
  const offRole = !!roleValues && !sameSet(picked, roleValues);
  const toggle = (key: string, on: boolean) => onChange(ALL.filter((k) => (k === key ? on : picked.includes(k))));

  return (
    <div role="group" aria-labelledby={`${id}-t`} aria-describedby={note ? `${id}-n` : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p id={`${id}-t`} className="text-[14px] font-medium text-mk-text">{title}<span className="ml-0.5 text-mk-required" aria-hidden>*</span></p>
        <span className="flex items-center gap-2 text-[13px]">
          {!allOn ? <button type="button" className={LINK} disabled={disabled} onClick={() => onChange([...ALL])}>Tout cocher</button> : null}
          {!allOn && offRole ? <span className="text-mk-sub" aria-hidden>·</span> : null}
          {offRole && roleValues ? <button type="button" className={LINK} disabled={disabled} onClick={() => onChange([...roleValues])}>Valeurs du rôle</button> : null}
        </span>
      </div>
      {note ? <p id={`${id}-n`} className="text-[13px] leading-snug text-mk-sub">{note}</p> : null}
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {SALES_PAGE_CHOICES.map((p) => {
          const on = picked.includes(p.key);
          return (
            <label key={p.key} className={cn("flex min-h-[52px] items-start gap-3 rounded-[10px] border px-3 py-2.5 transition-colors",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              on ? "border-accent/50 bg-accent-soft/40" : "border-mk-line hover:border-mk-input hover:bg-surface-2")}>
              <input type="checkbox" className={cn(CHECKBOX, "mt-px")} checked={on} disabled={disabled} onChange={(e) => toggle(p.key, e.target.checked)} />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium leading-snug text-mk-strong">{p.label}</span>
                {p.hint ? <span className="mt-0.5 block text-[13px] leading-snug text-mk-sub">{p.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {picked.length === 0 ? (
        <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-[13px] leading-snug text-mk-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span><b className="font-semibold">{NO_PAGE.title}</b> {NO_PAGE.help}</span>
        </p>
      ) : null}
    </div>
  );
}
