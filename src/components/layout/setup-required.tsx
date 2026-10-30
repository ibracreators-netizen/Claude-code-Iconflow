import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { explainInfra, parseInfraDigest } from "@/lib/infra-errors";
import type { SetupCheck } from "@/lib/supabase/diagnostics";
import { buttonVariants } from "@/components/ui/button";

/**
 * Écran affiché à la place de l'espace quand la base Supabase n'est pas prête :
 * ce qui manque exactement, la migration à exécuter, l'état de chaque étape.
 */
export function SetupRequired({ digest, checks, retryHref }: { digest: string; checks: SetupCheck[]; retryHref: string }) {
  const info = parseInfraDigest(digest);
  const explanation = info ? explainInfra(info) : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-5 py-12">
      <div className="w-full max-w-[640px] animate-rise">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/brand/iconflow-logo-96.png" alt="" width={36} height={36} className="rounded-lg bg-[#0b100c]" priority />
          <span className="text-lg font-semibold tracking-tight">iconflow<span className="text-accent-2">.</span></span>
        </div>
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-warning"><AlertTriangle className="size-3.5" />Installation à terminer</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">{explanation?.title ?? "La base de données n'est pas prête"}</h1>
        <p className="mt-2 text-[14.5px] text-fg-2">{explanation?.description ?? "Une requête vers Supabase a échoué pendant le chargement de l'espace."}</p>
        {explanation ? <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[14px] text-fg-2">{explanation.steps.map((s) => <li key={s}>{s}</li>)}</ol> : null}

        <section className="mt-7 rounded-2xl bg-surface p-5 shadow-soft hairline">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">État de l&apos;installation</h2>
          <ul className="mt-3 divide-y divide-border">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-2.5 text-[13.5px]">
                {c.ok === true ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : c.ok === false ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" />}
                <div className="min-w-0 flex-1">
                  <p className={c.ok === false ? "font-medium" : ""}>{c.label}{!c.required ? <span className="ml-2 text-[11.5px] text-muted">optionnel</span> : null}</p>
                  {c.detail && c.ok !== true ? <p className="mt-0.5 break-words font-mono text-[11.5px] text-muted">{c.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted">Les scripts sont dans le dossier <code className="font-mono">supabase/migrations</code> du dépôt. Le guide complet : <code className="font-mono">docs/SETUP.md</code>. Référence technique : <code className="font-mono">{digest}</code></p>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={retryHref} className={buttonVariants({ variant: "primary", size: "lg" })}>Réessayer</Link>
          <form action="/auth/signout" method="post"><button type="submit" className={buttonVariants({ variant: "secondary", size: "lg" })}>Se déconnecter</button></form>
        </div>
      </div>
    </main>
  );
}
