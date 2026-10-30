"use client";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { MANAGEMENT_ORDER, MANAGEMENT_STAGE, type ClientManagement, type ManagementStage } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { useAction } from "@/lib/hooks/use-action";
import { saveManagement } from "@/lib/actions/clients";

export function ManagementPanel({ clientId, management, updatedBy }: { clientId: string; management: ClientManagement; updatedBy: string | null }) {
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
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
          {MANAGEMENT_ORDER.map((s) => (
            <button key={s} type="button" onClick={() => setStage(s)} aria-pressed={stage === s} className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition ${stage === s ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg"}`}>{MANAGEMENT_STAGE[s]}</button>
          ))}
        </div>
        <NativeSelect value={stage} onChange={(e) => setStage(e.target.value as ManagementStage)} className="sr-only" aria-label="Étape">{MANAGEMENT_ORDER.map((s) => <option key={s} value={s}>{MANAGEMENT_STAGE[s]}</option>)}</NativeSelect>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} maxLength={20000} placeholder="Notes internes : objectifs, points d'attention, prochaines étapes…" />
        {error ? <p className="text-[12.5px] text-danger" role="alert">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-muted">{management.revision ? `Révision ${management.revision} · ${fmt.relative(management.updated_at)}${updatedBy ? ` · ${updatedBy}` : ""}` : "Jamais enregistré"}</p>
          <div className="flex gap-2">
            {dirty ? <Button variant="ghost" size="sm" onClick={() => { setStage(management.stage); setNotes(management.notes); setError(null); }}>Annuler</Button> : null}
            <Button size="sm" disabled={!dirty} loading={pending} onClick={save}>Enregistrer</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
