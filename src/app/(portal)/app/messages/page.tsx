import { requireClient } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { Thread } from "./thread";

export const metadata = { title: "Messagerie" };

export default async function MessagesPage() {
  const store = await requireClient();
  const messages = await store.messages(store.clientId);
  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-3xl flex-col">
      <PageHeader eyebrow="Espace" title="Messagerie" description="Un fil direct avec votre équipe icon-flow. Réponse sous 24 h ouvrées." className="mb-4" />
      <Thread clientId={store.clientId} messages={messages} me={store.session.user.id} />
    </div>
  );
}
