"use client";
import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { useTheme } from "@/lib/hooks/use-local-pref";
import { updateProfile } from "@/lib/actions/portal";
import { AvatarUploader } from "@/components/account/avatar-uploader";

export function ProfileForm({ displayName, title, email, userId, avatarUrl }: { displayName: string; title: string; email: string; userId: string; avatarUrl: string | null }) {
  const [name, setName] = React.useState(displayName);
  const [role, setRole] = React.useState(title);
  const { exec, pending } = useAction();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => updateProfile({ display_name: name, title: role }), { success: "Profil enregistré." }); }}>
      <AvatarUploader userId={userId} name={name || displayName || email} avatarUrl={avatarUrl} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom affiché" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></Field>
        <Field label="Fonction" hint="Ex. Fondatrice, Responsable marketing"><Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} /></Field>
      </div>
      <Field label="Email" hint="Pour changer d'adresse, contactez l'équipe."><Input value={email} readOnly disabled /></Field>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Enregistrer</Button></div>
    </form>
  );
}

export function ThemeChoice() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="grid grid-cols-2 gap-3">
      {[["dark", "Sombre", Moon], ["light", "Clair", Sun]].map(([v, label, Icon]) => { const I = Icon as typeof Moon; const active = theme === v; return (
        <button key={v as string} type="button" onClick={() => setTheme(v as "dark" | "light")} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${active ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"}`}>
          <span className={`flex size-9 items-center justify-center rounded-lg ${active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}><I className="size-4" /></span>
          <span><span className="block text-[13.5px] font-medium">{label as string}</span><span className="text-[12px] text-muted">{active ? "Thème actuel" : "Appliquer"}</span></span>
        </button>
      ); })}
    </div>
  );
}
