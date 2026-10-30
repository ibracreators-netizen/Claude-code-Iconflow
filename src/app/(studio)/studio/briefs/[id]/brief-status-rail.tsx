"use client";
import * as React from "react";
import { Check, RotateCcw, Send, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { transitionBrief } from "@/lib/actions/briefs";
import { BRIEF_FLOW, BRIEF_STATUS, briefTransition, type Brief, type BriefStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function BriefStatusRail({ brief }: { brief: Brief }) {
  const { exec, pending } = useAction();
  const [confirm, setConfirm] = React.useState<null | { next: BriefStatus; title: string; description: string; label: string; danger?: boolean }>(null);
  const next = briefTransition("agency", brief);
  const stepIndex = brief.status === "archived" ? -1 : BRIEF_FLOW.indexOf(brief.status);
  const nextLabel = next === "attente_ibra" ? "Soumettre au contrôle Ibra" : next === "attente_client" ? "Valider Ibra · proposer au client" : next === "valide" ? "Valider le brief statique · Ibra" : null;
  const explain = brief.status === "valide" ? (brief.kind === "statique" ? "Brief statique validé par Ibra." : "Ce script a terminé son circuit de validation.")
    : brief.status === "attente_client" ? "Contrôle Ibra terminé · le client peut valider ou demander une correction."
    : brief.status === "attente_ibra" ? (brief.kind === "statique" ? "Le brief statique est visible du client, mais seule l'agence le valide." : "Ibra valide le script avant sa présentation au client.")
    : brief.status === "archived" ? "Ce brief est dans la corbeille. Sa restauration le remet en rédaction." : "En rédaction : invisible du client tant qu'il n'est pas soumis.";

  const go = (next: BriefStatus, success: string) => exec(() => transitionBrief(brief.id, next), { success, onSuccess: () => setConfirm(null) });

  return (
    <Card>
      <CardHeader title="Circuit de validation" description={explain} />
      <CardBody className="space-y-4">
        <ol className="space-y-1.5">
          {BRIEF_FLOW.filter((s) => brief.kind === "video" || s !== "attente_client").map((s) => {
            const i = BRIEF_FLOW.indexOf(s);
            const done = stepIndex > i, current = stepIndex === i;
            return (
              <li key={s} className={cn("flex items-center gap-2.5 text-[13px]", done ? "text-muted" : current ? "text-fg font-medium" : "text-muted-2")}>
                <span className={cn("flex size-5 items-center justify-center rounded-full border text-[10px]", done ? "border-accent bg-accent text-accent-fg" : current ? "border-accent text-accent-2" : "border-border")}>{done ? <Check className="size-3" /> : i + 1}</span>
                {BRIEF_STATUS[s]}
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 border-t border-border pt-4">
          {nextLabel && next ? (
            <Button className="w-full" loading={pending} onClick={() => next === "attente_ibra" ? go("attente_ibra", "Soumis au contrôle Ibra.") : setConfirm({ next, title: next === "valide" ? "Valider ce brief statique ?" : "Proposer ce script au client ?", description: `${brief.title} · script-v${brief.script_version}. Confirme après relecture complète : cette décision est enregistrée dans l'historique.`, label: "Confirmer la validation" })}>
              {next === "attente_ibra" ? <Send /> : <ShieldCheck />}{nextLabel}
            </Button>
          ) : null}
          {brief.status === "attente_ibra" || brief.status === "attente_client" ? (
            <Button variant="secondary" className="w-full" loading={pending} onClick={() => go("redaction", "Brief renvoyé en rédaction.")}><Undo2 />Renvoyer en rédaction</Button>
          ) : null}
          {brief.status === "archived" ? (
            <Button variant="secondary" className="w-full" loading={pending} onClick={() => go("redaction", "Brief restauré · en rédaction.")}><RotateCcw />Restaurer le brief</Button>
          ) : (
            <Button variant="ghost" className="w-full text-muted hover:text-danger" onClick={() => setConfirm({ next: "archived", title: "Mettre ce brief à la corbeille ?", description: "Le contenu reste conservé. Tu pourras le restaurer depuis la corbeille du mois ; il reviendra en rédaction.", label: "Mettre à la corbeille", danger: true })}><Trash2 />Mettre à la corbeille</Button>
          )}
        </div>
      </CardBody>
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={confirm?.title ?? ""} description={confirm?.description} confirmLabel={confirm?.label} danger={confirm?.danger} loading={pending}
        onConfirm={() => { if (confirm) go(confirm.next, confirm.next === "archived" ? "Brief mis à la corbeille." : confirm.next === "valide" ? "Brief statique validé." : "Script proposé au client."); }} />
    </Card>
  );
}
