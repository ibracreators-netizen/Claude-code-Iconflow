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
import type { SalesRole } from "@/lib/permissions";

const ROLE: Record<SalesRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };

export function TeamTable({ team, me, noDatabase }: { team: SalesMember[]; me: string; noDatabase: boolean }) {
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: "", email: "", role: "setter" as SalesRole });
  const [off, setOff] = React.useState<SalesMember | null>(null);
  const invite = () => exec(() => inviteSalesMemberAction(f), { onSuccess: (r) => { setOpen(false); setF({ name: "", email: "", role: "setter" }); if (!r.emailed) window.alert("Le compte est créé, mais l'email d'invitation n'est pas parti. Demande à la personne d'utiliser « Recevoir un lien de connexion » sur la page de connexion."); }, success: "Invitation envoyée." });
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
                  <td className="py-2.5 pr-3"><span className="block font-medium">{m.name}{m.id === me ? " (toi)" : ""}</span><span className="block text-[12px] text-muted">{m.email ?? "sans email"}</span></td>
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
                    : <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOff(m)}>Retirer l&apos;accès</Button>) : <span className="text-[12px] text-muted">géré dans Studio</span>}</td>
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
            <Field label="Rôle"><NativeSelect value={f.role} onChange={(e) => setF((v) => ({ ...v, role: e.target.value as SalesRole }))}>{(Object.keys(ROLE) as SalesRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</NativeSelect></Field>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button loading={pending} disabled={!f.email.trim() || !f.name.trim()} onClick={invite}>Envoyer l&apos;invitation</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!off} onOpenChange={(o) => !o && setOff(null)} loading={pending} danger title={`Retirer l'accès de ${off?.name ?? ""} ?`} description="La personne ne peut plus se connecter ni lire quoi que ce soit. Ses prospects et ses tâches restent en place : pense à les réattribuer."
        confirmLabel="Retirer l'accès" onConfirm={() => { if (off) void exec(() => updateSalesMemberAction(off.id, { disabled: true }), { success: "Accès retiré.", onSuccess: () => setOff(null) }); }} />
    </section>
  );
}
