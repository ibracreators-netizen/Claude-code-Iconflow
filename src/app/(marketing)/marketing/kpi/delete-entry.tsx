"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { deleteKpiEntryAction } from "@/lib/actions/marketing-kpi-links";

/** Corbeille d'une ligne du suivi du jour (administrateur) : confirmation, puis suppression de la saisie. */
export function DeleteKpiEntry({ kind, entryId, label }: { kind: "membre" | "lien"; entryId: string; label: string }) {
  const [open, setOpen] = React.useState(false);
  const { exec, pending } = useAction();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Supprimer la saisie : ${label}`} title="Supprimer cette saisie"
        className="inline-flex size-8 items-center justify-center rounded-[8px] text-mk-icon transition hover:bg-mk-danger/10 hover:text-mk-danger">
        <Trash2 className="size-4" />
      </button>
      <ConfirmDialog open={open} onOpenChange={setOpen} danger loading={pending} confirmLabel="Supprimer"
        title="Supprimer cette saisie ?" description={`${label}. Les chiffres disparaissent des KPI et du tableau de bord. C'est définitif.`}
        onConfirm={async () => { await exec(() => deleteKpiEntryAction(kind, entryId), { success: "Saisie supprimée.", onSuccess: () => setOpen(false) }); }} />
    </>
  );
}
