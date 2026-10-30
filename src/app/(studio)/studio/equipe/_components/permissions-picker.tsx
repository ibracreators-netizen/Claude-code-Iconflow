"use client";
import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { ALWAYS_ALLOWED, STUDIO_MODULES } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Sélecteur de droits par module : « Accès complet » ou liste de modules cochés.
 * `grantable` : modules que l'administrateur connecté peut accorder (null = tous). Un membre à droits
 * limités ne peut ni donner l'accès complet, ni ajouter un module qu'il n'a pas ; il peut toujours en retirer.
 */
export function PermissionsPicker({ value, onChange, disabled, grantable = null }: { value: string[] | null; onChange: (v: string[] | null) => void; disabled?: boolean; grantable?: string[] | null }) {
  const full = value === null;
  const set = new Set(value ?? []);
  const limited = Array.isArray(grantable);
  const canToggle = (key: string) => !limited || grantable.includes(key) || set.has(key);
  const toggle = (key: string) => {
    if (full || !canToggle(key)) return;
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(STUDIO_MODULES.map((m) => m.key).filter((k) => next.has(k) || ALWAYS_ALLOWED.includes(k)));
  };
  return (
    <div className="space-y-3">
      {limited ? (
        <p className="rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 text-[12.5px] text-muted">Tu peux accorder uniquement les modules que tu possèdes. L&apos;accès complet se donne par un administrateur à accès complet.</p>
      ) : (
        <label className={cn("flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 px-3.5 py-3", disabled && "opacity-60")}>
          <span><span className="block text-[13.5px] font-medium">Accès complet</span><span className="block text-[12px] text-muted">Tous les modules, y compris la facturation et l&apos;équipe. Administrateur : peut gérer tous les comptes.</span></span>
          <Switch checked={full} disabled={disabled} onCheckedChange={(c) => onChange(c ? null : STUDIO_MODULES.filter((m) => "always" in m).map((m) => m.key))} aria-label="Accès complet" />
        </label>
      )}
      <div className={cn("grid gap-1.5 sm:grid-cols-2", full && "pointer-events-none opacity-50")} aria-disabled={full}>
        {STUDIO_MODULES.map((m) => {
          const locked = ALWAYS_ALLOWED.includes(m.key);
          const checked = full || locked || set.has(m.key);
          const unavailable = !locked && !canToggle(m.key);
          return (
            <label key={m.key} title={unavailable ? "Tu n'as pas ce module toi-même." : undefined} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px] transition", checked ? "bg-accent-soft/60 border-accent/30" : "hover:bg-surface-2", (locked || disabled || unavailable) && "cursor-default", unavailable && "opacity-50")}>
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={checked} disabled={locked || disabled || full || unavailable} onChange={() => toggle(m.key)} aria-label={m.label} />
              <span className="flex-1">{m.label}</span>
              {locked ? <span className="text-[11px] text-muted">toujours</span> : unavailable ? <span className="text-[11px] text-muted">non détenu</span> : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}
