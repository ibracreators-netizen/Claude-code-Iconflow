"use client";
import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { setAgencyAdAccountAction, syncAgencyAdsAction } from "@/lib/actions/marketing";

/** Administrateur : désigner le compte Meta Ads de l'agence parmi ceux déjà connectés, et relancer la lecture. */
export function AdAccountPicker({ choices, current, lastSync, lastError }: { choices: Array<{ integration_id: string; label: string }>; current: string | null; lastSync: string | null; lastError: string | null }) {
  const { exec, pending } = useAction();
  const [value, setValue] = React.useState(current ?? "");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Compte Meta Ads de l'agence" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-72 max-w-full"><option value="">Aucun compte choisi</option>{choices.map((c) => <option key={c.integration_id} value={c.integration_id}>{c.label}</option>)}</NativeSelect>
        <Button size="sm" loading={pending} disabled={value === (current ?? "")} onClick={() => exec(() => setAgencyAdAccountAction(value || null), { success: value ? "Compte de l'agence enregistré. Première lecture lancée." : "Compte retiré." })}>Enregistrer</Button>
        <Button size="sm" variant="secondary" loading={pending} disabled={!current} onClick={() => exec(() => syncAgencyAdsAction(), { success: "Dépenses relues." })}><RefreshCw />Synchroniser</Button>
      </div>
      <p className="text-[12.5px] text-muted">Dernière lecture : {lastSync ?? "jamais"}.{lastError ? <span className="block text-warning">{lastError}</span> : null}</p>
    </div>
  );
}
