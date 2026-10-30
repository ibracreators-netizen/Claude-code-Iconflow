import type { Metadata } from "next";
import { requireAgency } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { one, type SP } from "../_prod/params";
import { TasksBoard } from "./tasks-board";

export const metadata: Metadata = { title: "Tâches" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("taches");
  const [tasks, clients, profiles] = await Promise.all([store.tasks(), store.clients(), store.profiles()]);
  const me = store.session.user.id;
  const assignee = one(sp.assignee) === "me" ? me : one(sp.assignee);
  const client = one(sp.client);
  const filtered = tasks.filter((t) => (!assignee || t.assignee_id === assignee) && (!client || t.client_id === client));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => t.status !== "termine" && t.due_date && t.due_date < today).length;

  return (
    <>
      <PageHeader eyebrow="Production" title="Tâches" description={overdue ? `${overdue} tâche${overdue > 1 ? "s" : ""} en retard. On traite ça d'abord.` : "Tout est dans les temps. Garde le rythme."} />
      <TasksBoard tasks={filtered} totalCount={tasks.length} clients={clients.map((c) => ({ id: c.id, name: c.name }))} profiles={profiles.map((p) => ({ id: p.id, name: p.display_name ?? p.email ?? "Compte" }))} meId={me} today={today} />
    </>
  );
}
