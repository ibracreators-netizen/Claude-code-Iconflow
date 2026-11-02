import type { Metadata } from "next";
import { Target, CalendarCheck, TrendingUp, PlugZap } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { PROSPECT_STATUS, type ProspectStatus } from "@/lib/marketing/types";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Données marketing" };

/** Chaque donnée affiche sa source et sa fraîcheur. Aucune donnée inventée : seules les données réelles de l'app. */
function Sourced({ children, source, fresh }: { children: React.ReactNode; source: string; fresh: string }) {
  return <div><div>{children}</div><p className="mt-2 text-[11px] text-muted-2">Source : {source} · {fresh}</p></div>;
}

export default async function MarketingDashboard() {
  const store = await requireMarketing("marketing_dashboard");
  const now = new Date();
  const [prospects, appts, settings] = await Promise.all([store.prospects(), store.appointments({ from: now.toISOString() }), store.settings()]);
  const byStatus = (s: ProspectStatus) => prospects.filter((p) => p.status === s).length;
  const optins = prospects.filter((p) => p.opted_in_at).length;
  const reservedOrBeyond = prospects.filter((p) => ["reserve", "converti"].includes(p.status)).length;
  const convRate = optins ? Math.round((reservedOrBeyond / optins) * 100) : null;
  const upcoming = appts.filter((a) => a.status === "confirme").length;
  const fresh = "à l'instant";

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Données marketing" description="Acquisition propre de l'agence. Chaque chiffre vient d'une source identifiée : aucune donnée de démonstration déguisée." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardBody><Sourced source="Iconflow Marketing" fresh={fresh}><Stat label="Prospects" value={prospects.length} icon={Target} tone="accent" /></Sourced></CardBody></Card>
        <Card><CardBody><Sourced source="Iconflow Marketing" fresh={fresh}><Stat label="Opt-ins" value={optins} icon={TrendingUp} /></Sourced></CardBody></Card>
        <Card><CardBody><Sourced source="Iconflow Marketing" fresh={fresh}><Stat label="RDV à venir" value={upcoming} icon={CalendarCheck} /></Sourced></CardBody></Card>
        <Card><CardBody><Sourced source="Iconflow Marketing" fresh={fresh}><Stat label="Opt-in → réservé" value={convRate === null ? "—" : `${convRate}%`} hint={convRate === null ? "Aucun opt-in encore" : undefined} icon={TrendingUp} /></Sourced></CardBody></Card>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Prospects par statut" description="Répartition réelle de ton pipeline d'acquisition." />
          <CardBody>
            <ul className="space-y-2">
              {(Object.keys(PROSPECT_STATUS) as ProspectStatus[]).map((s) => (
                <li key={s} className="flex items-center justify-between text-[13.5px]">
                  <span className="text-fg-2">{PROSPECT_STATUS[s]}</span><Badge tone={s === "converti" ? "success" : s === "perdu" ? "danger" : s === "reserve" ? "info" : "neutral"}>{byStatus(s)}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-2">Source : Iconflow Marketing · {fresh}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Publicité (Meta Ads)" description="Coût par lead, ROAS… nécessitent une connexion publicitaire." />
          <CardBody>
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border-strong p-4">
              <PlugZap className="size-5 shrink-0 text-muted" />
              <div>
                <p className="text-[13.5px] font-medium">Non connecté</p>
                <p className="mt-1 text-[12.5px] text-muted">Aucune source publicitaire n&apos;est reliée à l&apos;espace Marketing. Tant qu&apos;elle ne l&apos;est pas, aucun chiffre de coût ou de ROAS n&apos;est affiché (pas de valeur inventée). Le module Performance de Studio reste inchangé.</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
      {settings.availability.length === 0 || !settings.slot_minutes ? (
        <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">Aucune disponibilité n&apos;est configurée : le calendrier ne propose aucun créneau. Règle tes disponibilités dans les réglages.</p>
      ) : null}
    </>
  );
}
