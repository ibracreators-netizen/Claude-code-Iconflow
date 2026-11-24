"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { setContractEnd } from "@/lib/actions/clients";

/** Date de fin d'engagement, modifiable sur place. Vide : sans date de fin. */
export function ContractEnd({ clientId, name, value }: { clientId: string; name: string; value: string | null }) {
  const { exec, pending } = useAction();
  const [date, setDate] = React.useState(value ?? "");
  const save = (next: string) => { setDate(next); exec(() => setContractEnd(clientId, next || null), { success: next ? "Fin de contrat enregistrée." : "Fin de contrat retirée." }).then((r) => { if (!r.ok) setDate(value ?? ""); }); };
  return <Input type="date" aria-label={`Fin de contrat de ${name}`} value={date} disabled={pending} onChange={(e) => save(e.target.value)} className="h-9 w-[150px]" />;
}
