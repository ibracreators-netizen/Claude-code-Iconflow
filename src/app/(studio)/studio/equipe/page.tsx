import Link from "next/link";
import { Building2, ChevronRight, Info, UsersRound } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { canAccess } from "@/lib/permissions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "@/components/account/profile-form";
import { fmt } from "@/lib/utils";
import type { Profile } from "@/lib/data/types";
import { TeamActions } from "./_components/team-actions";
import { permissionsSummary } from "@/lib/permissions";

export const metadata = { title: "Équipe & accès" };

export default async function TeamPage() {
  const store = await requireAgency("equipe");
  const [profiles, clients, activity] = await Promise.all([store.profiles(), store.clients({ includeArchived: true }), store.activity({ limit: 300 })]);
  const me = store.session.profile;
  const canManage = canAccess(me, "equipe");
  const lastSeen = new Map<string, string>();
  for (const a of activity) if (a.actor_id && !lastSeen.has(a.actor_id)) lastSeen.set(a.actor_id, a.created_at);
  const agency = profiles.filter((p) => p.role === "agency").sort((a, b) => Number(!!a.disabled_at) - Number(!!b.disabled_at) || a.created_at.localeCompare(b.created_at));
  const clientAccounts = profiles.filter((p) => p.role === "client");
  const byClient = clients.map((c) => ({ client: c, accounts: clientAccounts.filter((p) => p.client_id === c.id) })).filter((x) => x.accounts.length);
  const orphan = clientAccounts.filter((p) => !clients.some((c) => c.id === p.client_id));
  const activeClients = clients.filter((c) => c.status !== "archived").map((c) => ({ id: c.id, name: c.name }));

  const Row = ({ p, hint }: { p: Profile; hint: React.ReactNode }) => (
    <Link href={`/studio/equipe/${p.id}`} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/70">
      <Avatar name={p.display_name ?? p.email ?? "?"} src={p.avatar_url} size={36} className={p.disabled_at ? "opacity-50 grayscale" : undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{p.display_name ?? p.email}{p.id === me.id ? <span className="ml-2 text-[12px] font-normal text-muted">(toi)</span> : null}</p>
        <p className="truncate text-[12.5px] text-muted">{[p.title, p.email].filter(Boolean).join(" · ") || "—"}</p>
      </div>
      <div className="hidden items-center gap-2 sm:flex">{hint}</div>
      {p.disabled_at ? <Badge tone="danger" dot>Accès retiré</Badge> : null}
      <span className="hidden text-[12px] text-muted md:inline">{lastSeen.get(p.id) ? `actif ${fmt.relative(lastSeen.get(p.id)!)}` : `depuis ${fmt.date(p.created_at, { month: "short", year: "numeric" })}`}</span>
      <ChevronRight className="size-4 text-muted-2 transition group-hover:text-fg" />
    </Link>
  );

  return (
    <>
      <PageHeader eyebrow="Gestion" title="Équipe & accès" description="Qui fait partie de l'agence, quels clients ont un accès au portail, et ce que chacun peut voir."
        actions={<TeamActions clients={activeClients} canInvite={canManage} demo={store.session.demo} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><UsersRound className="size-4 text-accent-2" />Agence</span>} description={`${agency.filter((p) => !p.disabled_at).length} membre${agency.length > 1 ? "s" : ""} actif${agency.length > 1 ? "s" : ""}. Clique sur un membre pour ses droits et son historique.`} />
            <CardBody className="divide-y divide-border p-0 pb-0">
              {agency.map((p) => <Row key={p.id} p={p} hint={<Badge tone={p.permissions === null ? "accent" : "neutral"}>{permissionsSummary(p.permissions)}</Badge>} />)}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Building2 className="size-4 text-info" />Comptes clients</span>} description="Chaque compte est rattaché à un seul espace. La RLS Supabase garantit l'étanchéité." />
            <CardBody className="p-0">
              {!byClient.length && !orphan.length ? <EmptyState compact icon={Building2} title="Aucun compte client" description="Invite un client : il recevra un lien de connexion vers son espace." /> : (
                <div className="divide-y divide-border">
                  {byClient.map(({ client, accounts }) => (
                    <div key={client.id} className="py-2">
                      <div className="flex items-center gap-2 px-5 py-1.5"><Avatar name={client.name} src={client.logo_url} size={22} square /><Link href={`/studio/clients/${client.id}`} className="text-[13px] font-semibold hover:text-accent-2">{client.name}</Link>{client.status === "archived" ? <Badge tone="outline">Archivé</Badge> : null}</div>
                      <div className="divide-y divide-border/60">{accounts.map((p) => <Row key={p.id} p={p} hint={<Badge tone="info">Client</Badge>} />)}</div>
                    </div>
                  ))}
                  {orphan.length ? <div className="py-2"><p className="px-5 py-1.5 text-[13px] font-semibold text-warning">Comptes sans espace rattaché</p>{orphan.map((p) => <Row key={p.id} p={p} hint={<Badge tone="warning">À rattacher</Badge>} />)}</div> : null}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Mon profil" description="Ton nom, ta fonction et ta photo tels qu'ils apparaissent dans le studio." /><CardBody><ProfileForm compact userId={me.id} avatarUrl={me.avatar_url} displayName={me.display_name ?? ""} title={me.title ?? ""} email={store.session.user.email} /></CardBody></Card>
          <Card className="border-info/30">
            <CardHeader title={<span className="flex items-center gap-2"><Info className="size-4 text-info" />Comment ça marche</span>} />
            <CardBody className="space-y-2 text-[13px] text-fg-2">
              <p><strong>Membre</strong> : il reçoit un email, crée son mot de passe et n&apos;accède qu&apos;aux pages cochées. Le tableau de bord et les paramètres sont toujours visibles.</p>
              <p><strong>Client</strong> : il reçoit un lien vers son espace et ne voit que ses propres données.</p>
              <p><strong>Retirer l&apos;accès</strong> coupe la connexion immédiatement, sans rien supprimer : l&apos;historique reste consultable et l&apos;accès peut être rétabli.</p>
              {!store.session.demo ? <p className="text-muted">Les invitations utilisent la clé service Supabase (<code className="font-mono text-[12px]">SUPABASE_SERVICE_ROLE_KEY</code>) côté serveur uniquement.</p> : <p className="text-muted">En démo, les comptes sont créés en mémoire, sans email.</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
