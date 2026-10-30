"use client";
import * as React from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

/** Choix ou changement de mot de passe (Supabase uniquement) ; la session courante reste ouverte. */
export function PasswordForm({ redirectTo, submitLabel = "Enregistrer le mot de passe" }: { redirectTo?: string; submitLabel?: string }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;
  const tooShort = password.length > 0 && password.length < 8;
  const ready = password.length >= 8 && confirm === password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) { toast.error(/weak|short|password/i.test(error.message) ? "Mot de passe trop faible : 8 caractères minimum." : "Impossible d'enregistrer le mot de passe pour le moment."); return; }
    toast.success("Mot de passe enregistré.");
    setPassword(""); setConfirm("");
    if (redirectTo) window.location.assign(redirectTo);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nouveau mot de passe" hint={tooShort ? "8 caractères minimum." : "8 caractères minimum."} required>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required aria-invalid={tooShort || undefined} />
        </Field>
        <Field label="Confirmation" hint={mismatch ? "Les deux saisies diffèrent." : undefined} required>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required aria-invalid={mismatch || undefined} />
        </Field>
      </div>
      <div><Button type="submit" loading={pending} disabled={!ready}><KeyRound />{submitLabel}</Button></div>
    </form>
  );
}
