"use client";
import * as React from "react";
import { Database, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { inviteSalesMemberAction, updateSalesMemberAction } from "@/lib/actions/marketing";
import type { SalesMember } from "@/lib/marketing/team";
import { SALES_ASSIGNABLE_MODULES, SALES_ROLE_MODULES, moduleLabel, type SalesRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { BTN, BTN_GHOST, BTN_LIGHT, CHECKBOX, EmptyBlock, INPUT, KitField, MemberAvatar, Panel, Pill, SELECT, TABLE, TableScroll, TD, TH, THEAD, TR } from "../kit";

const ROLE: Record<SalesRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };

/** Cases à cocher des pages accordées à un compte commercial. */
function PagePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[14px] font-medium text-mk-text">Pages accordées</legend>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {SALES_ASSIGNABLE_MODULES.map((m) => (
          <label key={m} className="flex min-h-10 items-center gap-2.5 text-[14px] text-mk-text">
            <input type="checkbox" className={CHECKBOX} checked={value.includes(m)} onChange={(e) => onChange(e.target.checked ? [...value, m] : value.filter((x) => x !== m))} />{moduleLabel(m)}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-mk-sub">Quelle que soit la page, un setter ou un closer ne voit que les leads qui lui sont attribués, et un media buyer ne voit aucune coordonnée. Réglages et Équipe restent aux membres de l&apos;agence.</p>
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
  const who = (m: SalesMember) => (
    <Link href={`/marketing/equipe/${m.id}`} className="group flex min-w-0 items-center gap-3">
      <MemberAvatar name={m.name} src={m.avatar} size={36} />
      <span className="min-w-0"><span className="block truncate font-semibold text-mk-strong group-hover:text-accent-2 group-hover:underline">{m.name}{m.id === me ? " (toi)" : ""}</span><span className="block truncate text-[13px] text-mk-sub">{m.email ?? "sans email"}</span></span>
    </Link>
  );
  const role = (m: SalesMember) => m.kind === "commercial" ? (
    <NativeSelect aria-label={`Rôle de ${m.name}`} value={m.role ?? ""} disabled={pending || m.disabled} onChange={(e) => exec(() => updateSalesMemberAction(m.id, { role: e.target.value as SalesRole }), { success: "Rôle enregistré." })} className={cn(SELECT, "h-10 w-40")}>
      {!m.role ? <option value="">À choisir</option> : null}{(Object.keys(ROLE) as SalesRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
    </NativeSelect>
  ) : <span className="text-mk-text">{m.kind === "admin" ? "Administrateur" : "Membre de l'agence"}</span>;
  const google = (m: SalesMember) => m.google === "ok" ? <Pill tone="success">connecté</Pill> : m.google === "invalide" ? <Pill tone="warn">à reconnecter</Pill> : <span className="text-[13px] text-mk-sub">non connecté</span>;
  const state = (m: SalesMember) => m.disabled ? <Pill tone="danger">Accès retiré</Pill> : <Pill tone="success">Actif</Pill>;
  const actions = (m: SalesMember) => m.kind === "commercial" ? (m.disabled
    ? <Button size="sm" variant="outline" className={BTN_LIGHT} disabled={pending} onClick={() => exec(() => updateSalesMemberAction(m.id, { disabled: false }), { success: "Accès rétabli." })}>Rétablir l&apos;accès</Button>
    : <span className="inline-flex gap-1.5"><Button size="sm" variant="outline" className={BTN_LIGHT} disabled={pending} onClick={() => setAccess({ member: m, pages: m.permissions })}>Accès</Button><Button size="sm" variant="ghost" className={cn(BTN_GHOST, "hover:text-mk-danger")} disabled={pending} onClick={() => setOff(m)}>Retirer l&apos;accès</Button></span>) : <span className="text-[13px] text-mk-sub">géré dans Studio</span>;
  return (
    <Panel flush={!noDatabase && team.length > 0} title="Membres de l'espace Marketing" description={<>Un compte commercial ne voit que ce qui lui est attribué. Un membre de l&apos;agence qui a des pages Marketing voit tout dans ces pages : il se gère dans Studio › Équipe &amp; accès.</>}
      action={<Button className={BTN} disabled={noDatabase} onClick={() => setOpen(true)}><UserPlus />Inviter un commercial</Button>}>
      {noDatabase ? <EmptyBlock icon={Database} title="Inviter un membre demande une base reliée." className="py-8" /> : team.length === 0 ? <p className="text-[14px] text-mk-sub">Aucun membre pour l&apos;instant.</p> : (
        <>
          {/* Ordinateur : tableau */}
          <TableScroll className="hidden lg:block">
            <table className={cn(TABLE, "min-w-[780px]")}>
              <thead className={THEAD}><tr><th scope="col" className={TH}>Membre</th><th scope="col" className={TH}>Rôle</th><th scope="col" className={TH}>Google Agenda</th><th scope="col" className={TH}>Accès</th><th scope="col" className={cn(TH, "text-right")}>Actions</th></tr></thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id} className={TR}>
                    <td className={TD}>{who(m)}</td>
                    <td className={TD}>{role(m)}</td>
                    <td className={TD}>{google(m)}</td>
                    <td className={TD}>{state(m)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-right")}>{actions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          {/* Téléphone : une fiche par membre */}
          <ul className="lg:hidden">
            {team.map((m) => (
              <li key={m.id} className="space-y-3 border-b border-mk-line px-4 py-4 text-[14px] last:border-b-0">
                {who(m)}
                <div className="flex flex-wrap items-center gap-2">{role(m)}{state(m)}<span className="inline-flex items-center gap-1.5 text-[13px] text-mk-sub">Google Agenda : {google(m)}</span></div>
                {m.kind === "commercial" ? <div className="flex flex-wrap gap-2">{actions(m)}</div> : <p className="text-[13px] text-mk-sub">Géré dans Studio.</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Inviter un commercial" description="La personne reçoit un email pour choisir son mot de passe. Son compte n'ouvre que l'espace Marketing.">
          <div className="space-y-4">
            <KitField label="Nom"><Input value={f.name} onChange={(e) => setF((v) => ({ ...v, name: e.target.value }))} autoFocus maxLength={120} className={INPUT} /></KitField>
            <KitField label="Email professionnel"><Input type="email" value={f.email} onChange={(e) => setF((v) => ({ ...v, email: e.target.value }))} maxLength={254} className={INPUT} /></KitField>
            <KitField label="Rôle" hint="Changer de rôle remet les pages habituelles de ce rôle"><NativeSelect value={f.role} onChange={(e) => { const role = e.target.value as SalesRole; setF((v) => ({ ...v, role, pages: SALES_ROLE_MODULES[role] })); }} className={SELECT}>{(Object.keys(ROLE) as SalesRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</NativeSelect></KitField>
            <PagePicker value={f.pages} onChange={(pages) => setF((v) => ({ ...v, pages }))} />
          </div>
          <DialogFooter><Button variant="ghost" className={BTN_GHOST} onClick={() => setOpen(false)}>Annuler</Button><Button className={BTN} loading={pending} disabled={!f.email.trim() || !f.name.trim()} onClick={invite}>Envoyer l&apos;invitation</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!access} onOpenChange={(o) => { if (!o) setAccess(null); }}>
        <DialogContent title={`Accès de ${access?.member.name ?? ""}`} description="Choisis les pages que ce membre peut ouvrir. Le changement s'applique à sa prochaine action.">
          {access ? <PagePicker value={access.pages} onChange={(pages) => setAccess({ ...access, pages })} /> : null}
          <DialogFooter><Button variant="ghost" className={BTN_GHOST} onClick={() => setAccess(null)}>Annuler</Button><Button className={BTN} loading={pending} disabled={!access?.pages.length} onClick={() => { if (access) void exec(() => updateSalesMemberAction(access.member.id, { permissions: access.pages }), { success: "Accès enregistrés.", onSuccess: () => setAccess(null) }); }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!off} onOpenChange={(o) => !o && setOff(null)} loading={pending} danger title={`Retirer l'accès de ${off?.name ?? ""} ?`} description="La personne ne peut plus se connecter ni lire quoi que ce soit. Ses prospects et ses tâches restent en place : pense à les réattribuer."
        confirmLabel="Retirer l'accès" onConfirm={() => { if (off) void exec(() => updateSalesMemberAction(off.id, { disabled: true }), { success: "Accès retiré.", onSuccess: () => setOff(null) }); }} />
    </Panel>
  );
}
