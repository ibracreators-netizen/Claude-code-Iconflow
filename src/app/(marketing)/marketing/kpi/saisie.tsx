import { members, salesRole, type Crm } from "@/lib/marketing/crm-server";
import { canManageKpiLinks, managedKpiPeople } from "@/lib/marketing/kpi-links-server";
import { sinceLabel } from "@/lib/marketing/kpi-links";
import type { KpiEntry } from "@/lib/marketing/types";
import { DailyEntry } from "./kpi-entry";
import { KpiLinksCard } from "./kpi-links-client";

/** Jours relus pour « Derniers jours saisis » (et pour préremplir un jour déjà saisi). */
const ENTRY_DAYS = 60;

/**
 * Onglet « Saisie des KPI » de la page KPI (il était dans Paiements) : la carte « Liens de saisie des KPI », seulement
 * pour qui gère l'espace (jamais un setter ni un closer), puis la saisie du jour et les derniers jours saisis.
 * Une saisie enregistrée apparaît aussitôt dans Suivi du jour ; la page reste sur cet onglet.
 */
export async function KpiEntryTab({ crm }: { crm: Crm }) {
  const role = salesRole(crm.session), me = crm.session.user.id;
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
  return (
    <>
      {manage ? <KpiLinksCard rows={people === null ? null : people.map((p) => ({ ...p, lastLabel: sinceLabel(p.last_entry_at, settings.timezone, now.getTime()) }))} /> : null}
      {entries === null ? (
        <p role="status" className="rounded-[10px] border border-mk-warn/30 bg-mk-warn-soft px-4 py-3 text-[14px] text-mk-warn">La saisie des KPI demande la migration 0026 de la base. Demande à l&apos;administrateur de la passer.</p>
      ) : (
        <DailyEntry today={today} me={me} canPickMember={!role} defaultRole={role === "closer" ? "closer" : "setter"}
          members={team.filter((m) => m.marketing_role === "setter" || m.marketing_role === "closer").map((m) => ({ id: m.id, name: m.name, role: m.marketing_role as "setter" | "closer" }))}
          entries={entries.filter((e) => !role || e.profile_id === me).map((e) => ({ profile_id: e.profile_id, day: e.day, metrics: e.metrics ?? {}, note: e.note }))} />
      )}
    </>
  );
}
