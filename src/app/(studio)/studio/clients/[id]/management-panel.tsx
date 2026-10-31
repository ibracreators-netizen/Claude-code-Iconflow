"use client";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import type { ClientManagement, ManagementStage, PipelineStage } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { useAction } from "@/lib/hooks/use-action";
import { saveManagement } from "@/lib/actions/clients";
import { STAGE_DOT } from "../_components/stage-badge";

/** Suivi agence d'un client : étape du pipeline (étapes personnalisables) et note interne, avec révision optimiste. */
export function ManagementPanel({ clientId, management, updatedBy, stages }: { clientId: string; management: ClientManagement; updatedBy: string | null; stages: PipelineStage[] }) {
  const { exec, pending } = useAction();
  const [stage, setStage] = useState<ManagementStage>(management.stage);
  const [notes, setNotes] = useState(management.notes);
  const dirty = stage !== management.stage || notes !== management.notes;
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await exec(() => saveManagement(clientId, stage, notes, management.revision), { success: "Suivi enregistré" });
    if (!res.ok) setError(res.error);
  }

  return (
    <Card>
      <CardHeader title="Suivi agence" description={<span className="inline-flex items-center gap-1"><Lock className="size-3" />Privé · jamais visible du client</span>} />
      <CardBody className="space-y-3">
        {stages.length ? (
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Étape du pipeline">
            {stages.map((s) => (
              <button key={s.key} type="button" onClick={() => setStage(s.key)} aria-pressed={stage === s.key}
                className={cn("flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition", stage === s.key ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>
                <span className={cn("size-1.5 shrink-0 rounded-full", STAGE_DOT[s.color] ?? STAGE_DOT.neutral)} aria-hidden /><span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        ) : <p className="text-[12.5px] text-muted">Aucune étape dans le pipeline : ajoute-en une depuis « Gérer les étapes ».</p>}
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} maxLength={20000} placeholder="Notes internes : objectifs, points d'attention, prochaines étapes…" />
        {error ? <p className="text-[12.5px] text-danger" role="alert">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          {/* Le délai relatif dépend de l'heure de rendu : serveur et navigateur peuvent différer d'une seconde. */}
          <p className="text-[11.5px] text-muted" suppressHydrationWarning>{management.revision ? `Révision ${management.revision} · ${fmt.relative(management.updated_at)}${updatedBy ? ` · ${updatedBy}` : ""}` : "Jamais enregistré"}</p>
          <div className="flex gap-2">
            {dirty ? <Button variant="ghost" size="sm" onClick={() => { setStage(management.stage); setNotes(management.notes); setError(null); }}>Annuler</Button> : null}
            <Button size="sm" disabled={!dirty} loading={pending} onClick={save}>Enregistrer</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
