"use client";
import { ErrorView } from "@/components/layout/error-view";

/** Frontière racine : erreurs survenues hors des espaces (connexion, bienvenue…). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
