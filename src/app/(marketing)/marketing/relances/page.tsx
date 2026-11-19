import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Mail, MailWarning, TriangleAlert } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { EMAIL_STATUS, type EmailStatus } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { isMailerConfigured } from "@/lib/email/mailer";
import { PageHeader } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { CARD, EmptyBlock, Notice, Panel, Pill, TABLE, TableScroll, TD, TH, THEAD, TR, type Tone } from "../reglages/kit";
import { ProcessNow } from "./relances-client";

export const metadata: Metadata = { title: "Relances & rappels" };
const TEMPLATE_LABEL: Record<string, string> = { rappel_rdv: "Rappel de RDV", relance_optin: "Relance opt-in" };
const tone = (s: EmailStatus): Tone => (s === "sent" ? "success" : s === "failed" ? "danger" : s === "uncertain" ? "warn" : s === "cancelled" ? "neutral" : "teal");

export default async function RelancesPage() {
  const store = await requireMarketing("marketing_relances");
  const [settings, emails, prospects] = await Promise.all([store.settings(), store.scheduledEmails(), store.prospects()]);
  const name = Object.fromEntries(prospects.map((p) => [p.id, p.name ?? p.email ?? "Prospect"]));

  return (
    <>
      <PageHeader title="Emails automatiques" description="File d'attente des emails (rappels de RDV, relances d'opt-in). Traitement par lots, idempotent." actions={<div className="flex flex-wrap items-center gap-2">{store.demo ? <span className="hidden lg:inline-flex"><DemoBadge /></span> : null}<ProcessNow /></div>} />

      {!settings.emails_live ? (
        <Notice icon={MailWarning} title="Mode simulation" className="mb-4">
          Aucun email n&apos;est envoyé. Chaque traitement enregistre ce qui <em>aurait</em> été envoyé (marqué « simulé »). Active l&apos;envoi réel dans les <Link href="/marketing/reglages" className="font-medium text-accent-2 underline underline-offset-2">réglages</Link>, après vérification.
        </Notice>
      ) : !isMailerConfigured() ? (
        <Notice tone="warn" icon={TriangleAlert} className="mb-4">Envoi réel demandé, mais Resend n&apos;est pas configuré (RESEND_API_KEY, EMAIL_FROM). Les envois resteront en simulation tant que ce n&apos;est pas réglé sur l&apos;hébergeur.</Notice>
      ) : (
        <Notice tone="success" icon={CircleCheck} className="mb-4">Envoi réel activé. {settings.test_email ? `Mode adresse de test : tout part vers ${settings.test_email}.` : "Les emails partent aux prospects."}</Notice>
      )}

      {emails.length === 0 ? (
        <Panel><EmptyBlock icon={Mail} title="File vide" description="Les rappels se programment à la confirmation d'un RDV ; les relances, à l'opt-in (si un délai est configuré)." /></Panel>
      ) : (
        <section className={cn(CARD, "overflow-hidden")}>
          {/* Ordinateur : tableau */}
          <TableScroll className="hidden lg:block">
            <table className={cn(TABLE, "min-w-[640px]")}>
              <thead className={THEAD}><tr><th scope="col" className={TH}>Email</th><th scope="col" className={TH}>Prospect</th><th scope="col" className={TH}>Envoi prévu</th><th scope="col" className={TH}>Statut</th></tr></thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id} className={TR}>
                    <td className={cn(TD, "whitespace-nowrap font-medium text-mk-strong")}>{TEMPLATE_LABEL[e.template] ?? e.template}</td>
                    <td className={cn(TD, "max-w-[320px]")}>
                      <Link href={e.prospect_id ? `/marketing/crm/${e.prospect_id}` : "#"} className="block truncate text-mk-text hover:text-accent-2 hover:underline">{e.prospect_id ? name[e.prospect_id] ?? "Prospect" : "—"}</Link>
                      {e.last_error ? <span className="mt-0.5 block text-[12.5px] text-mk-sub">{e.last_error}</span> : null}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-[13px] text-mk-sub tabular-nums")}>{formatDateTimeInZone(e.send_at, settings.timezone)}</td>
                    <td className={TD}><span className="flex flex-wrap items-center gap-1.5">{e.dry_run && e.status === "sent" ? <Pill>Simulé</Pill> : null}<Pill tone={tone(e.status)}>{EMAIL_STATUS[e.status]}</Pill></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          {/* Téléphone : une ligne par email */}
          <ul className="lg:hidden">
            {emails.map((e) => (
              <li key={e.id} className="border-b border-mk-line px-4 py-3.5 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="pt-0.5 text-[15px] font-semibold text-mk-strong">{TEMPLATE_LABEL[e.template] ?? e.template}</span>
                  <span className="flex flex-wrap justify-end gap-1.5">{e.dry_run && e.status === "sent" ? <Pill>Simulé</Pill> : null}<Pill tone={tone(e.status)}>{EMAIL_STATUS[e.status]}</Pill></span>
                </div>
                <Link href={e.prospect_id ? `/marketing/crm/${e.prospect_id}` : "#"} className="mt-0.5 block truncate text-[14px] text-mk-text">{e.prospect_id ? name[e.prospect_id] ?? "Prospect" : "—"}</Link>
                <p className="mt-0.5 text-[13px] text-mk-sub tabular-nums">{formatDateTimeInZone(e.send_at, settings.timezone)}</p>
                {e.last_error ? <p className="mt-1 text-[13px] text-mk-sub">{e.last_error}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-4 text-[13px] text-mk-sub">Le traitement automatique à la minute se fait côté hébergeur (worker protégé par secret). Voir docs/features/marketing.md pour le branchement (pg_cron / scheduler), non activé dans cette itération.</p>
    </>
  );
}
