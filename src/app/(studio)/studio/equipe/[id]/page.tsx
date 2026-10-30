import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, MessageSquare, ShieldCheck, UsersRound } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { ALWAYS_ALLOWED, canAccess } from "@/lib/permissions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Stat } from "@/components/ui/misc";
import { Timeline } from "@/components/shared/timeline";
import { fmt } from "@/lib/utils";
import { AccessPanel } from "../_components/access-panel";
import { permissionsSummary } from "@/lib/permissions";

export const metadata = { title: "Compte" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireAgency("equipe");
  const profile = await store.profile(id);
  if (!profile) notFound();
  const me = store.session.profile;
  const [clients, activity, profiles, validations] = await Promise.all([
    store.clients({ includeArchived: true }), store.activity({ actorId: id, limit: 100 }), store.profiles(),
    profile.role === "client" && profile.client_id ? store.validations(profile.client_id) : Promise.resolve([]),
  ]);
  const client = profile.client_id ? clients.find((c) => c.id === profile.client_id) ?? null : null;
  const inviter = profile.invited_by ? profiles.find((p) => p.id === profile.invited_by) : null;
  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const decisions = validations.filter((v) => v.decided_by === id);
  const messagesCount = activity.filter((a) => a.kind === "message").length;
  const lastActive = activity[0]?.created_at;

  return (
    <>
      <div className="mb-5 flex items-center gap-2 text-[12.5px] text-muted">
        <Link href="/studio/equipe" className="inline-flex size-8 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg" aria-label="Retour à l'équipe"><ArrowLeft className="size-4" /></Link>
        <Link href="/studio/equipe" className="hover:text-fg">Équipe &amp; accès</Link><span>/</span><span className="text-fg-2">{profile.display_name ?? profile.email}</span>
      </div>

      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center animate-rise">
        <Avatar name={profile.display_name ?? profile.email ?? "?"} src={profile.avatar_url} size={72} className={profile.disabled_at ? "opacity-50 grayscale" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-medium tracking-[-0.03em] md:text-[34px]">{profile.display_name ?? profile.email}</h1>
            {profile.id === me.id ? <Badge tone="outline">toi</Badge> : null}
            {profile.role === "agency" ? <Badge tone="accent" dot>Agence · {permissionsSummary(profile.permissions)}</Badge> : <Badge tone="info" dot>Client{client ? ` · ${client.name}` : ""}</Badge>}
            {profile.disabled_at ? <Badge tone="danger" dot>Accès retiré {fmt.relative(profile.disabled_at)}</Badge> : null}
          </div>
          <p className="mt-1 text-[14px] text-muted">{[profile.title, profile.email].filter(Boolean).join(" · ")}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-2">Compte créé le {fmt.dateLong(profile.created_at)}{inviter ? ` · invité par ${inviter.display_name ?? inviter.email}` : ""}{lastActive ? ` · dernière activité ${fmt.relative(lastActive)}` : ""}</p>
        </div>
        {client ? <Link href={`/studio/clients/${client.id}`} className="inline-flex h-9 items-center gap-2 rounded-md bg-surface-2 px-3.5 text-sm font-medium hairline transition hover:bg-surface-3"><Building2 className="size-4" />Fiche {client.name}</Link> : null}
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Actions enregistrées" value={activity.length} hint="Dans l'historique du studio" />
        {profile.role === "client" ? <Stat label="Décisions" value={decisions.length} hint="Scripts et livrables validés ou corrigés" icon={CheckCircle2} /> : <Stat label="Pages accessibles" value={profile.permissions === null ? "Toutes" : profile.permissions.filter((k) => !(ALWAYS_ALLOWED as string[]).includes(k)).length} hint={profile.permissions === null ? "Accès complet au studio" : "Hors tableau de bord et paramètres, toujours visibles"} icon={ShieldCheck} />}
        <Stat label="Messages" value={messagesCount} hint="Envoyés dans la messagerie" icon={MessageSquare} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Historique" description="Toutes les actions de ce compte : décisions, créations, messages, partages." />
          <CardBody>
            {activity.length ? <Timeline items={activity} clientNames={clientNames} /> : <EmptyState compact icon={UsersRound} title="Aucune action pour le moment" description={profile.disabled_at ? "Ce compte n'a rien fait avant le retrait de son accès." : "Les actions apparaîtront ici dès la première connexion."} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Droits et accès" description={profile.role === "agency" ? "Choisis les pages visibles pour ce membre." : "Espace rattaché, fonction et accès au portail."} />
          <CardBody><AccessPanel profile={profile} clients={clients.filter((c) => c.status !== "archived").map((c) => ({ id: c.id, name: c.name }))} isSelf={profile.id === me.id} canManage={canAccess(me, "equipe")} demo={store.session.demo} /></CardBody>
        </Card>
      </div>
    </>
  );
}
