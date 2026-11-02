"use client";
import * as React from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/hooks/use-action";
import { processOutboxNow } from "@/lib/actions/marketing";

export function ProcessNow() {
  const { exec, pending } = useAction();
  const run = () => exec(() => processOutboxNow(), {
    success: undefined,
    onSuccess: (s) => {
      if (!s.ran) { toast.error(s.reason === "service_key_missing" ? "Clé service absente : le worker ne peut pas tourner." : `File non traitée : ${s.reason ?? ""}`); return; }
      const bits = [`${s.claimed} réclamé${s.claimed > 1 ? "s" : ""}`];
      if (s.simulated) bits.push(`${s.simulated} simulé${s.simulated > 1 ? "s" : ""}`);
      if (s.sent) bits.push(`${s.sent} envoyé${s.sent > 1 ? "s" : ""}`);
      if (s.cancelled) bits.push(`${s.cancelled} annulé${s.cancelled > 1 ? "s" : ""}`);
      if (s.failed) bits.push(`${s.failed} en échec`);
      if (s.uncertain) bits.push(`${s.uncertain} incertain${s.uncertain > 1 ? "s" : ""}`);
      toast[s.live ? "success" : "message"](`${s.live ? "File traitée" : "Simulation (DRY RUN)"} · ${bits.join(" · ")}`);
    },
  });
  return <Button size="sm" variant="secondary" loading={pending} onClick={run}><Play />Traiter la file maintenant</Button>;
}
