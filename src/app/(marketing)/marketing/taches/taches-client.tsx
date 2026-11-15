"use client";
import * as React from "react";
import Link from "next/link";
import { Check, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { closeTaskAction } from "@/lib/actions/marketing-crm";
import { TASK_KIND, type MarketingTask, type Member, type TaskKind } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

type Scope = "miennes" | "toutes" | "sans";

export function TasksList({ tasks, who, members, me, timezone, today }: { tasks: MarketingTask[]; who: Record<string, { name: string; phone: string | null }>; members: Member[]; me: string; timezone: string; today: string }) {
  const { exec, pending } = useAction();
  const [scope, setScope] = React.useState<Scope>(tasks.some((t) => t.assignee_id === me && t.status === "ouverte") ? "miennes" : "toutes");
  const [assignee, setAssignee] = React.useState("");
  const [kind, setKind] = React.useState<TaskKind | "">("");
  const [status, setStatus] = React.useState<"ouverte" | "faite" | "annulee">("ouverte");
  const fmt = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }), [timezone]);
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
  const rows = React.useMemo(() => tasks.filter((t) => t.status === status && (!kind || t.kind === kind)
    && (scope === "miennes" ? t.assignee_id === me : scope === "sans" ? !t.assignee_id : !assignee || t.assignee_id === assignee))
    .sort((a, b) => (status === "ouverte" ? (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") : (b.done_at ?? "").localeCompare(a.done_at ?? ""))), [tasks, status, kind, scope, assignee, me]);
  const pill = (active: boolean) => cn("rounded-full px-3 py-1.5 text-[13px] transition", active ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg");
  const late = rows.filter((t) => t.status === "ouverte" && t.due_at && t.due_at.slice(0, 10) < today).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={scope === "miennes"} onClick={() => setScope("miennes")} className={pill(scope === "miennes")}>Mes tâches</button>
        <button type="button" aria-pressed={scope === "toutes"} onClick={() => setScope("toutes")} className={pill(scope === "toutes")}>Toutes</button>
        <button type="button" aria-pressed={scope === "sans"} onClick={() => setScope("sans")} className={pill(scope === "sans")}>Non attribuées</button>
        {scope === "toutes" ? <NativeSelect aria-label="Filtrer par membre" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 w-auto"><option value="">Tous les membres</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect> : null}
        <NativeSelect aria-label="Filtrer par type" value={kind} onChange={(e) => setKind(e.target.value as TaskKind | "")} className="h-9 w-auto"><option value="">Tous les types</option>{(Object.keys(TASK_KIND) as TaskKind[]).map((k) => <option key={k} value={k}>{TASK_KIND[k]}</option>)}</NativeSelect>
        <NativeSelect aria-label="Filtrer par état" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-9 w-auto"><option value="ouverte">À faire</option><option value="faite">Faites</option><option value="annulee">Annulées</option></NativeSelect>
        <span className="ml-auto text-[12.5px] text-muted tabular">{rows.length} tâche{rows.length > 1 ? "s" : ""}{late ? ` · ${late} en retard` : ""}</span>
      </div>
      {rows.length === 0 ? <div className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucune tâche dans cette vue.</div> : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((t) => {
              const p = t.prospect_id ? who[t.prospect_id] : null;
              const isLate = t.status === "ouverte" && !!t.due_at && t.due_at.slice(0, 10) < today, isToday = t.status === "ouverte" && !!t.due_at && t.due_at.slice(0, 10) === today;
              return (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  {t.status === "ouverte"
                    ? <Button size="icon-sm" variant="secondary" aria-label={`Marquer « ${t.title} » comme faite`} disabled={pending} onClick={() => exec(() => closeTaskAction(t.id, "faite"), { success: "Tâche terminée." })}><Check /></Button>
                    : <Button size="icon-sm" variant="ghost" aria-label={`Rouvrir « ${t.title} »`} disabled={pending} onClick={() => exec(() => closeTaskAction(t.id, "ouverte"), { success: "Tâche rouverte." })}><RotateCcw /></Button>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{t.title}{p ? <> · {t.prospect_id ? <Link href={`/marketing/prospects/${t.prospect_id}`} className="text-accent-2 hover:underline">{p.name}</Link> : p.name}</> : null}</p>
                    <p className="text-[12.5px] text-muted">{[TASK_KIND[t.kind], name(t.assignee_id) ?? "non attribuée", p?.phone, t.origin === "automatisation" ? "créée par une automatisation" : t.origin === "source" ? "créée par l'outil de réservation" : null].filter(Boolean).join(" · ")}</p>
                    {t.note ? <p className="mt-0.5 text-[12.5px] text-fg-2">{t.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isLate ? <Badge tone="warning">En retard</Badge> : isToday ? <Badge tone="info">Aujourd&apos;hui</Badge> : null}
                    <span className="w-24 text-right text-[12.5px] text-muted tabular">{t.due_at ? fmt.format(new Date(t.due_at)) : "sans échéance"}</span>
                    {t.status === "ouverte" ? <Button size="icon-sm" variant="ghost" aria-label={`Annuler « ${t.title} »`} disabled={pending} onClick={() => exec(() => closeTaskAction(t.id, "annulee"), { success: "Tâche annulée." })}><X /></Button> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
