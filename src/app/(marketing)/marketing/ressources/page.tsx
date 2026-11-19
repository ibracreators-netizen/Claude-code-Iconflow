import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList, FileText, FolderOpen, LayoutTemplate, type LucideIcon } from "lucide-react";
import { crmPage, members, salesRole } from "@/lib/marketing/crm-server";
import * as res from "@/lib/marketing/resources";
import { MARKETING_ROLE, type MarketingRole } from "@/lib/marketing/types";
import { PageHeader, Progress } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { MemberAvatar, Panel, Pill, SegmentLinks } from "../reglages/kit";
import { NewDocumentButton, StepChecklist, StepsEditor } from "./ressources-client";

export const metadata: Metadata = { title: "Ressources" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const KIND_ICON: Record<res.ResourceKind, LucideIcon> = { sop: ClipboardList, template: LayoutTemplate, doc: FileText };

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
  const teamOfRole = team.filter((m) => m.marketing_role === role);
  const roleLabel = MARKETING_ROLE[role].toLowerCase();

  const docList = (name: (typeof res.SECTIONS)[number], empty: string, className?: string) => {
    const folder = section(name), list = docs.filter((d) => d.folder_id === folder?.id);
    return (
      <Panel key={name} className={className} flush title={name} description={`${list.length} document${list.length > 1 ? "s" : ""}`}
        action={canEdit && folder ? <NewDocumentButton folderId={folder.id} defaultKind={name === "SOPs" ? "sop" : name === "Ressources" ? "template" : "doc"} /> : undefined}>
        {list.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-5 sm:px-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><FolderOpen className="size-5" strokeWidth={1.7} /></span>
            <p className="text-[14px] text-mk-sub">{empty}</p>
          </div>
        ) : (
          <ul>
            {list.map((d) => {
              const Icon = KIND_ICON[d.kind as res.ResourceKind] ?? FileText;
              return (
                <li key={d.id} className="border-b border-mk-line last:border-b-0">
                  <Link href={`/marketing/ressources/${d.id}`} className="group flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 sm:px-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-mk-chip text-mk-icon"><Icon className="size-[18px]" strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-mk-strong group-hover:text-accent-2">{d.title}</span>
                      <span className="block text-[13px] text-mk-sub tabular-nums sm:hidden">Modifié le {fmt.format(new Date(d.updated_at))}</span>
                    </span>
                    <Pill>{res.RESOURCE_KIND[d.kind as res.ResourceKind] ?? d.kind}</Pill>
                    <span className="hidden w-28 shrink-0 text-right text-[13px] text-mk-sub tabular-nums sm:block">{fmt.format(new Date(d.updated_at))}</span>
                    <ChevronRight className="size-4 shrink-0 text-mk-icon" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    );
  };

  const onboarding = (
    <Panel title={`Onboarding ${roleLabel}`} description={canEdit ? "Les étapes que chaque nouveau membre de ce rôle doit suivre, dans l'ordre." : "Coche chaque étape quand tu l'as terminée."}>
      {canEdit
        ? <StepsEditor role={role} steps={roleSteps} docs={docs.map((d) => ({ id: d.id, title: d.title }))} />
        : <StepChecklist steps={roleSteps.map((s) => ({ id: s.id, title: s.title, description: s.description, document_id: s.document_id && docs.some((d) => d.id === s.document_id) ? s.document_id : null }))} done={doneIds} />}
    </Panel>
  );

  return (
    <>
      <PageHeader title="Ressources" description={canEdit ? "Un dossier par rôle : onboarding, SOPs, ressources. La structure est vide au départ : c'est toi qui écris le contenu." : `Tout ce qu'il te faut pour ton rôle de ${roleLabel} : onboarding, SOPs, ressources.`}
        actions={crm.demo ? <span className="hidden lg:inline-flex"><DemoBadge /></span> : undefined} />
      {canEdit ? <div className="mb-4 lg:mb-5"><SegmentLinks label="Rôle affiché" items={res.ROLES.map((r) => ({ href: `/marketing/ressources?role=${r}`, label: MARKETING_ROLE[r], active: r === role }))} /></div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {canEdit ? (
          <div className="grid items-start gap-4 lg:col-span-2 xl:grid-cols-[minmax(0,1fr)_360px]">
            {onboarding}
            <Panel title="Progression des membres" description={`Où en est chaque ${roleLabel} dans son onboarding.`}>
              {roleSteps.length === 0 ? <p className="text-[14px] text-mk-sub">Ajoute d&apos;abord des étapes : la progression de chaque membre s&apos;affichera ici.</p>
                : teamOfRole.length === 0 ? <p className="text-[14px] text-mk-sub">Aucun membre n&apos;a encore ce rôle.</p> : (
                  <ul className="-my-1">
                    {teamOfRole.map((m) => {
                      const p = res.progressOf(steps, progress, role, m.id);
                      return (
                        <li key={m.id} className="flex items-center gap-3 border-b border-mk-line py-3 last:border-b-0">
                          <MemberAvatar name={m.name} size={36} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-[14px] font-medium text-mk-strong">{m.name}</span>
                              <span className="shrink-0 text-[13px] text-mk-sub tabular-nums">{p.done} sur {p.total}</span>
                            </div>
                            <Progress value={p.total ? Math.round((p.done / p.total) * 100) : 0} className="mt-2" />
                          </div>
                        </li>
                      );
                    })}
                  </ul>)}
            </Panel>
          </div>
        ) : <div className="lg:col-span-2">{onboarding}</div>}
        {docList("Onboarding", "Aucun document d'onboarding pour l'instant.")}
        {docList("SOPs", "Aucune SOP pour l'instant.")}
        {docList("Ressources", "Aucune ressource pour l'instant.", "lg:col-span-2")}
      </div>
    </>
  );
}
