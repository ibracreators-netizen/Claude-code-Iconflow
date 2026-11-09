import type { Metadata } from "next";
import Link from "next/link";
import { MailWarning, Mail } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { EMAIL_STATUS, type EmailStatus } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { isMailerConfigured } from "@/lib/email/mailer";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/shared/demo-badge";
import { ProcessNow } from "./relances-client";

export const metadata: Metadata = { title: "Relances & rappels" };
const TEMPLATE_LABEL: Record<string, string> = { rappel_rdv: "Rappel de RDV", relance_optin: "Relance opt-in" };
const tone = (s: EmailStatus): "success" | "danger" | "warning" | "neutral" | "info" => (s === "sent" ? "success" : s === "failed" ? "danger" : s === "uncertain" ? "warning" : s === "cancelled" ? "neutral" : "info");

export default async function RelancesPage() {
  const store = await requireMarketing("marketing_relances");
  const [settings, emails, prospects] = await Promise.all([store.settings(), store.scheduledEmails(), store.prospects()]);
  const name = Object.fromEntries(prospects.map((p) => [p.id, p.name ?? p.email ?? "Prospect"]));

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Relances & rappels" description="File d'attente des emails (rappels de RDV, relances d'opt-in). Traitement par lots, idempotent." actions={<div className="flex items-center gap-2">{store.demo ? <DemoBadge /> : null}<ProcessNow /></div>} />

      {!settings.emails_live ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4">
          <MailWarning className="size-5 shrink-0 text-info" />
          <div><p className="text-[14px] font-medium">Mode simulation (DRY RUN)</p><p className="mt-1 text-[12.5px] text-muted">Aucun email n&apos;est envoyé. Chaque traitement enregistre ce qui <em>aurait</em> été envoyé (marqué « simulé »). Active l&apos;envoi réel dans les <Link href="/marketing/reglages" className="underline">réglages</Link>, après vérification.</p></div>
        </div>
      ) : !isMailerConfigured() ? (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-[13px] text-warning">Envoi réel demandé, mais Resend n&apos;est pas configuré (RESEND_API_KEY, EMAIL_FROM). Les envois resteront en simulation tant que ce n&apos;est pas réglé sur l&apos;hébergeur.</div>
      ) : (
        <div className="mb-4 rounded-xl border border-success/30 bg-success/10 p-4 text-[13px] text-success">Envoi réel activé. {settings.test_email ? `Mode adresse de test : tout part vers ${settings.test_email}.` : "Les emails partent aux prospects."}</div>
      )}

      {emails.length === 0 ? (
        <Card className="p-0"><EmptyState icon={Mail} title="File vide" description="Les rappels se programment à la confirmation d'un RDV ; les relances, à l'opt-in (si un délai est configuré)." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {emails.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
                <span className="font-medium">{TEMPLATE_LABEL[e.template] ?? e.template}</span>
                <Link href={e.prospect_id ? `/marketing/prospects/${e.prospect_id}` : "#"} className="min-w-0 flex-1 truncate text-muted hover:text-accent-2">{e.prospect_id ? name[e.prospect_id] ?? "Prospect" : "—"}</Link>
                <span className="text-[12px] text-muted">{formatDateTimeInZone(e.send_at, settings.timezone)}</span>
                {e.dry_run && e.status === "sent" ? <Badge tone="neutral">Simulé</Badge> : null}
                <Badge tone={tone(e.status)}>{EMAIL_STATUS[e.status]}</Badge>
                {e.last_error ? <span className="w-full text-[11.5px] text-muted-2">{e.last_error}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-[11.5px] text-muted-2">Le traitement automatique à la minute se fait côté hébergeur (worker protégé par secret). Voir docs/features/marketing.md pour le branchement (pg_cron / scheduler), non activé dans cette itération.</p>
    </>
  );
}
