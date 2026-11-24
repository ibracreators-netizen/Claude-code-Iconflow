import Link from "next/link";
import { isAdmin, members, salesRole, type Crm } from "@/lib/marketing/crm-server";
import { canManageKpiLinks, managedKpiPeople } from "@/lib/marketing/kpi-links-server";
import { sinceLabel } from "@/lib/marketing/kpi-links";
import { isCallerRole } from "@/lib/marketing/invite-errors";
import type { KpiEntry } from "@/lib/marketing/types";
import { CallerRoleCard } from "./caller-role";
import { DailyEntry } from "./kpi-entry";
import { KpiLinksCard } from "./kpi-links-client";

/** Jours relus pour « Derniers jours saisis » (et pour préremplir un jour déjà saisi). */
const ENTRY_DAYS = 60;

/**
 * Onglet « Saisie des KPI » de la page KPI (il était dans Paiements) : la carte « Liens de saisie des KPI », seulement
 * pour qui gère l'espace (jamais un setter ni un closer), puis la saisie du jour et les derniers jours saisis.
 * Une saisie enregistrée apparaît aussitôt dans Suivi du jour ; la page reste sur cet onglet.
 * Compte agence (administrateur, responsable) : il saisit avec les champs de son rôle d'appel ; sans rôle d'appel, une
 * carte propose de le choisir (« Je suis closer » / « Je suis setter »). Il garde tous ses droits dans les deux cas.
 */
export async function KpiEntryTab({ crm }: { crm: Crm }) {
  const role = salesRole(crm.session), me = crm.session.user.id, admin = isAdmin(crm.session);
  // Rôle d'appel d'un compte agence : marketing_role, qui ne donne aucun droit (ceux-ci viennent de profiles.role).
  const caller = !role && isCallerRole(crm.session.profile.marketing_role) ? crm.session.profile.marketing_role : null;
  const now = new Date(), since = new Date(now.getTime() - ENTRY_DAYS * 86_400_000).toISOString().slice(0, 10);
  // Liens de saisie (migration 0028) : seulement pour qui gère l'espace.
  const manage = canManageKpiLinks(crm);
  const [settings, team, entries, people] = await Promise.all([
    crm.store.settings(),
    members(),
    crm.db.list<KpiEntry>("marketing_kpi_entries", { where: [["gte", "day", since]], order: ["day", "desc"], limit: 2000 }).then((r) => r as KpiEntry[] | null).catch(() => null),
    manage ? managedKpiPeople(crm) : Promise.resolve([]),
  ]);
  const today = new Intl.DateTimeFormat("fr-CA", { timeZone: settings.timezone }).format(now);
  const defaultRole = role ? (role === "closer" ? "closer" : "setter") : caller ?? "setter";
  return (
    <>
      {manage ? <KpiLinksCard rows={people === null ? null : people.map((p) => ({ ...p, lastLabel: sinceLabel(p.last_entry_at, settings.timezone, now.getTime()) }))} /> : null}
      {entries === null ? (
        <p role="status" className="rounded-[10px] border border-mk-warn/30 bg-mk-warn-soft px-4 py-3 text-[14px] text-mk-warn">La saisie des KPI demande la migration 0026 de la base. Demande à l&apos;administrateur de la passer.</p>
      ) : (
        <>
          {!role && !caller ? <CallerRoleCard me={me} admin={admin} /> : null}
          {caller ? (
            <p className="mb-4 text-[13px] text-mk-sub">
              Tu saisis comme {caller} (ton rôle d&apos;appel).{" "}
              {admin ? <Link href="/marketing/reglages/equipe" className="font-medium text-mk-link hover:underline">Changer dans Réglages › Équipe et accès</Link> : "L'administrateur peut le changer dans Réglages › Équipe et accès."}
            </p>
          ) : null}
          {/* Clé : un changement de rôle d'appel recharge la saisie avec les champs du nouveau rôle. */}
          <DailyEntry key={`${me}-${defaultRole}`} today={today} me={me} canPickMember={!role} defaultRole={defaultRole}
            members={team.filter((m) => m.marketing_role === "setter" || m.marketing_role === "closer").map((m) => ({ id: m.id, name: m.name, role: m.marketing_role as "setter" | "closer" }))}
            entries={entries.filter((e) => !role || e.profile_id === me).map((e) => ({ profile_id: e.profile_id, day: e.day, metrics: e.metrics ?? {}, note: e.note }))} />
        </>
      )}
    </>
  );
}
