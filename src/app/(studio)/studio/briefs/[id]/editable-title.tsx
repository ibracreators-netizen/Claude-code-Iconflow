"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Titre modifiable en ligne : affichage cliquable (double-clic pour éditer), champ de saisie à la demande.
 * Entrée ou sortie du champ enregistre, Échap annule. Le parent pilote `editing` (crayon, double-clic…).
 */
export function EditableTitle({ value, editing, onEditingChange, onCommit, onClick, className, inputClassName, label = "Titre", wrap }: {
  value: string; editing: boolean; onEditingChange: (editing: boolean) => void; onCommit: (title: string) => void;
  onClick?: () => void; className?: string; inputClassName?: string; label?: string;
  /** Deux lignes maximum au lieu d'une ligne tronquée (en-tête de l'éditeur). */
  wrap?: boolean;
}) {
  if (!editing) {
    return (
      <button type="button" onClick={onClick} onDoubleClick={() => onEditingChange(true)} className={cn("block min-w-0 max-w-full text-left", className)} title={`${value} — double-clic pour renommer`}>
        <span className={wrap ? "line-clamp-2 break-words" : "block truncate"}>{value}</span>
      </button>
    );
  }
  return <TitleInput value={value} label={label} className={inputClassName} onDone={(title) => { onEditingChange(false); if (title && title !== value) onCommit(title); }} />;
}

/** Monté seulement pendant l'édition : son état part toujours de la valeur courante. */
function TitleInput({ value, label, className, onDone }: { value: string; label: string; className?: string; onDone: (title: string | null) => void }) {
  const [draft, setDraft] = React.useState(value);
  const done = React.useRef(false);
  const finish = (save: boolean) => { if (done.current) return; done.current = true; onDone(save ? draft.trim() : null); };
  return (
    <input
      autoFocus value={draft} maxLength={120} aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); } }}
      onBlur={() => finish(true)}
      className={cn("h-7 w-full min-w-0 rounded-md border border-accent/60 bg-surface px-2 text-[13px] text-fg focus:outline-none focus:ring-2 focus:ring-accent/25", className)}
    />
  );
}
