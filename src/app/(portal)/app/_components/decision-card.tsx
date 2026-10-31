"use client";
import * as React from "react";
import { CheckCircle2, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import type { ActionResult } from "@/lib/actions/result";

/** Carte de décision client (script ou livrable) : valider / demander une correction. */
export function DecisionCard({ title, description, onValidate, onCorrection, validateLabel = "Valider", correctionLabel = "Demander une correction" }: {
  title: string; description: string;
  onValidate: () => Promise<ActionResult<unknown>>;
  onCorrection: (comment: string) => Promise<ActionResult<unknown>>;
  validateLabel?: string; correctionLabel?: string;
}) {
  const { exec, pending } = useAction();
  const [confirm, setConfirm] = React.useState<"valide" | "correction" | null>(null);
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-accent/15 blur-2xl" />
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-2"><span className="size-1.5 rounded-full bg-accent animate-pulse-soft" />Votre décision est attendue</div>
      <h3 className="mt-2 text-[16px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-[13px] text-muted">{description}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={() => setConfirm("valide")} loading={pending}><CheckCircle2 />{validateLabel}</Button>
        <Button size="lg" variant="secondary" onClick={() => setConfirm("correction")} disabled={pending}><MessageSquareWarning />{correctionLabel}</Button>
      </div>
      <ConfirmDialog open={confirm === "valide"} onOpenChange={(o) => !o && setConfirm(null)} title="Confirmer la validation ?" description="Confirmez après avoir relu l'élément. Cette décision est enregistrée dans l'historique." confirmLabel="Je valide" loading={pending}
        onConfirm={async () => { const r = await exec(onValidate, { success: "Validation enregistrée. Merci !" }); if (r.ok) setConfirm(null); }} />
      <ConfirmDialog open={confirm === "correction"} onOpenChange={(o) => !o && setConfirm(null)} title="Demander une correction" description="Expliquez ce que vous souhaitez modifier : l'équipe reprend la main et vous propose une nouvelle version." confirmLabel="Envoyer la demande" withComment commentLabel="Ce que tu souhaites changer" loading={pending}
        onConfirm={async (c) => { const r = await exec(() => onCorrection(c), { success: "Demande de correction envoyée." }); if (r.ok) setConfirm(null); }} />
    </div>
  );
}
