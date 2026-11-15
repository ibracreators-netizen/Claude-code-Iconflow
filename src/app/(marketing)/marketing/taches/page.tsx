import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { crmPage, members } from "@/lib/marketing/crm-server";
import type { Contact, MarketingTask, Prospect } from "@/lib/marketing/types";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { TasksList } from "./taches-client";

export const metadata: Metadata = { title: "Tâches" };

export default async function TachesPage() {
  const crm = await crmPage("marketing_taches");
  const [tasks, prospects, contacts, team, settings] = await Promise.all([
    crm.db.list<MarketingTask>("marketing_tasks", { order: ["created_at", "desc"], limit: 2000 }),
    crm.db.list<Prospect>("marketing_prospects"), crm.db.list<Contact>("marketing_contacts"), members(), crm.store.settings(),
  ]);
  const contact = new Map(contacts.map((c) => [c.id, c]));
  const who: Record<string, { name: string; phone: string | null }> = {};
  for (const p of prospects) { const c = p.contact_id ? contact.get(p.contact_id) : null; who[p.id] = { name: c?.name ?? p.name ?? c?.email ?? p.email ?? "Prospect", phone: c?.phone ?? p.phone ?? null }; }
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Tâches" description="Les tâches de l'espace Marketing : « À appeler », relances, résultats à saisir. Chacune est rattachée à un prospect, attribuée à un membre, avec une échéance."
        actions={crm.demo ? <DemoBadge /> : null} />
      {tasks.length === 0 ? (
        <div className="card"><EmptyState icon={ListChecks} title="Aucune tâche" description="Une tâche se crée depuis la fiche d'un prospect. Elles apparaîtront ici, triées par échéance." /></div>
      ) : <TasksList tasks={tasks} who={who} members={team} me={crm.session.user.id} timezone={settings.timezone} today={new Date().toISOString().slice(0, 10)} />}
    </>
  );
}
