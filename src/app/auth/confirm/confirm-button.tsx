"use client";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Bouton d'envoi du formulaire de confirmation, désactivé pendant la vérification (un seul envoi). */
export function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonVariants({ variant: "primary", size: "lg", className: "w-full gap-2" })}>
      {pending ? <><Loader2 className="size-4 animate-spin" aria-hidden />Vérification…</> : label}
    </button>
  );
}
