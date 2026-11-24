"use client";
import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/lib/hooks/use-action";
import { saveGoogleCallsSettingAction } from "@/lib/actions/marketing-google";
import { cn } from "@/lib/utils";

/**
 * Interrupteur « Créer un prospect pour chaque appel de l'agenda Google ». Modifiable par l'administrateur seulement.
 * `unavailable` : Google ne peut pas tourner (pas configuré, pas de base) ; le réglage reste modifiable, mais on le dit.
 */
export function GoogleCallsToggle({ enabled, canEdit, help, lastRun, unavailable = null }: { enabled: boolean; canEdit: boolean; help: string; lastRun: string | null; unavailable?: string | null }) {
  const { exec, pending } = useAction();
  const [on, setOn] = React.useState(enabled);
  const id = React.useId();
  const change = (v: boolean) => {
    setOn(v);
    void exec(() => saveGoogleCallsSettingAction(v), { success: v ? "Les appels de l'agenda Google deviennent des prospects." : "Plus aucun prospect ne sera créé depuis l'agenda Google." })
      .then((r) => { if (!r.ok) setOn(!v); });
  };
  return (
    <div className="flex items-start gap-4 rounded-[10px] border border-mk-line px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn("block text-[14px] font-medium text-mk-strong", canEdit && "cursor-pointer")}>Créer un prospect pour chaque appel de l&apos;agenda Google</label>
        <p id={`${id}-aide`} className="mt-1 text-[13px] leading-snug text-mk-sub">{help}</p>
        {unavailable ? <p className="mt-1.5 text-[13px] leading-snug text-mk-warn">{unavailable}</p> : null}
        {canEdit ? null : <p className="mt-1.5 text-[13px] text-mk-sub">Seul l&apos;administrateur peut changer ce réglage.</p>}
        {lastRun ? <p className="mt-1.5 text-[13px] text-mk-text">{lastRun}</p> : null}
      </div>
      <Switch id={id} className="mt-0.5" checked={on} disabled={!canEdit || pending} onCheckedChange={change} aria-describedby={`${id}-aide`} />
    </div>
  );
}
