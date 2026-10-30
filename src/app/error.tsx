"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-danger">Erreur</p>
      <h1 className="text-2xl font-semibold tracking-tight">Quelque chose s&apos;est mal passé</h1>
      <p className="max-w-md text-[14px] text-muted">{error.message || "Réessaie dans un instant."}</p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
