import type { Metadata } from "next";
import Link from "next/link";
import { crmPage, facts, members } from "@/lib/marketing/crm-server";
import { LEADERBOARD_RULES, buildLeaderboard } from "@/lib/marketing/leaderboard";
import { euro } from "@/lib/marketing/ui";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Classement" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PERIODS = [7, 30, 90] as const;
const pct = (v: number | null) => (v === null ? <span className="text-muted">pas assez de données</span> : `${String(v).replace(".", ",")} %`);
const Insufficient = ({ reason }: { reason: string | null }) => <p className="mx-5 mb-5 rounded-lg bg-surface-2 px-3.5 py-3 text-[13.5px] text-fg-2">{reason}</p>;
const Head = ({ children, rule, right = true }: { children: React.ReactNode; rule?: string; right?: boolean }) => (
  <th scope="col" className={cn("px-3 py-2.5 align-top font-medium", right && "text-right")}>
    <span className="block font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">{children}</span>
    {rule ? <span className="mt-1 block max-w-[220px] text-[11px] font-normal normal-case leading-snug text-muted-2" style={right ? { marginLeft: "auto" } : undefined}>{rule}</span> : null}
  </th>
);

export default async function ClassementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_classement");
  const days = PERIODS.includes(Number(one(sp.jours)) as (typeof PERIODS)[number]) ? Number(one(sp.jours)) : 30;
  const [f, team] = await Promise.all([facts(crm, { tasks: true }), members()]);
  const now = new Date(), from = new Date(now.getTime() - days * 86_400_000).toISOString(), to = new Date(now.getTime() + 60_000).toISOString();
  const board = buildLeaderboard({ prospects: f.prospects, appointments: f.appointments, tasks: f.tasks, members: team, from, to });
  const pill = (active: boolean) => cn("rounded-full px-3 py-1.5 text-[13px] transition", active ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg");
  const me = crm.session.user.id;

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Classement" description="Les performances des setters et des closers sur la période. Chaque chiffre a sa règle de calcul, écrite sous son intitulé." actions={crm.demo ? <DemoBadge /> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2">{PERIODS.map((d) => <Link key={d} href={`/marketing/classement?jours=${d}`} aria-current={d === days ? "true" : undefined} className={pill(d === days)}>{d} jours</Link>)}</div>

      <Card>
        <CardHeader title="Setters" description={LEADERBOARD_RULES.setterRank} />
        {!board.setters.ranked ? <Insufficient reason={board.setters.reason} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead><tr className="border-b border-border"><Head right={false}>Rang</Head><Head right={false}>Setter</Head><Head rule={LEADERBOARD_RULES.handled}>Leads traités</Head><Head rule={LEADERBOARD_RULES.booked}>Rendez-vous pris</Head><Head rule={LEADERBOARD_RULES.showRate}>Taux de présence</Head></tr></thead>
              <tbody className="divide-y divide-border">
                {board.setters.rows.map((r, i) => (
                  <tr key={r.id} className={r.id === me ? "bg-accent-soft/40" : undefined}>
                    <td className="px-3 py-2.5 pl-5 font-semibold tabular">{i + 1}</td><th scope="row" className="px-3 py-2.5 text-left font-medium">{r.name}{r.id === me ? " (toi)" : ""}</th>
                    <td className="px-3 py-2.5 text-right tabular">{r.handled}</td><td className="px-3 py-2.5 text-right font-semibold tabular">{r.booked}</td><td className="px-3 py-2.5 pr-5 text-right tabular">{pct(r.showRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Closers" description={LEADERBOARD_RULES.closerRank} />
        {!board.closers.ranked ? <Insufficient reason={board.closers.reason} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead><tr className="border-b border-border"><Head right={false}>Rang</Head><Head right={false}>Closer</Head><Head rule={LEADERBOARD_RULES.held}>Appels tenus</Head><Head rule={LEADERBOARD_RULES.closeRate}>Taux de signature</Head><Head rule={LEADERBOARD_RULES.amount}>Montant signé HT</Head></tr></thead>
              <tbody className="divide-y divide-border">
                {board.closers.rows.map((r, i) => (
                  <tr key={r.id} className={r.id === me ? "bg-accent-soft/40" : undefined}>
                    <td className="px-3 py-2.5 pl-5 font-semibold tabular">{i + 1}</td><th scope="row" className="px-3 py-2.5 text-left font-medium">{r.name}{r.id === me ? " (toi)" : ""}</th>
                    <td className="px-3 py-2.5 text-right tabular">{r.held}</td><td className="px-3 py-2.5 text-right tabular">{pct(r.closeRate)}</td><td className="px-3 py-2.5 pr-5 text-right font-semibold tabular">{euro.format(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
