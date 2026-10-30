import { requireClient } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { portalNav } from "@/components/layout/nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const store = await requireClient();
  const { profile, user, demo } = store.session;
  const [client, briefs, livrables] = await Promise.all([store.client(store.clientId), store.briefs({ clientId: store.clientId }), store.livrables({ clientId: store.clientId })]);
  const validations = briefs.filter((b) => b.status === "attente_client" && b.kind === "video").length + livrables.filter((l) => l.status === "attente_client").length;
  return (
    <AppShell nav={portalNav} workspaceLabel={client?.name ?? "Espace client"} demo={demo} badges={{ validations, inbox: validations }} accountHref="/app/compte"
      user={{ name: profile.display_name ?? user.email, email: user.email, title: client?.name, avatar: profile.avatar_url }}>
      {children}
    </AppShell>
  );
}
