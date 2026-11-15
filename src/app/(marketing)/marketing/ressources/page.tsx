import type { Metadata } from "next";
import Link from "next/link";
import { crmPage, members, salesRole } from "@/lib/marketing/crm-server";
import * as res from "@/lib/marketing/resources";
import { MARKETING_ROLE, type MarketingRole } from "@/lib/marketing/types";
import { PageHeader, Progress } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { NewDocumentButton, StepChecklist, StepsEditor } from "./ressources-client";

export const metadata: Metadata = { title: "Ressources" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RessourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_ressources");
  const mine = salesRole(crm.session), canEdit = !mine;
  const role: MarketingRole = mine ?? (res.ROLES.includes(one(sp.role) as MarketingRole) ? (one(sp.role) as MarketingRole) : "setter");
  const [folders, docs, steps, progress, team, settings] = await Promise.all([
    crm.demo ? res.ensureStructure(crm.db) : res.folders(crm.db), res.documents(crm.db), res.steps(crm.db), res.progress(crm.db), members(), crm.store.settings(),
  ]);
  const root = folders.find((f) => !f.parent_id && f.marketing_role === role);
  const section = (name: string) => folders.find((f) => f.parent_id === root?.id && f.name === name);
  const roleSteps = steps.filter((s) => s.role === role);
  const me = crm.session.user.id, doneIds = progress.filter((p) => p.profile_id === me).map((p) => p.step_id);
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: settings.timezone });
  const pill = (active: boolean) => cn("rounded-full px-3 py-1.5 text-[13px] transition", active ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg");
  const teamOfRole = team.filter((m) => m.marketing_role === role);

  const docList = (name: (typeof res.SECTIONS)[number], empty: string) => {
    const folder = section(name), list = docs.filter((d) => d.folder_id === folder?.id);
    return (
      <Card key={name}>
        <CardHeader title={name} description={`${list.length} document${list.length > 1 ? "s" : ""}`} action={canEdit && folder ? <NewDocumentButton folderId={folder.id} defaultKind={name === "SOPs" ? "sop" : name === "Ressources" ? "template" : "doc"} /> : undefined} />
        <CardBody>
          {list.length === 0 ? <p className="text-[13px] text-muted">{empty}</p> : (
            <ul className="divide-y divide-border">
              {list.map((d) => (
                <li key={d.id}><Link href={`/marketing/ressources/${d.id}`} className="flex items-center gap-3 py-2.5 transition hover:text-accent-2">
                  <span aria-hidden>{d.icon ?? "📄"}</span><span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{d.title}</span>
                  <Badge tone="outline">{res.RESOURCE_KIND[d.kind as res.ResourceKind] ?? d.kind}</Badge><span className="hidden text-[12px] text-muted tabular sm:block">{fmt.format(new Date(d.updated_at))}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    );
  };

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Ressources" description={canEdit ? "Un dossier par rôle : onboarding, SOPs, ressources. La structure est vide au départ : c'est toi qui écris le contenu." : `Tout ce qu'il te faut pour ton rôle de ${MARKETING_ROLE[role].toLowerCase()} : onboarding, SOPs, ressources.`}
        actions={crm.demo ? <DemoBadge /> : undefined} />
      {canEdit ? <div className="mb-4 flex flex-wrap items-center gap-2">{res.ROLES.map((r) => <Link key={r} href={`/marketing/ressources?role=${r}`} aria-current={r === role ? "true" : undefined} className={pill(r === role)}>{MARKETING_ROLE[r]}</Link>)}</div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title={`Onboarding ${MARKETING_ROLE[role].toLowerCase()}`} description={canEdit ? "Les étapes que chaque nouveau membre de ce rôle doit suivre, dans l'ordre." : "Coche chaque étape quand tu l'as terminée."} />
          <CardBody>
            {canEdit
              ? <StepsEditor role={role} steps={roleSteps} docs={docs.map((d) => ({ id: d.id, title: d.title }))} />
              : <StepChecklist steps={roleSteps.map((s) => ({ id: s.id, title: s.title, description: s.description, document_id: s.document_id && docs.some((d) => d.id === s.document_id) ? s.document_id : null }))} done={doneIds} />}
            {canEdit ? (
              <div className="mt-5">
                <div className="mb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">Progression des membres</div>
                {roleSteps.length === 0 ? <p className="text-[13px] text-muted">Ajoute d&apos;abord des étapes : la progression de chaque membre s&apos;affichera ici.</p>
                  : teamOfRole.length === 0 ? <p className="text-[13px] text-muted">Aucun membre n&apos;a encore ce rôle.</p> : (
                    <ul className="space-y-2">
                      {teamOfRole.map((m) => { const p = res.progressOf(steps, progress, role, m.id); return (
                        <li key={m.id} className="flex items-center gap-3 text-[13px]"><span className="w-44 truncate">{m.name}</span><Progress value={p.total ? Math.round((p.done / p.total) * 100) : 0} className="max-w-[260px] flex-1" /><span className="w-24 text-right text-muted tabular">{p.done} sur {p.total}</span></li>); })}
                    </ul>)}
              </div>
            ) : null}
          </CardBody>
        </Card>
        {docList("Onboarding", "Aucun document d'onboarding pour l'instant.")}
        {docList("SOPs", "Aucune SOP pour l'instant.")}
        <div className="lg:col-span-2">{docList("Ressources", "Aucune ressource pour l'instant.")}</div>
      </div>
    </>
  );
}
