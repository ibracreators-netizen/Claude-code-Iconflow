"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Saisie d'étiquettes en pastilles : Entrée ou virgule valide, retour arrière retire la dernière.
 * Les étiquettes déjà utilisées sont proposées pendant la frappe.
 */
export function TagInput({ value, onChange, suggestions = [], id, placeholder = "Ajouter une étiquette", className, inputClassName }: {
  value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; id?: string; placeholder?: string; className?: string; inputClassName?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();
  const add = (raw: string) => {
    const next = [...value];
    for (const part of raw.split(/[,;]/)) { const t = part.replace(/\s+/g, " ").trim().slice(0, 40); if (t && !next.includes(t)) next.push(t); }
    if (next.length !== value.length) onChange(next.slice(0, 30));
    setDraft("");
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));
  return (
    <div className={cn("flex min-h-12 flex-wrap items-center gap-1.5 rounded-[10px] border border-mk-input bg-surface px-2.5 py-2 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 lg:min-h-10 lg:rounded-lg lg:py-1.5", className)}>
      {value.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-mk-chip pl-2.5 pr-1 text-[13px] font-medium text-mk-text">
          {t}
          <button type="button" onClick={() => remove(t)} aria-label={`Retirer l'étiquette ${t}`} className="inline-flex size-5 items-center justify-center rounded-full text-mk-sub transition hover:bg-mk-strip hover:text-mk-strong">×</button>
        </span>
      ))}
      <input id={id} value={draft} list={suggestions.length ? listId : undefined} placeholder={value.length ? "" : placeholder}
        onChange={(e) => { const v = e.target.value; if (/[,;]/.test(v)) add(v); else setDraft(v); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && value.length) remove(value[value.length - 1]);
        }}
        onBlur={() => { if (draft.trim()) add(draft); }}
        className={cn("h-8 min-w-[120px] flex-1 bg-transparent px-1 text-[16px] text-mk-strong outline-none placeholder:text-mk-sub lg:text-[14px]", inputClassName)} />
      {suggestions.length ? <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist> : null}
    </div>
  );
}
