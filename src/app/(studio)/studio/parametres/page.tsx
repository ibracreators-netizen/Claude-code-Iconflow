import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Database, KeyRound, Mail, Palette, Sparkles, UserRound, XCircle } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";
import { isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/env";
import { setupChecks } from "@/lib/supabase/diagnostics";
import { mailerStatus } from "@/lib/email/mailer";
import { hasFullAccess } from "@/lib/permissions";
import { AppearancePicker } from "./_appearance";
import { EmailTestButton } from "./_email-test";

export const metadata = { title: "Paramètres" };

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px]">{children}</code>;

export default async function SettingsPage() {
  const store = await requireAgency("parametres");
  const me = store.session.profile;
  const configured = isSupabaseConfigured();
  const host = configured ? new URL(SUPABASE_URL).hostname : null;
  const checks = configured ? await setupChecks() : [];
  const missing = checks.filter((c) => c.required && c.ok === false).length;
  const admin = hasFullAccess(me);
  const mailer = mailerStatus();
  const missingVar = mailer.missing.length === 1 ? (mailer.missing[0] === "EMAIL_FROM" ? " EMAIL_FROM manque ou n'est pas une adresse valide." : " RESEND_API_KEY manque.") : "";
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
                <ul className="divide-y divide-border rounded-lg hairline">
                  {checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2.5 px-3 py-2 text-[13px]">
                      {c.ok === true ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : c.ok === false ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" />}
                      <div className="min-w-0 flex-1"><p>{c.label}{!c.required ? <span className="ml-2 text-[11px] text-muted">optionnel</span> : null}</p>{c.detail && c.ok !== true ? <p className="mt-0.5 break-words font-mono text-[11.5px] text-muted">{c.detail}</p> : null}</div>
                    </li>
                  ))}
                </ul>
                <p className="text-muted">{missing ? `${missing} migration${missing > 1 ? "s" : ""} à exécuter dans Supabase → SQL Editor (fichiers supabase/migrations, dans l'ordre).` : "Toutes les migrations sont appliquées."} Le guide complet est dans <code className="font-mono text-[12.5px]">docs/SETUP.md</code>.</p>
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
        {admin ? (
          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><Mail className="size-4 text-accent-2" />Emails</span>}
              description="Invitations de l'équipe, accès clients et liens de connexion."
              action={!configured ? <Badge tone="warning" dot>Mode démo</Badge> : mailer.configured ? <Badge tone="success" dot>Resend configuré</Badge> : <Badge tone="warning" dot>Service Supabase par défaut</Badge>}
            />
            <CardBody className="space-y-3 text-[13.5px] text-fg-2">
              {!configured ? (
                <p>En démo, aucun email n&apos;est envoyé : les comptes sont créés en mémoire. En production, le studio envoie ses emails par Resend dès que <Code>RESEND_API_KEY</Code> et <Code>EMAIL_FROM</Code> sont renseignées ; sinon, Supabase les envoie (service par défaut limité, ou SMTP du projet).</p>
              ) : mailer.configured ? (
                <>
                  <p>Le studio envoie lui-même ses emails depuis <Code>{mailer.sender}</Code> : plus aucune limite du service par défaut de Supabase. Les liens d&apos;invitation et de connexion restent générés par Supabase : ils servent une fois et expirent au bout d&apos;une heure (durée réglable dans Supabase).</p>
                  <div className="flex flex-wrap items-center gap-3"><EmailTestButton /><span className="text-[12.5px] text-muted">Envoyé à {store.session.user.email}.</span></div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><p>Les emails partent par le service par défaut de Supabase : environ 2 emails par heure, et seulement vers les adresses des membres du projet Supabase. Les invitations et les liens de connexion peuvent donc ne jamais arriver.</p></div>
                  <p>Deux solutions, au choix :</p>
                  <ul className="list-disc space-y-1.5 pl-5">
                    <li>Renseigner <Code>RESEND_API_KEY</Code> et <Code>EMAIL_FROM</Code> sur l&apos;hébergeur : le studio envoie alors ses propres emails (invitations, accès clients, liens de connexion, renvois).{missingVar}</li>
                    <li>Ou configurer un SMTP personnalisé dans Supabase → Authentication → SMTP Settings, puis relever les limites dans Authentication → Rate Limits.</li>
                  </ul>
                  <div className="flex flex-wrap items-center gap-3"><EmailTestButton /><span className="text-[12.5px] text-muted">Envoie un lien de connexion à {store.session.user.email} par Supabase.</span></div>
                </>
              )}
              <p className="text-muted">Le guide détaillé est dans <code className="font-mono text-[12.5px]">docs/features/emails.md</code>.</p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
