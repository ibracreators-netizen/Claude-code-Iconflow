"use client";
import { ErrorView } from "@/components/layout/error-view";

/** Frontière de l'espace : la page en erreur est remplacée, la navigation reste utilisable. */
export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} inShell />;
}
