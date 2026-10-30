import Link from "next/link";
import { ArrowRight, CheckCircle2, Clapperboard, FileText, MessageSquare, CalendarDays } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { computeKpis, BRIEF_STATUS, LIVRABLE_STATUS, EVENT_KIND } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Progress } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { Section } from "./_components/section";
import { KpiGrid } from "./_components/kpis";

export const metadata = { title: "Vue d'ensemble" };

export default async function PortalHome() {
  const store = await requireClient();
  const { profile } = store.session;
  const clientId = store.clientId;
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [client, briefs, livrables, metrics, docs, events, activity, team] = await Promise.all([
    store.client(clientId), store.briefs({ clientId }), store.livrables({ clientId }), store.metrics({ clientId, from: since }),
    store.documents({ clientId }), store.events({ clientId, from: new Date().toISOString() }), store.activity({ clientId, limit: 8 }), store.profiles(),
  ]);
  const firstName = (profile.display_name ?? "").split(" ")[0] || "bonjour";
  const toValidateBriefs = briefs.filter((b) => b.kind === "video" && b.status === "attente_client");
  const toValidateLivrables = livrables.filter((l) => l.status === "attente_client");
  const pending = toValidateBriefs.length + toValidateLivrables.length;
  const kpis = metrics.length ? computeKpis(metrics) : null;
  const month = new Date().toISOString().slice(0, 7);
  const monthBriefs = briefs.filter((b) => b.month.startsWith(month));
  const monthLivrables = livrables.filter((l) => l.month.startsWith(month));
  const agency = team.filter((p) => p.role === "agency");
  const count = <T extends { status: string }>(rows: T[], s: string) => rows.filter((r) => r.status === s).length;
  const hour = new Date().getHours();
  const greet = hour < 18 ? "Bonjour" : "Bonsoir";

  return (
    <div className="space-y-8">
      <header className="animate-rise">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-2"><span className="size-1.5 rounded-full bg-accent" />{client?.name ?? "Votre espace"}</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] md:text-[32px]">{greet} {firstName} 👋</h1>
        <p className="mt-1 text-[14px] text-muted">{pending ? `${pending} élément${pending > 1 ? "s" : ""} attend${pending > 1 ? "ent" : ""} votre validation.` : "Tout est en production. Rien à valider pour l'instant."}</p>
      </header>

      {pending ? (
        <section className="card relative overflow-hidden p-5 animate-rise">
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent/15 blur-3xl" />
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><CheckCircle2 className="size-4 text-accent-2" />À valider</h2>
            <Link href="/app/validations" className="text-[12.5px] font-medium text-accent-2 hover:underline underline-offset-4">Tout voir</Link>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {toValidateBriefs.map((b) => (
              <li key={b.id}><Link href={`/app/briefs/${b.id}`} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3 transition hover:bg-surface-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface text-info hairline"><FileText className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{b.title}</span><span className="text-[12px] text-muted">Script vidéo · version {b.script_version}</span></span>
                <ArrowRight className="size-4 text-muted" />
              </Link></li>
            ))}
            {toValidateLivrables.map((l) => (
              <li key={l.id}><Link href={`/app/livrables/${l.id}`} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3 transition hover:bg-surface-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface text-violet hairline"><Clapperboard className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{l.title}</span><span className="text-[12px] text-muted">{LIVRABLE_STATUS[l.status]}{l.duration_sec ? ` · ${l.duration_sec} s` : ""}</span></span>
                <ArrowRight className="size-4 text-muted" />
              </Link></li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Ce mois-ci" description="Avancement de la production" className="lg:col-span-1">
          <div className="card space-y-5 p-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-[13px]"><span className="font-medium">Scripts</span><span className="text-muted tabular">{count(monthBriefs, "valide")}/{monthBriefs.length} validés</span></div>
              <Progress value={monthBriefs.length ? (count(monthBriefs, "valide") / monthBriefs.length) * 100 : 0} />
              <div className="mt-2 flex flex-wrap gap-1.5">{(["attente_ibra", "attente_client", "valide"] as const).map((s) => count(monthBriefs, s) ? <Badge key={s} tone="neutral">{count(monthBriefs, s)} {BRIEF_STATUS[s].toLowerCase()}</Badge> : null)}</div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-[13px]"><span className="font-medium">Livrables</span><span className="text-muted tabular">{count(monthLivrables, "valide")}/{monthLivrables.length} validés</span></div>
              <Progress value={monthLivrables.length ? (count(monthLivrables, "valide") / monthLivrables.length) * 100 : 0} tone="info" />
              <div className="mt-2 flex flex-wrap gap-1.5">{(["en_controle", "attente_client", "correction", "valide"] as const).map((s) => count(monthLivrables, s) ? <Badge key={s} tone="neutral">{count(monthLivrables, s)} {LIVRABLE_STATUS[s].toLowerCase()}</Badge> : null)}</div>
            </div>
            {!monthBriefs.length && !monthLivrables.length ? <p className="text-[13px] text-muted">Aucun élément planifié ce mois-ci pour le moment.</p> : null}
          </div>
        </Section>
        <Section title="Performance · 30 derniers jours" href="/app/performance" className="lg:col-span-2">
          {kpis ? <KpiGrid k={kpis} compact /> : <div className="card"><EmptyState compact title="Pas encore de données de performance" description="Les résultats de vos campagnes apparaîtront ici dès la première diffusion." /></div>}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Derniers livrables" href="/app/livrables" className="lg:col-span-2">
          {livrables.length ? (
            <ul className="grid gap-3 sm:grid-cols-3">
              {livrables.slice(0, 3).map((l) => (
                <li key={l.id}><Link href={`/app/livrables/${l.id}`} className="card block overflow-hidden transition hover:border-border-strong">
                  <div className="flex aspect-video items-center justify-center bg-surface-2 text-muted"><Clapperboard className="size-6" /></div>
                  <div className="p-3"><p className="truncate text-[13.5px] font-medium">{l.title}</p><div className="mt-1.5 flex items-center justify-between gap-2"><StatusBadge kind="livrable" value={l.status} /><span className="text-[11.5px] text-muted">{fmt.date(l.created_at)}</span></div></div>
                </Link></li>
              ))}
            </ul>
          ) : <div className="card"><EmptyState compact icon={Clapperboard} title="Aucun livrable pour l'instant" description="Vos vidéos et visuels apparaîtront ici dès leur livraison." /></div>}
        </Section>
        <Section title="Prochaines étapes" href="/app/documents" hrefLabel="Documents">
          <div className="card divide-y divide-border">
            {events.slice(0, 3).map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3">
                <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-2 text-[10px] font-semibold uppercase leading-none text-muted hairline"><span className="text-[14px] text-fg tabular">{new Date(e.starts_at).getDate()}</span>{fmt.date(e.starts_at, { month: "short" })}</span>
                <div className="min-w-0"><p className="truncate text-[13px] font-medium">{e.title}</p><p className="text-[11.5px] text-muted">{EVENT_KIND[e.kind]} · {fmt.dateTime(e.starts_at)}</p></div>
              </div>
            ))}
            {!events.length ? <div className="flex items-center gap-3 p-3 text-[13px] text-muted"><CalendarDays className="size-4" />Aucune date planifiée pour le moment.</div> : null}
            {docs.slice(0, 3).map((d) => (
              <Link key={d.id} href={`/app/documents/${d.id}`} className="flex items-center gap-3 p-3 transition hover:bg-surface-2"><span className="text-lg">{d.icon}</span><div className="min-w-0"><p className="truncate text-[13px] font-medium">{d.title}</p><p className="text-[11.5px] text-muted">Mis à jour {fmt.relative(d.updated_at)}</p></div></Link>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Activité récente" className="lg:col-span-2"><div className="card p-5"><Timeline items={activity} compact /></div></Section>
        <Section title="Votre équipe icon-flow">
          <div className="card p-5">
            <ul className="space-y-3">
              {agency.map((p) => <li key={p.id} className="flex items-center gap-3"><Avatar name={p.display_name ?? "icon-flow"} src={p.avatar_url} size={34} /><div className="min-w-0"><p className="truncate text-[13.5px] font-medium">{p.display_name}</p><p className="truncate text-[12px] text-muted">{p.title ?? "Équipe icon-flow"}</p></div></li>)}
              {!agency.length ? <li className="text-[13px] text-muted">Votre équipe dédiée vous répond dans la messagerie.</li> : null}
            </ul>
            <Link href="/app/messages" className={buttonVariants({ variant: "secondary", className: "mt-4 w-full" })}><MessageSquare />Écrire à l&apos;équipe</Link>
          </div>
        </Section>
      </div>
    </div>
  );
}
