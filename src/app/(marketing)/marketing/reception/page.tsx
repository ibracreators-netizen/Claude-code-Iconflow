import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, CircleCheck, Inbox } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { alertRecipients, envStatus, readBeat } from "@/lib/marketing/inbox";
import { schedulerState } from "@/lib/marketing/inbox-core";
import { INBOX_STATUS, type InboxStatus } from "@/lib/marketing/types";
import { isMailerConfigured } from "@/lib/email/mailer";
import { canAccess } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { InboxTable, ReceptionActions } from "./reception-client";

export const metadata: Metadata = { title: "Réception des leads" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUSES: InboxStatus[] = ["recu", "traite", "erreur", "suspect"];
const HINT: Record<InboxStatus, string> = { recu: "en attente de traitement", traite: "transformés en prospects", erreur: "à corriger puis retraiter", suspect: "à vérifier avant de retraiter" };

function ago(iso: string | null): string {
  if (!iso) return "jamais";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return `il y a ${s} s`;
  if (s < 5400) return `il y a ${Math.round(s / 60)} min`;
  if (s < 172800) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

/** Une ligne « état du service » : libellé, verdict en clair (jamais une couleur seule), précision. */
function Check({ ok, label, verdict, note }: { ok: boolean; label: string; verdict: string; note?: string }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <li className="flex items-start gap-3 border-b border-border py-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-success" : "text-warning")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-mono text-[12.5px] text-fg">{label}</span><span className={cn("text-[12.5px] font-semibold", ok ? "text-fg-2" : "text-warning")}>{verdict}</span></div>
        {note ? <p className="text-[12px] text-muted">{note}</p> : null}
      </div>
    </li>
  );
}

export default async function ReceptionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const store = await requireMarketing("marketing_reception");
  const status = STATUSES.includes(one(sp.statut) as InboxStatus) ? (one(sp.statut) as InboxStatus) : undefined;
  const [overview, beat, recipients, settings] = await Promise.all([store.inboxOverview({ status }), readBeat(), alertRecipients(), store.settings()]);
  const state = schedulerState(beat);
  const env = envStatus();
  const mailer = isMailerConfigured();
  const c = overview.counts;
  const pill = (active: boolean) => cn("rounded-full px-3 py-1.5 text-[13px] transition", active ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg");

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Réception" description="Tout ce que tes sites envoient arrive ici d'abord, tel quel. Chaque ligne devient ensuite un prospect. Rien n'est supprimé ni ignoré."
        actions={<div className="flex items-center gap-2">{store.demo ? <DemoBadge /> : null}{overview.available ? <ReceptionActions /> : null}</div>} />

      {!overview.available ? (
        <p className="mb-5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] text-warning">
          La boîte de réception n&apos;existe pas encore dans la base : la migration <span className="font-mono">0017_leads_inbox.sql</span> n&apos;est pas appliquée. Tant qu&apos;elle ne l&apos;est pas, les leads continuent d&apos;arriver par l&apos;ancienne route, directement dans Prospects.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((s) => (
          <Link key={s} href={status === s ? "/marketing/reception" : `/marketing/reception?statut=${s}`} aria-current={status === s ? "true" : undefined}
            className={cn("rounded-[20px] border bg-surface px-5 py-4 shadow-soft transition hover:border-border-strong", status === s ? "border-accent/40 ring-1 ring-accent/25" : "border-border")}>
            <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">{INBOX_STATUS[s]}</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular">{c[s]}</div>
            <div className="mt-2 text-[12.5px] text-muted">{s === "recu" && c.stuck > 0 ? `dont ${c.stuck} bloqué${c.stuck > 1 ? "s" : ""} depuis plus de 5 min` : HINT[s]}</div>
          </Link>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="État du service" description="Ce qui doit être en place pour que les leads soient traités et signalés. Seul l'état « lue » ou « manquante » est affiché, jamais une valeur." />
        <CardBody>
          <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-4">
            <Check ok={state === "ok"} label="Planificateur"
              verdict={state === "ok" ? `actif, ${ago(beat?.last_run_at ?? null)}` : state === "en_retard" ? `en retard, ${ago(beat?.last_run_at ?? null)}` : state === "arrete" ? `arrêté, dernier passage ${ago(beat?.last_run_at ?? null)}` : "jamais exécuté"}
              note={state === "ok" ? (beat?.ok === false && beat.detail ? `Dernier passage avec un souci : ${beat.detail}` : "Transforme les lignes « reçu » en prospects, toutes les minutes.") : "Les leads restent en sécurité ici, mais ne deviennent pas des prospects tout seuls. « Traiter maintenant » le fait à la main."} />
            <Check ok={mailer} label="Alertes par email" verdict={mailer ? "envoi réel" : "simulation"}
              note={mailer ? "Les alertes partent par Resend." : "Aucune alerte ne part tant que RESEND_API_KEY et EMAIL_FROM manquent : elle est notée « simulée » sur la ligne."} />
            <Check ok={recipients.length > 0} label="Destinataires des alertes" verdict={recipients.length ? `${recipients.length} adresse${recipients.length > 1 ? "s" : ""}` : "aucun"}
              note={recipients.length ? recipients.join(", ") : "Ajoute au moins une adresse dans Réglages, sinon personne n'est prévenu."} />
            {env.map((v) => <Check key={v.name} ok={v.read} label={v.name} verdict={v.read ? "lue" : "manquante"} note={v.role} />)}
          </ul>
        </CardBody>
      </Card>

      <div className="mb-3 mt-5 flex flex-wrap items-center gap-2">
        <Link href="/marketing/reception" className={pill(!status)}>Tout</Link>
        {STATUSES.map((s) => <Link key={s} href={`/marketing/reception?statut=${s}`} className={pill(status === s)}>{INBOX_STATUS[s]}</Link>)}
        <span className="ml-auto text-[12.5px] text-muted">{overview.rows.length} ligne{overview.rows.length > 1 ? "s" : ""}{overview.rows.length >= 200 ? " (200 dernières)" : ""}</span>
      </div>
      {overview.rows.length === 0 ? (
        <div className="card"><EmptyState icon={Inbox} title={status ? `Aucune ligne « ${INBOX_STATUS[status]} »` : "Aucun lead reçu"} description={status ? "Change de filtre pour voir les autres lignes." : "Dès qu'un site enverra un lead, il apparaîtra ici avec sa page d'entrée et ses paramètres de campagne. Tu peux envoyer un lead de test pour vérifier le circuit."} /></div>
      ) : (
        <InboxTable rows={overview.rows} timezone={settings.timezone} canSeeProspects={canAccess(store.session.profile, "marketing_prospects")} />
      )}
    </>
  );
}
