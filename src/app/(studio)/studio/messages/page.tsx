import { requireAgency } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { Messenger } from "./messenger";

export const metadata = { title: "Messagerie" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const store = await requireAgency("messages");
  const [clients, profiles] = await Promise.all([store.clients(), store.profiles()]);
  const previews = await Promise.all(clients.map(async (c) => { const last = (await store.messages(c.id, 1))[0]; return { id: c.id, name: c.name, logo: c.logo_url, last: last ? { body: last.body, at: last.created_at, mine: last.author_id === store.session.user.id, fromAgency: profiles.find((p) => p.id === last.author_id)?.role === "agency" } : null }; }));
  const selected = client && clients.some((c) => c.id === client) ? client : previews.sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""))[0]?.id ?? null;
  const thread = selected ? await store.messages(selected) : [];
  return (
    <>
      <PageHeader eyebrow="Clients" title="Messagerie" description="Un fil par client, partagé avec son espace. Les validations restent dans Briefs et Livrables." className="mb-4" />
      <Messenger previews={previews.sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""))} selectedId={selected} thread={thread} meId={store.session.user.id}
        people={Object.fromEntries(profiles.map((p) => [p.id, { name: p.display_name ?? p.email ?? "—", role: p.role, avatar: p.avatar_url }]))} basePath="/studio/messages" />
    </>
  );
}
