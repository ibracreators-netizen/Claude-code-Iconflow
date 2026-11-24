"use client";
import * as React from "react";
import Link from "next/link";
import { Info, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { setCallerRoleAction, updateSalesMemberAction } from "@/lib/actions/marketing";
import type { SalesMember } from "@/lib/marketing/team";
import { CALLER_ROLES, INVITE_ROLE_LABEL, assignablePages, isCallerRole, memberRoleLabel, pagesForRole, type CallerRole } from "@/lib/marketing/invite-errors";
import type { SalesRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, BTN_LIGHT, MemberAvatar, Notice, Panel, Pill, SELECT, TABLE, TableScroll, TD, TH, THEAD, TR } from "../kit";
import { InviteMemberButton, ResendInviteButton } from "../../equipe/_components/invite-member";
import { PageChoices } from "../../equipe/_components/page-choices";

const SALES_ROLES: SalesRole[] = ["setter", "closer", "media_buyer"];

/** Membres de l'équipe Marketing : rôle, invitation, pages, retrait d'accès. Un membre de l'agence (Studio) est seulement affiché. */
export function TeamTable({ team, me, demo }: { team: SalesMember[]; me: string; demo: boolean }) {
  const { exec, pending } = useAction();
  const [access, setAccess] = React.useState<{ member: SalesMember; pages: string[] } | null>(null);
  const [off, setOff] = React.useState<SalesMember | null>(null);
  const locked = pending || demo;
  const manageable = (m: SalesMember) => m.id !== me && (m.kind === "commercial" || !!m.manager);

  const who = (m: SalesMember) => (
    <Link href={`/marketing/equipe/${m.id}`} className="group flex min-w-0 items-center gap-3">
      <MemberAvatar name={m.name} src={m.avatar} size={36} />
      <span className="min-w-0"><span className="block truncate font-semibold text-mk-strong group-hover:text-accent-2 group-hover:underline">{m.name}{m.id === me ? " (toi)" : ""}</span><span className="block truncate text-[13px] text-mk-sub">{m.email ?? "sans e-mail"}</span></span>
    </Link>
  );
  // Rôle d'appel : le tien, et celui d'un responsable. Sans base, il s'applique au profil de démo en mémoire : il reste utilisable.
  const callerEditable = (m: SalesMember) => m.kind !== "commercial" && !m.disabled && (m.id === me || !!m.manager);
  const caller = (m: SalesMember) => (
    <label className="mt-1.5 flex items-center gap-2 text-[13px] text-mk-sub">
      <span className="shrink-0">Rôle d&apos;appel</span>
      <NativeSelect aria-label={m.id === me ? "Ton rôle d'appel" : `Rôle d'appel de ${m.name}`} value={isCallerRole(m.role) ? m.role : ""} disabled={pending}
        onChange={(e) => exec(() => setCallerRoleAction(m.id, (e.target.value || null) as CallerRole | null), { success: "Rôle d'appel enregistré." })} className={cn(SELECT, "h-10 w-32 lg:h-9")}>
        <option value="">Aucun</option>{CALLER_ROLES.map((r) => <option key={r} value={r}>{INVITE_ROLE_LABEL[r]}</option>)}
      </NativeSelect>
    </label>
  );
  const role = (m: SalesMember) => callerEditable(m) ? (
    <span className="block"><span className="block font-medium text-mk-text">{memberRoleLabel({ ...m, role: null })}</span>{caller(m)}</span>
  ) : m.kind === "commercial" && m.id !== me ? (
    <NativeSelect aria-label={`Rôle de ${m.name}`} value={m.role ?? ""} disabled={locked || m.disabled} onChange={(e) => exec(() => updateSalesMemberAction(m.id, { role: e.target.value as SalesRole }), { success: "Rôle enregistré." })} className={cn(SELECT, "h-10 w-40")}>
      {!m.role ? <option value="">À choisir</option> : null}{SALES_ROLES.map((r) => <option key={r} value={r}>{INVITE_ROLE_LABEL[r]}</option>)}
    </NativeSelect>
  ) : <span className="font-medium text-mk-text">{memberRoleLabel(m)}</span>;
  const google = (m: SalesMember) => m.google === "ok" ? <Pill tone="success">connecté</Pill> : m.google === "invalide" ? <Pill tone="warn">à reconnecter</Pill> : <span className="text-[13px] text-mk-sub">non connecté</span>;
  const state = (m: SalesMember) => m.disabled ? <Pill tone="danger">Accès retiré</Pill> : m.pending ? <Pill tone="warn" title="Ne s'est pas encore connecté depuis son invitation">Invitation en attente</Pill> : <Pill tone="success">Actif</Pill>;
  const actions = (m: SalesMember) => {
    if (!manageable(m)) return <span className="text-[13px] text-mk-sub">{m.id === me ? "—" : m.kind === "admin" ? "Administrateur" : "Accès donnés depuis Studio"}</span>;
    if (m.disabled) return <Button size="sm" variant="outline" className={BTN_LIGHT} disabled={locked} onClick={() => exec(() => updateSalesMemberAction(m.id, { disabled: false }), { success: "Accès rétabli." })}>Rétablir l&apos;accès</Button>;
    return (
      <span className="inline-flex flex-wrap gap-1.5 lg:justify-end">
        {m.pending ? <ResendInviteButton member={{ id: m.id, name: m.name }} disabled={locked} /> : null}
        {m.kind === "commercial" ? <Button size="sm" variant="outline" className={BTN_LIGHT} disabled={locked} onClick={() => setAccess({ member: m, pages: assignablePages(m.permissions) })}>Pages</Button> : null}
        <Button size="sm" variant="ghost" className={cn(BTN_GHOST, "hover:text-mk-danger")} disabled={locked} onClick={() => setOff(m)}>Retirer l&apos;accès</Button>
      </span>
    );
  };

  return (
    <Panel flush={team.length > 0} title="Membres" description="Toi et ton équipe Marketing. Clique sur un nom pour voir sa fiche et son historique."
      action={<InviteMemberButton demo={demo} />}>
      {demo ? <div className={team.length > 0 ? "border-b border-mk-line px-4 py-3 sm:px-5" : "mb-3"}><Notice icon={Info} title="Mode démo">Identités d&apos;essai : rien n&apos;est enregistré. Tu peux quand même ouvrir « Inviter un membre » pour voir la fenêtre, et essayer ton rôle d&apos;appel : il s&apos;applique le temps de la démo.</Notice></div> : null}
      {team.some(callerEditable) ? (
        <p className={cn("flex items-start gap-2 text-[13px] leading-snug text-mk-sub", team.length > 0 ? "border-b border-mk-line px-4 py-3 sm:px-5" : "mb-3")}>
          <PhoneCall className="mt-px size-4 shrink-0 text-accent-2" strokeWidth={1.8} aria-hidden />
          <span>Ton rôle d&apos;appel te fait apparaître dans les KPI et le classement comme setter ou closer. Tu restes administrateur : tu gardes tous tes droits.</span>
        </p>
      ) : null}
      {team.length === 0 ? <p className="text-[14px] text-mk-sub">Aucun membre pour l&apos;instant. Invite ton premier membre avec « Inviter un membre ».</p> : (
        <>
          {/* Ordinateur : tableau */}
          <TableScroll className="hidden lg:block">
            <table className={cn(TABLE, "min-w-[820px]")}>
              <thead className={THEAD}><tr><th scope="col" className={TH}>Membre</th><th scope="col" className={TH}>Rôle</th><th scope="col" className={TH}>Google Agenda</th><th scope="col" className={TH}>État</th><th scope="col" className={cn(TH, "text-right")}>Actions</th></tr></thead>
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
                {callerEditable(m) ? role(m) : null}
                <div className="flex flex-wrap items-center gap-2">{callerEditable(m) ? null : role(m)}{state(m)}<span className="inline-flex items-center gap-1.5 text-[13px] text-mk-sub">Google Agenda : {google(m)}</span></div>
                {manageable(m) ? <div className="flex flex-wrap gap-2">{actions(m)}</div> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      <Dialog open={!!access} onOpenChange={(o) => { if (!o) setAccess(null); }}>
        <DialogContent title={`Pages de ${access?.member.name ?? ""}`} description="Choisis les pages que ce membre peut ouvrir. Le changement s'applique à sa prochaine action." className="max-w-xl">
          {access ? (
            <PageChoices value={access.pages} onChange={(pages) => setAccess({ ...access, pages })} disabled={pending}
              defaults={access.member.role ? pagesForRole(access.member.role) : undefined}
              note={`Cochées : ses pages actuelles${access.member.role ? ` (rôle ${INVITE_ROLE_LABEL[access.member.role]})` : ""}.`} />
          ) : null}
          <p className="mt-3 text-[13px] leading-snug text-mk-sub">Quelle que soit la page, un setter ou un closer ne voit que les leads qui lui sont attribués, et un media buyer ne voit aucune coordonnée. Réglages et Équipe restent à toi.</p>
          {/* Pied collé en bas de la fenêtre (-bottom-6 : par-dessus la marge du cadre qui défile) : « Enregistrer » reste visible. */}
          <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-4 flex-wrap border-t border-mk-line bg-surface px-6 py-3">
            {access && !access.pages.length ? <p className="basis-full text-[13px] font-medium text-mk-danger sm:mr-auto sm:basis-auto">Coche au moins une page.</p> : null}
            <Button variant="ghost" className={BTN_GHOST} onClick={() => setAccess(null)}>Annuler</Button>
            <Button className={BTN} loading={pending} disabled={!access?.pages.length} onClick={() => { if (access) void exec(() => updateSalesMemberAction(access.member.id, { permissions: access.pages }), { success: "Pages enregistrées.", onSuccess: () => setAccess(null) }); }}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!off} onOpenChange={(o) => !o && setOff(null)} loading={pending} danger title={`Retirer l'accès de ${off?.name ?? ""} ?`} description="La personne ne peut plus se connecter ni lire quoi que ce soit. Ses prospects et ses tâches restent en place : pense à les réattribuer."
        confirmLabel="Retirer l'accès" onConfirm={() => { if (off) void exec(() => updateSalesMemberAction(off.id, { disabled: true }), { success: "Accès retiré.", onSuccess: () => setOff(null) }); }} />
    </Panel>
  );
}
