"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { explainInfra, parseInfraDigest } from "@/lib/infra-errors";

/**
 * Page d'erreur globale. En production, React masque le message d'une erreur serveur mais
 * transmet son `digest` : quand il porte une étiquette d'infrastructure (« IF|… »), on dit
 * exactement quoi faire ; sinon on donne la référence à transmettre.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const infra = parseInfraDigest(error.digest);
  const explanation = infra ? explainInfra(infra) : null;
  const serverMasked = /Minified React error #441/.test(error.message);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-danger"><AlertTriangle className="size-3.5" />{explanation ? "Installation à terminer" : "Erreur"}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{explanation?.title ?? "Quelque chose s'est mal passé"}</h1>
      {explanation ? (
        <div className="max-w-lg space-y-3 text-left text-[14px] text-fg-2">
          <p className="text-center">{explanation.description}</p>
          <ol className="list-decimal space-y-1.5 pl-5">{explanation.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      ) : (
        <p className="max-w-md text-[14px] text-muted">
          {serverMasked ? "Le serveur n'a pas pu préparer cette page. Le détail est dans les journaux de l'hébergeur (Vercel → Logs)." : error.message || "Réessaie dans un instant."}
        </p>
      )}
      {error.digest ? <p className="text-[11.5px] text-muted-2">Référence : <code className="font-mono">{error.digest}</code></p> : null}
      <div className="flex gap-2"><Button onClick={reset}>Réessayer</Button><Link href="/login" className={buttonVariants({ variant: "secondary" })}>Retour à la connexion</Link></div>
    </main>
  );
}
