"use client";
import { DecisionCard } from "../../_components/decision-card";
import { decideScript } from "@/lib/actions/portal";

export function BriefDecision({ id }: { id: string }) {
  return <DecisionCard title="Ce script vous convient-il ?" description="Relisez le concept, les hooks et le corps du script. En validant, vous lancez le tournage. Sinon, dites-nous ce qui doit changer." validateLabel="Valider le script"
    onValidate={() => decideScript(id, "valide")} onCorrection={(c) => decideScript(id, "correction", c)} />;
}
