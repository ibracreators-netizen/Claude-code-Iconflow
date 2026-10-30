import { Lock } from "lucide-react";
import { STUDIO_MODULES } from "@/lib/permissions";

export function RefusedBanner({ module }: { module: string }) {
  const label = STUDIO_MODULES.find((m) => m.key === module)?.label ?? module;
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px]">
      <Lock className="mt-0.5 size-4 shrink-0 text-warning" />
      <div><p className="font-medium">Accès refusé à « {label} »</p><p className="text-muted">Ce module n&apos;est pas inclus dans tes droits. Demande à un administrateur de l&apos;agence de l&apos;activer depuis Équipe &amp; accès.</p></div>
    </div>
  );
}
