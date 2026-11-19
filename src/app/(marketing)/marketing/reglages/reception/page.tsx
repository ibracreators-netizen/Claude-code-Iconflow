import type { Metadata } from "next";
import { CircleAlert, CircleCheck, Inbox, TriangleAlert } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { alertRecipients, envStatus, readBeat } from "@/lib/marketing/inbox";
import { schedulerState } from "@/lib/marketing/inbox-core";
import { INBOX_STATUS, type InboxStatus } from "@/lib/marketing/types";
import { isMailerConfigured } from "@/lib/email/mailer";
import { canAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { ChipLink, Code, EmptyBlock, Notice, Panel, StatTile } from "../kit";
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
function Check({ ok, label, verdict, note, code }: { ok: boolean; label: string; verdict: string; note?: string; code?: boolean }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <li className="flex items-start gap-3 rounded-[10px] border border-mk-line p-3.5">
      <Icon className={cn("mt-0.5 size-[18px] shrink-0", ok ? "text-mk-success" : "text-mk-warn")} strokeWidth={1.9} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {code ? <Code className="text-[12.5px]">{label}</Code> : <span className="text-[14px] font-medium text-mk-strong">{label}</span>}
          <span className={cn("text-[13px] font-semibold", ok ? "text-mk-success" : "text-mk-warn")}>{verdict}</span>
        </div>
        {note ? <p className="mt-1 text-[13px] leading-snug text-mk-sub [overflow-wrap:anywhere]">{note}</p> : null}
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

  return (
    <>
      <PageHeader title="Leads reçus" description="Contrôle technique : tout ce que tes sites envoient arrive ici d'abord, tel quel, puis entre dans le CRM. Rien n'est supprimé ni ignoré."
        actions={<div className="flex flex-wrap items-center gap-2">{store.demo ? <span className="hidden lg:inline-flex"><DemoBadge /></span> : null}{overview.available ? <ReceptionActions /> : null}</div>} />

      {!overview.available ? (
        <Notice tone="warn" icon={TriangleAlert} className="mb-4">
          La boîte de réception n&apos;existe pas encore dans la base : la migration <b className="font-semibold">0017_leads_inbox.sql</b> n&apos;est pas appliquée. Tant qu&apos;elle ne l&apos;est pas, les leads continuent d&apos;arriver par l&apos;ancienne route, directement dans Prospects.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        {STATUSES.map((s) => (
          <StatTile key={s} href={status === s ? "/marketing/reglages/reception" : `/marketing/reglages/reception?statut=${s}`} active={status === s}
            label={INBOX_STATUS[s]} value={c[s]} hint={s === "recu" && c.stuck > 0 ? `dont ${c.stuck} bloqué${c.stuck > 1 ? "s" : ""} depuis plus de 5 min` : HINT[s]} />
        ))}
      </div>

      <Panel className="mt-4" title="État du service" description="Ce qui doit être en place pour que les leads soient traités et signalés. Seul l'état « lue » ou « manquante » est affiché, jamais une valeur.">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Check ok={state === "ok"} label="Planificateur"
            verdict={state === "ok" ? `actif, ${ago(beat?.last_run_at ?? null)}` : state === "en_retard" ? `en retard, ${ago(beat?.last_run_at ?? null)}` : state === "arrete" ? `arrêté, dernier passage ${ago(beat?.last_run_at ?? null)}` : "jamais exécuté"}
            note={state === "ok" ? (beat?.ok === false && beat.detail ? `Dernier passage avec un souci : ${beat.detail}` : "Transforme les lignes « reçu » en prospects, toutes les minutes.") : "Les leads restent en sécurité ici, mais ne deviennent pas des prospects tout seuls. « Traiter maintenant » le fait à la main."} />
          <Check ok={mailer} label="Alertes par email" verdict={mailer ? "envoi réel" : "simulation"}
            note={mailer ? "Les alertes partent par Resend." : "Aucune alerte ne part tant que RESEND_API_KEY et EMAIL_FROM manquent : elle est notée « simulée » sur la ligne."} />
          <Check ok={recipients.length > 0} label="Destinataires des alertes" verdict={recipients.length ? `${recipients.length} adresse${recipients.length > 1 ? "s" : ""}` : "aucun"}
            note={recipients.length ? recipients.join(", ") : "Ajoute au moins une adresse dans Réglages, sinon personne n'est prévenu."} />
          {env.map((v) => <Check key={v.name} code ok={v.read} label={v.name} verdict={v.read ? "lue" : "manquante"} note={v.role} />)}
        </ul>
      </Panel>

      <div className="mb-3 mt-6 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <nav aria-label="Filtrer par statut" className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-1 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          <ChipLink href="/marketing/reglages/reception" active={!status}>Tout</ChipLink>
          {STATUSES.map((s) => <ChipLink key={s} href={`/marketing/reglages/reception?statut=${s}`} active={status === s}>{INBOX_STATUS[s]}</ChipLink>)}
        </nav>
        <span className="shrink-0 text-[13px] text-mk-sub tabular-nums">{overview.rows.length} ligne{overview.rows.length > 1 ? "s" : ""}{overview.rows.length >= 200 ? " (200 dernières)" : ""}</span>
      </div>
      {overview.rows.length === 0 ? (
        <Panel><EmptyBlock icon={Inbox} title={status ? `Aucune ligne « ${INBOX_STATUS[status]} »` : "Aucun lead reçu"} description={status ? "Change de filtre pour voir les autres lignes." : "Dès qu'un site enverra un lead, il apparaîtra ici avec sa page d'entrée et ses paramètres de campagne. Tu peux envoyer un lead de test pour vérifier le circuit."} /></Panel>
      ) : (
        <InboxTable rows={overview.rows} timezone={settings.timezone} canSeeProspects={canAccess(store.session.profile, "marketing_prospects")} />
      )}
    </>
  );
}
