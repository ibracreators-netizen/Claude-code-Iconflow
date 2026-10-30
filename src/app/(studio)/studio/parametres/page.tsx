import Link from "next/link";
import { Database, KeyRound, Palette, Sparkles, UserRound } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";
import { isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/env";
import { AppearancePicker } from "./_appearance";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const store = await requireAgency("parametres");
  const me = store.session.profile;
  const configured = isSupabaseConfigured();
  const host = configured ? new URL(SUPABASE_URL).hostname : null;
  return (
    <>
      <PageHeader eyebrow="Gestion" title="Paramètres" description="Ton profil, l'apparence du studio et la connexion aux données." />
      <div className="mx-auto grid max-w-[900px] gap-6">
        <Card><CardHeader title={<span className="flex items-center gap-2"><UserRound className="size-4 text-accent-2" />Profil</span>} description="Visible par l'équipe et dans l'historique des décisions." /><CardBody><ProfileForm userId={me.id} avatarUrl={me.avatar_url} displayName={me.display_name ?? ""} title={me.title ?? ""} email={store.session.user.email} /></CardBody></Card>
        {configured ? <Card><CardHeader title={<span className="flex items-center gap-2"><KeyRound className="size-4 text-warning" />Mot de passe</span>} description="Pour te connecter sans attendre un lien par email." /><CardBody><PasswordForm /></CardBody></Card> : null}
        <Card><CardHeader title={<span className="flex items-center gap-2"><Palette className="size-4 text-violet" />Apparence</span>} description="Préférence enregistrée sur cet appareil." /><CardBody><AppearancePicker /></CardBody></Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Database className="size-4 text-info" />Connexion aux données</span>} action={configured ? <Badge tone="success" dot>Supabase connecté</Badge> : <Badge tone="warning" dot>Mode démo</Badge>} />
          <CardBody className="space-y-3 text-[13.5px] text-fg-2">
            {configured ? (
              <>
                <p>Le studio est relié au projet <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px]">{host}</code>. Les droits sont appliqués par les politiques RLS de la base : chaque membre n&apos;accède qu&apos;à ses modules, chaque client ne voit que son espace.</p>
                <p className="text-muted">Pour appliquer les migrations ou gérer les comptes : Supabase Dashboard → SQL Editor / Authentication. Le guide complet est dans <code className="font-mono text-[12.5px]">docs/SETUP.md</code>.</p>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-warning" /><p>Tu explores une démonstration : les données sont fictives, en mémoire, et réinitialisées au redémarrage du serveur.</p></div>
                <p>Pour connecter la vraie base, renseigne dans l&apos;environnement :</p>
                <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] leading-relaxed">{`NEXT_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé publique>`}</pre>
                <p className="text-muted">Puis exécute les migrations de <code className="font-mono text-[12.5px]">supabase/migrations</code>. Tout est détaillé dans <code className="font-mono text-[12.5px]">docs/SETUP.md</code>.</p>
              </>
            )}
            <div className="flex flex-wrap gap-3 pt-1 text-[13px]"><Link href="/studio/equipe" className="text-accent-2 hover:underline">Gérer l&apos;équipe et les accès →</Link></div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
