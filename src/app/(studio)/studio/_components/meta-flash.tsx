import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { META_FLOW_ERRORS } from "@/lib/integrations/meta";

/**
 * Bandeau de retour du parcours OAuth Meta (`/studio?meta=ok&client=…&comptes=N` ou `?meta=erreur=<raison>`).
 * Rien n'est affiché sans paramètre.
 */
export function MetaFlash({ meta, comptes, clientName }: { meta?: string; comptes?: string; clientName?: string | null }) {
  if (!meta) return null;
  const ok = meta === "ok";
  const reason = meta.startsWith("erreur=") ? meta.slice(7) : meta === "erreur" ? "" : null;
  if (!ok && reason === null) return null;
  const n = Number(comptes ?? 0);
  const text = ok
    ? `Compte Meta connecté${clientName ? ` pour ${clientName}` : ""}. Les 13 dernières semaines ont été lues${n > 1 ? ` · ${n} comptes publicitaires sont visibles : vérifie celui à utiliser (menu ⋯ → Changer de compte publicitaire)` : ""}.`
    : META_FLOW_ERRORS[reason ?? ""] ?? "La connexion Meta n'a pas abouti. Réessaie depuis la carte « Connexions Meta Ads ».";
  return (
    <div role="status" className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] ${ok ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
      <p className="flex-1 text-fg-2">{text}</p>
      <Link href="/studio" className="shrink-0 text-[12.5px] font-medium text-muted hover:text-fg">Fermer</Link>
    </div>
  );
}
