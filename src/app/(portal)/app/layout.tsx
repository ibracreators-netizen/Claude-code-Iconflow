import { redirect } from "next/navigation";
import { Eye, Undo2 } from "lucide-react";
import { requireClient, type ClientStore } from "@/lib/auth/session";
import { endClientPreview } from "@/lib/actions/client-preview";
import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { buttonVariants } from "@/components/ui/button";
import { isInfraError, setupChecks } from "@/lib/supabase/diagnostics";
import type { Client } from "@/lib/data/types";
import type { ShellCounts } from "@/lib/data/store";

/** En aperçu, le compteur « à valider » est celui du client regardé (le magasin agence compterait le studio). */
async function previewCounts(store: ClientStore): Promise<ShellCounts> {
  const [briefs, livrables] = await Promise.all([store.briefs({ clientId: store.clientId }), store.livrables({ clientId: store.clientId })]);
  const validations = briefs.filter((b) => b.kind === "video" && b.status === "attente_client").length + livrables.filter((l) => l.status === "attente_client").length;
  return { briefs: 0, livrables: 0, taches: 0, factures: 0, validations };
}

/** Bandeau d'aperçu : un membre de l'agence voit l'espace du client, sans pouvoir agir à sa place. */
function PreviewNotice({ name }: { name: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-2.5 text-[13.5px]" role="status">
      <Eye className="size-4 shrink-0 text-info" />
      <p className="min-w-0 flex-1"><span className="font-semibold">Aperçu :</span> vous voyez l&apos;espace de <span className="font-semibold">{name}</span> comme le client. Les actions sont désactivées.</p>
      <form action={endClientPreview}><button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}><Undo2 />Quitter l&apos;aperçu</button></form>
    </div>
  );
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let store: ClientStore;
  let client: Client | null;
  let counts: ShellCounts;
  try {
    store = await requireClient();
    [client, counts] = await Promise.all([store.client(store.clientId), store.preview ? previewCounts(store) : store.shellCounts()]);
  } catch (e) {
    if (isInfraError(e)) return <SetupRequired digest={e.digest} checks={await setupChecks()} retryHref="/app" />;
    throw e;
  }
  // Aperçu d'un client supprimé ou inaccessible : retour à la liste plutôt qu'un espace vide.
  if (store.preview && !client) redirect("/studio/clients");
  const { profile, user, demo } = store.session;
  return (
    <AppShell variant="portal" workspaceLabel={client?.name ?? "Espace client"} demo={demo} badges={{ validations: counts.validations, inbox: counts.validations }} accountHref="/app/compte"
      user={{ name: profile.display_name ?? user.email, email: user.email, title: client?.name, avatar: profile.avatar_url }}>
      {store.preview ? <PreviewNotice name={client?.name ?? "ce client"} /> : null}
      {children}
    </AppShell>
  );
}
