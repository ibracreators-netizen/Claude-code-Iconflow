import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, UserPlus, UsersRound } from "lucide-react";
import { crmPage, facts, isAdmin, salesRole } from "@/lib/marketing/crm-server";
import { buildKpi } from "@/lib/marketing/kpi";
import { SALES_ROLE_LABEL } from "@/lib/marketing/team";
import { KIND_LABEL, teamForPages } from "@/lib/marketing/team-view";
import { euro } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { DemoBadge } from "@/components/shared/demo-badge";
import { SectionTabs } from "@/components/layout/section-tabs";
import { BTN, CARD, EmptyBlock, MemberAvatar, Panel, Pill } from "../reglages/kit";

export const metadata: Metadata = { title: "Équipe" };
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);

export default async function EquipePage() {
  const crm = await crmPage("marketing_equipe");
  if (salesRole(crm.session)) redirect("/marketing/espace");
  const [team, f] = await Promise.all([teamForPages(), facts(crm, { tasks: true })]);
  const now = new Date(), from = new Date(now.getTime() - 30 * 86_400_000).toISOString(), to = new Date(now.getTime() + 60_000).toISOString();
  const kpi = buildKpi({ prospects: f.prospects, appointments: f.appointments, tasks: f.tasks, entries: [], members: team.map((m) => ({ id: m.id, name: m.name, marketing_role: m.role })), wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id), from, to });
  const closed = new Set(f.stages.filter((s) => s.kind !== "ouvert").map((s) => s.id));
  const open = (id: string) => f.prospects.filter((p) => (p.setter_id === id || p.closer_id === id) && !(p.stage_id && closed.has(p.stage_id))).length;
  const setter = new Map(kpi.setters.map((s) => [s.id, s])), closer = new Map(kpi.closers.map((c) => [c.id, c]));
  const active = team.filter((m) => !m.disabled), off = team.filter((m) => m.disabled);

  return (
    <>
      <PageHeader title="Équipe" description="Les membres de l'espace Marketing, leur rôle, leur activité des 30 derniers jours et leur historique."
        actions={<div className="flex items-center gap-2">{crm.demo ? <DemoBadge /> : null}{isAdmin(crm.session) ? <Link href="/marketing/reglages/equipe" className={cn(buttonVariants({}), BTN)}><UserPlus />Inviter et gérer les accès</Link> : null}</div>} />
      <SectionTabs section="equipe" current="/marketing/equipe" />
      {team.length === 0 ? <Panel><EmptyBlock icon={UsersRound} title="Aucun membre pour l'instant" description="Invite ton premier setter ou closer depuis Réglages › Équipe." /></Panel> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...active, ...off].map((m) => {
            const s = setter.get(m.id), c = closer.get(m.id);
            const stats: Array<[string, string]> = m.role === "media_buyer" ? [] : m.role === "closer" || (!m.role && c && c.held > 0)
              ? [["Leads en cours", String(open(m.id))], ["Appels tenus", String(c?.held ?? 0)], ["Taux de closing", pct(c?.closeRate ?? null)], ["Signé HT", euro.format(c?.amount ?? 0)]]
              : [["Leads en cours", String(open(m.id))], ["Leads reçus", String(s?.assigned ?? 0)], ["RDV pris", String(s?.booked ?? 0)], ["Taux de présence", pct(s?.showRate ?? null)]];
            return (
              <Link key={m.id} href={`/marketing/equipe/${m.id}`} className={cn(CARD, "group flex flex-col p-4 transition hover:border-mk-input sm:p-5")}>
                <div className="flex items-center gap-3">
                  <MemberAvatar name={m.name} src={m.avatar} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold text-mk-strong transition-colors group-hover:text-accent-2">{m.name}{m.id === crm.session.user.id ? " (toi)" : ""}</p>
                    <p className="truncate text-[13px] text-mk-sub">{m.email ?? "sans email"}</p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-mk-icon" aria-hidden />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Pill tone={m.kind === "admin" ? "accent" : "neutral"}>{m.role ? SALES_ROLE_LABEL[m.role] : KIND_LABEL[m.kind]}</Pill>
                  {m.disabled ? <Pill tone="danger">Accès retiré</Pill> : null}
                </div>
                {stats.length ? (
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-mk-line pt-4">
                    {stats.map(([k, v]) => <div key={k} className="min-w-0"><dt className="truncate text-[13px] font-medium text-mk-sub">{k}</dt><dd className="mt-0.5 text-[20px] font-semibold leading-7 text-mk-strong tabular-nums">{v}</dd></div>)}
                  </dl>
                ) : <p className="mt-4 border-t border-mk-line pt-4 text-[14px] text-mk-sub">{m.role === "media_buyer" ? "Suit l'acquisition et la publicité, sans accès aux coordonnées." : "Voir sa fiche et son historique."}</p>}
              </Link>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-[13px] text-mk-sub">Chiffres des 30 derniers jours, calculés à partir du CRM. Le détail et les règles de calcul sont dans KPI.</p>
    </>
  );
}
