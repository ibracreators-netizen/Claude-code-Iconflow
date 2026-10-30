import { Building2, Info, UsersRound } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "@/components/account/profile-form";
import { fmt } from "@/lib/utils";

export const metadata = { title: "Équipe" };

export default async function TeamPage() {
  const store = await requireAgency();
  const [profiles, clients] = await Promise.all([store.profiles(), store.clients({ includeArchived: true })]);
  const me = store.session.profile;
  const agency = profiles.filter((p) => p.role === "agency");
  const clientAccounts = profiles.filter((p) => p.role === "client");
  const byClient = clients.map((c) => ({ client: c, accounts: clientAccounts.filter((p) => p.client_id === c.id) })).filter((x) => x.accounts.length);
  const orphan = clientAccounts.filter((p) => !clients.some((c) => c.id === p.client_id));

  return (
    <>
      <PageHeader eyebrow="Gestion" title="Équipe & accès" description="Qui fait partie de l'agence, quels clients ont un accès au portail." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><UsersRound className="size-4 text-accent-2" />Agence</span>} description={`${agency.length} membre${agency.length > 1 ? "s" : ""} avec accès complet au studio.`} />
            <CardBody className="divide-y divide-border p-0 pb-0">
              {agency.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={p.display_name ?? p.email ?? "?"} src={p.avatar_url} size={36} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium">{p.display_name ?? p.email}{p.id === me.id ? <span className="ml-2 text-[12px] text-muted">(toi)</span> : null}</p><p className="truncate text-[12.5px] text-muted">{p.title ?? "—"} · {p.email ?? ""}</p></div>
                  <Badge tone="accent">Agence</Badge>
                  <span className="hidden text-[12px] text-muted sm:inline">depuis {fmt.date(p.created_at, { month: "short", year: "numeric" })}</span>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Building2 className="size-4 text-info" />Comptes clients</span>} description="Chaque compte client est rattaché à un seul espace. La RLS Supabase garantit l'étanchéité." />
            <CardBody className="p-0">
              {!byClient.length && !orphan.length ? <EmptyState compact icon={Building2} title="Aucun compte client" description="Invite un client depuis Supabase (voir le mémo ci-contre)." /> : (
                <div className="divide-y divide-border">
                  {byClient.map(({ client, accounts }) => (
                    <div key={client.id} className="px-5 py-3">
                      <div className="mb-2 flex items-center gap-2"><Avatar name={client.name} src={client.logo_url} size={22} square /><p className="text-[13.5px] font-semibold">{client.name}</p>{client.status === "archived" ? <Badge tone="outline">Archivé</Badge> : null}</div>
                      <ul className="space-y-1.5">{accounts.map((p) => <li key={p.id} className="flex items-center gap-2 text-[13px]"><Avatar name={p.display_name ?? p.email ?? "?"} size={24} /><span className="font-medium">{p.display_name ?? "—"}</span><span className="text-muted">{p.email}</span></li>)}</ul>
                    </div>
                  ))}
                  {orphan.length ? <div className="px-5 py-3"><p className="mb-2 text-[13px] font-semibold text-warning">Comptes sans espace rattaché</p><ul className="space-y-1.5">{orphan.map((p) => <li key={p.id} className="text-[13px] text-muted">{p.email ?? p.id}</li>)}</ul></div> : null}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Mon profil" description="Ton nom et ta fonction tels qu'ils apparaissent dans le studio." /><CardBody><ProfileForm compact userId={me.id} avatarUrl={me.avatar_url} displayName={me.display_name ?? ""} title={me.title ?? ""} email={store.session.user.email} /></CardBody></Card>
          <Card className="border-info/30">
            <CardHeader title={<span className="flex items-center gap-2"><Info className="size-4 text-info" />Inviter un client</span>} />
            <CardBody className="space-y-2 text-[13px] text-fg-2">
              <p>Les comptes sont créés dans Supabase, jamais depuis cette interface, pour garder l&apos;autorité côté Auth :</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Supabase → <strong>Authentication → Users → Invite user</strong>.</li>
                <li>Renseigne l&apos;email du client et, dans <em>User metadata</em>, <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">{`{"client_id": "<id du client>"}`}</code>.</li>
                <li>Le trigger crée son profil <code className="font-mono text-[12px]">role = client</code> rattaché à l&apos;espace. Il reçoit un lien de connexion.</li>
              </ol>
              <p className="text-muted">Un email présent dans <code className="font-mono text-[12px]">app_settings.admin_emails</code> devient automatiquement membre de l&apos;agence.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
