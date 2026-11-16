"use client";
import * as React from "react";
import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { inviteSalesMemberAction, updateSalesMemberAction } from "@/lib/actions/marketing";
import type { SalesMember } from "@/lib/marketing/team";
import { SALES_ASSIGNABLE_MODULES, SALES_ROLE_MODULES, moduleLabel, type SalesRole } from "@/lib/permissions";
import Link from "next/link";

const ROLE: Record<SalesRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };

/** Cases à cocher des pages accordées à un compte commercial. */
function PagePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium">Pages accordées</legend>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {SALES_ASSIGNABLE_MODULES.map((m) => (
          <label key={m} className="flex items-center gap-2 text-[13px] text-fg-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={value.includes(m)} onChange={(e) => onChange(e.target.checked ? [...value, m] : value.filter((x) => x !== m))} />{moduleLabel(m)}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">Quelle que soit la page, un setter ou un closer ne voit que les leads qui lui sont attribués, et un media buyer ne voit aucune coordonnée. Réglages et Équipe restent aux membres de l&apos;agence.</p>
    </fieldset>
  );
}

export function TeamTable({ team, me, noDatabase }: { team: SalesMember[]; me: string; noDatabase: boolean }) {
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: "", email: "", role: "setter" as SalesRole, pages: SALES_ROLE_MODULES.setter as string[] });
  const [access, setAccess] = React.useState<{ member: SalesMember; pages: string[] } | null>(null);
  const [off, setOff] = React.useState<SalesMember | null>(null);
  const invite = () => exec(() => inviteSalesMemberAction({ name: f.name, email: f.email, role: f.role, permissions: f.pages }), { onSuccess: (r) => { setOpen(false); setF({ name: "", email: "", role: "setter", pages: SALES_ROLE_MODULES.setter }); if (!r.emailed) window.alert("Le compte est créé, mais l'email d'invitation n'est pas parti. Demande à la personne d'utiliser « Recevoir un lien de connexion » sur la page de connexion."); }, success: "Invitation envoyée." });
  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h3 className="text-[15px] font-semibold">Membres de l&apos;espace Marketing</h3><p className="text-[12.5px] text-muted">Un compte commercial ne voit que ce qui lui est attribué. Un membre de l&apos;agence qui a des pages Marketing voit tout dans ces pages : il se gère dans Studio › Équipe &amp; accès.</p></div>
        <Button disabled={noDatabase} onClick={() => setOpen(true)}><UserPlus />Inviter un commercial</Button>
      </div>
      {noDatabase ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">Inviter un membre demande une base reliée.</p> : team.length === 0 ? <p className="text-[13px] text-muted">Aucun membre pour l&apos;instant.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead><tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted"><th className="py-2 pr-3 font-medium">Membre</th><th className="px-3 py-2 font-medium">Rôle</th><th className="px-3 py-2 font-medium">Google Agenda</th><th className="px-3 py-2 font-medium">Accès</th><th className="py-2 pl-3 text-right font-medium">Actions</th></tr></thead>
            <tbody className="divide-y divide-border">
              {team.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 pr-3"><Link href={`/marketing/equipe/${m.id}`} className="block font-medium hover:underline">{m.name}{m.id === me ? " (toi)" : ""}</Link><span className="block text-[12px] text-muted">{m.email ?? "sans email"}</span></td>
                  <td className="px-3 py-2.5">
                    {m.kind === "commercial" ? (
                      <NativeSelect aria-label={`Rôle de ${m.name}`} value={m.role ?? ""} disabled={pending || m.disabled} onChange={(e) => exec(() => updateSalesMemberAction(m.id, { role: e.target.value as SalesRole }), { success: "Rôle enregistré." })} className="h-9 w-40">
                        {!m.role ? <option value="">À choisir</option> : null}{(Object.keys(ROLE) as SalesRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
                      </NativeSelect>
                    ) : <span className="text-fg-2">{m.kind === "admin" ? "Administrateur" : "Membre de l'agence"}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-fg-2">{m.google === "ok" ? "connecté" : m.google === "invalide" ? <span className="font-semibold text-warning">à reconnecter</span> : <span className="text-muted">non connecté</span>}</td>
                  <td className="px-3 py-2.5">{m.disabled ? <Badge tone="danger">Accès retiré</Badge> : <Badge tone="success">Actif</Badge>}</td>
                  <td className="py-2.5 pl-3 text-right">{m.kind === "commercial" ? (m.disabled
                    ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => exec(() => updateSalesMemberAction(m.id, { disabled: false }), { success: "Accès rétabli." })}>Rétablir l&apos;accès</Button>
                    : <span className="inline-flex gap-1"><Button size="sm" variant="secondary" disabled={pending} onClick={() => setAccess({ member: m, pages: m.permissions })}>Accès</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setOff(m)}>Retirer l&apos;accès</Button></span>) : <span className="text-[12px] text-muted">géré dans Studio</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Inviter un commercial" description="La personne reçoit un email pour choisir son mot de passe. Son compte n'ouvre que l'espace Marketing.">
          <div className="space-y-3">
            <Field label="Nom"><Input value={f.name} onChange={(e) => setF((v) => ({ ...v, name: e.target.value }))} autoFocus maxLength={120} /></Field>
            <Field label="Email professionnel"><Input type="email" value={f.email} onChange={(e) => setF((v) => ({ ...v, email: e.target.value }))} maxLength={254} /></Field>
            <Field label="Rôle" hint="Changer de rôle remet les pages habituelles de ce rôle"><NativeSelect value={f.role} onChange={(e) => { const role = e.target.value as SalesRole; setF((v) => ({ ...v, role, pages: SALES_ROLE_MODULES[role] })); }}>{(Object.keys(ROLE) as SalesRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</NativeSelect></Field>
            <PagePicker value={f.pages} onChange={(pages) => setF((v) => ({ ...v, pages }))} />
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button loading={pending} disabled={!f.email.trim() || !f.name.trim()} onClick={invite}>Envoyer l&apos;invitation</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!access} onOpenChange={(o) => { if (!o) setAccess(null); }}>
        <DialogContent title={`Accès de ${access?.member.name ?? ""}`} description="Choisis les pages que ce membre peut ouvrir. Le changement s'applique à sa prochaine action.">
          {access ? <PagePicker value={access.pages} onChange={(pages) => setAccess({ ...access, pages })} /> : null}
          <DialogFooter><Button variant="ghost" onClick={() => setAccess(null)}>Annuler</Button><Button loading={pending} disabled={!access?.pages.length} onClick={() => { if (access) void exec(() => updateSalesMemberAction(access.member.id, { permissions: access.pages }), { success: "Accès enregistrés.", onSuccess: () => setAccess(null) }); }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!off} onOpenChange={(o) => !o && setOff(null)} loading={pending} danger title={`Retirer l'accès de ${off?.name ?? ""} ?`} description="La personne ne peut plus se connecter ni lire quoi que ce soit. Ses prospects et ses tâches restent en place : pense à les réattribuer."
        confirmLabel="Retirer l'accès" onConfirm={() => { if (off) void exec(() => updateSalesMemberAction(off.id, { disabled: true }), { success: "Accès retiré.", onSuccess: () => setOff(null) }); }} />
    </section>
  );
}
