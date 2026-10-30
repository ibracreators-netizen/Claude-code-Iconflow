"use client";
import * as React from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { updateProfile } from "@/lib/actions/profile";
import { useAction } from "@/lib/hooks/use-action";

export function ProfileForm({ displayName, title, email, compact }: { displayName: string; title: string; email: string; compact?: boolean }) {
  const [name, setName] = React.useState(displayName);
  const [role, setRole] = React.useState(title);
  const { exec, pending } = useAction();
  const dirty = name !== displayName || role !== title;
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; exec(() => updateProfile({ display_name: name.trim(), title: role.trim() || null }), { success: "Profil enregistré" }); }}>
      <div className={compact ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
        <Field label="Nom affiché" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></Field>
        <Field label="Fonction" hint="Ex. Fondateur, Monteur, Head of Scripts"><Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} /></Field>
      </div>
      <Field label="Email" hint="Géré par l'authentification, non modifiable ici."><Input value={email} disabled /></Field>
      <div><Button type="submit" loading={pending} disabled={!dirty}><Save />Enregistrer</Button></div>
    </form>
  );
}
