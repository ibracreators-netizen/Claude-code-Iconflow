"use client";
import * as React from "react";
import { Ban, Mail, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { resendInvite, setMemberDisabled, setMemberPermissions, updateMember } from "@/lib/actions/team";
import { previewAsMember } from "@/lib/actions/auth";
import { Eye } from "lucide-react";
import type { Profile } from "@/lib/data/types";
import { PermissionsPicker } from "./permissions-picker";

type Opt = { id: string; name: string };

/** Droits, rattachement, fonction et accès d'un compte. Jamais pour soi-même. */
export function AccessPanel({ profile, clients, isSelf, canManage, demo }: { profile: Profile; clients: Opt[]; isSelf: boolean; canManage: boolean; demo: boolean }) {
  const { exec, pending } = useAction();
  const [permissions, setPermissions] = React.useState<string[] | null>(profile.permissions);
  const [title, setTitle] = React.useState(profile.title ?? "");
  const [clientId, setClientId] = React.useState(profile.client_id ?? "");
  const [confirm, setConfirm] = React.useState<"disable" | "enable" | null>(null);
  const disabled = !!profile.disabled_at;
  const permsDirty = JSON.stringify(permissions) !== JSON.stringify(profile.permissions);
  const metaDirty = title !== (profile.title ?? "") || (profile.role === "client" && clientId !== (profile.client_id ?? ""));
  const locked = isSelf || !canManage;

  return (
    <div className="space-y-6">
      {isSelf ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-muted">C&apos;est ton compte : tes droits et ton accès se gèrent par un autre administrateur.</p> : null}

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold"><ShieldCheck className="size-4 text-accent-2" />{profile.role === "agency" ? "Pages accessibles" : "Rattachement"}</h3>
        {profile.role === "agency" ? (
          <>
            <PermissionsPicker value={permissions} onChange={setPermissions} disabled={locked} />
            {!locked ? <div className="flex justify-end"><Button size="sm" loading={pending} disabled={!permsDirty} onClick={() => exec(() => setMemberPermissions(profile.id, permissions), { success: "Droits enregistrés." })}><Save />Enregistrer les droits</Button></div> : null}
          </>
        ) : (
          <Field label="Espace client" hint="Le compte ne voit que les données de cet espace."><NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={locked}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
        )}
      </section>

      <section className="space-y-3">
        <Field label="Fonction"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} disabled={locked} placeholder={profile.role === "agency" ? "Monteur, Head of Scripts…" : "Fondatrice, CMO…"} /></Field>
        {!locked ? <div className="flex justify-end"><Button size="sm" variant="secondary" loading={pending} disabled={!metaDirty} onClick={() => exec(() => updateMember(profile.id, { title: title.trim() || null, ...(profile.role === "client" ? { client_id: clientId || null } : {}) }), { success: "Compte mis à jour." })}><Save />Enregistrer</Button></div> : null}
      </section>

      {!locked ? (
        <section className="space-y-2 border-t border-border pt-4">
          <h3 className="text-[13.5px] font-semibold">Accès</h3>
          <div className="flex flex-wrap gap-2">
            {!demo ? <Button variant="secondary" size="sm" loading={pending} onClick={() => exec(() => resendInvite(profile.id), { success: "Lien de connexion renvoyé par email.", refresh: false })}><Mail />Renvoyer un lien de connexion</Button> : null}
            {demo && profile.role === "agency" && !disabled ? <form action={previewAsMember.bind(null, profile.id)}><Button type="submit" variant="secondary" size="sm"><Eye />Voir le studio comme ce membre</Button></form> : null}
            {disabled
              ? <Button variant="secondary" size="sm" onClick={() => setConfirm("enable")}><RotateCcw />Rétablir l&apos;accès</Button>
              : <Button variant="danger" size="sm" onClick={() => setConfirm("disable")}><Ban />Retirer l&apos;accès</Button>}
          </div>
          <p className="text-[12px] text-muted">{disabled ? "Ce compte ne peut plus se connecter. Son historique est conservé." : "Retirer l'accès coupe immédiatement la connexion. Le compte et son historique restent consultables ici et l'accès peut être rétabli."}</p>
        </section>
      ) : null}

      <ConfirmDialog open={confirm === "disable"} onOpenChange={(o) => !o && setConfirm(null)} title={`Retirer l'accès de ${profile.display_name ?? profile.email} ?`} description="La personne sera déconnectée et ne pourra plus se connecter. Vous pourrez rétablir l'accès plus tard." confirmLabel="Retirer l'accès" danger loading={pending}
        onConfirm={async () => { await exec(() => setMemberDisabled(profile.id, true), { success: "Accès retiré.", onSuccess: () => setConfirm(null) }); }} />
      <ConfirmDialog open={confirm === "enable"} onOpenChange={(o) => !o && setConfirm(null)} title={`Rétablir l'accès de ${profile.display_name ?? profile.email} ?`} description="La personne pourra de nouveau se connecter avec ses identifiants." confirmLabel="Rétablir" loading={pending}
        onConfirm={async () => { await exec(() => setMemberDisabled(profile.id, false), { success: "Accès rétabli.", onSuccess: () => setConfirm(null) }); }} />
    </div>
  );
}
