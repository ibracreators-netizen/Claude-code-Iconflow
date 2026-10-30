import { LogOut } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileForm, ThemeChoice } from "./client";
import { PasswordForm } from "@/components/account/password-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Mon compte" };

export default async function AccountPage() {
  const store = await requireClient();
  const { profile, user } = store.session;
  const [client, contacts] = await Promise.all([store.client(store.clientId), store.contacts(store.clientId)]);
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0];
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader eyebrow="Espace" title="Mon compte" description="Vos informations et vos préférences d'affichage." />
      <Card><CardHeader title="Profil" description="Le nom affiché dans les échanges avec l'équipe." /><CardBody><ProfileForm userId={profile.id} avatarUrl={profile.avatar_url} displayName={profile.display_name ?? ""} title={profile.title ?? ""} email={user.email} /></CardBody></Card>
      <Card><CardHeader title="Votre entreprise" description="Géré par icon-flow. Contactez-nous pour toute modification." /><CardBody>
        <dl className="grid gap-4 text-[13.5px] sm:grid-cols-2">
          <div><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Marque</dt><dd className="mt-1 font-medium">{client?.name}</dd></div>
          <div><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Secteur</dt><dd className="mt-1">{client?.sector ?? "—"}</dd></div>
          <div><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Contact principal</dt><dd className="mt-1">{primary ? `${primary.full_name}${primary.email ? ` · ${primary.email}` : ""}` : client?.contact_email ?? "—"}</dd></div>
          <div><dt className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Site</dt><dd className="mt-1">{client?.website ? <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-accent-2 hover:underline underline-offset-4">{client.website.replace(/^https?:\/\//, "")}</a> : "—"}</dd></div>
        </dl>
      </CardBody></Card>
      {isSupabaseConfigured() ? <Card><CardHeader title="Mot de passe" description="Pour vous connecter sans attendre un lien par email." /><CardBody><PasswordForm /></CardBody></Card> : null}
      <Card><CardHeader title="Apparence" /><CardBody><ThemeChoice /></CardBody></Card>
      <Card><CardBody className="flex items-center justify-between gap-4 pt-5"><div><p className="text-[14px] font-medium">Déconnexion</p><p className="text-[12.5px] text-muted">Vous pourrez vous reconnecter à tout moment.</p></div><form action="/auth/signout" method="post"><Button type="submit" variant="outline"><LogOut />Se déconnecter</Button></form></CardBody></Card>
    </div>
  );
}
