import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canAccess } from "@/lib/permissions";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { crmPage, isAdmin, members, salesRole } from "@/lib/marketing/crm-server";
import { calendar, prospectChoice, taskList, todoItems } from "@/lib/marketing/todo-server";
import { MARKETING_ROLE, type Member } from "@/lib/marketing/types";
import { TasksView, type TasksTab } from "./taches-client";

export const metadata: Metadata = { title: "Tâches" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** « Closer » pour un commercial ; « Administrateur · Closer » pour un compte de l'agence qui a choisi un rôle d'appel. */
const memberLabel = (m: Member) => {
  if (m.sales && m.marketing_role) return MARKETING_ROLE[m.marketing_role];
  return [m.admin ? "Administrateur" : "Agence", m.marketing_role ? MARKETING_ROLE[m.marketing_role] : null].filter(Boolean).join(" · ");
};

/**
 * Tâches, comme LeadConnector. Onglet par défaut « Éléments à faire » : ce qui m'attend (il remplace l'ancien
 * « Mon espace » des setters et closers). Puis « Toutes les tâches » et « Terminées ».
 */
export default async function TachesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // Un media buyer n'a pas de tâches : ses chiffres sont dans le tableau de bord.
  const space = await requireMarketingSpace();
  if (salesRole(space.session) === "media_buyer" && (canAccess(space.session.profile, "marketing_dashboard") || canAccess(space.session.profile, "marketing_publicite"))) redirect("/marketing/acquisition");
  const crm = await crmPage("marketing_taches");
  const me = crm.session.user.id, admin = isAdmin(crm.session), myRole = salesRole(crm.session);
  const tab: TasksTab = one(sp.onglet) === "toutes" ? "toutes" : one(sp.onglet) === "terminees" ? "terminees" : "a-faire";
  const [team, settings] = await Promise.all([members(), crm.store.settings()]);
  const tz = settings.timezone, cal = calendar(tz);
  // On attribue une tâche à un setter, un closer ou un membre de l'agence ; un media buyer n'en a pas.
  const people = team.filter((m) => m.marketing_role !== "media_buyer");
  const who = admin && people.some((m) => m.id === one(sp.membre)) ? one(sp.membre) : me;
  const viewed = team.find((m) => m.id === who);
  // Ses propres éléments : le rôle de la session. Un compte de l'agence reste « agence », même avec un rôle d'appel
  // (Closer, Setter) : seul un compte commercial est limité à son rôle, qu'on le regarde ou qu'il soit connecté.
  const role = who === me ? myRole : viewed?.sales ? viewed.marketing_role : null;

  const [list, unassigned, preset] = await Promise.all([
    tab === "a-faire" ? todoItems(crm, { who, role, tz }).then((items) => ({ items, capped: false })) : taskList(crm, { closed: tab === "terminees", tz }),
    tab === "a-faire" && !myRole ? crm.db.count("marketing_tasks", [["eq", "status", "ouverte"], ["null", "assignee_id"]]).catch(() => 0) : Promise.resolve(0),
    prospectChoice(crm, one(sp.prospect)),
  ]);

  return (
    <TasksView key={`${tab}:${who}`} tab={tab} items={list.items} capped={list.capped} me={me} who={who} today={cal.today} tz={tz}
      members={people.map((m) => ({ id: m.id, name: m.name, role: memberLabel(m) }))}
      canPickMember={admin} sales={!!myRole} role={role} unassigned={unassigned}
      filters={{ responsable: one(sp.responsable), type: one(sp.type), q: one(sp.q) }}
      openNew={one(sp.nouveau) === "1"} preset={preset} />
  );
}
