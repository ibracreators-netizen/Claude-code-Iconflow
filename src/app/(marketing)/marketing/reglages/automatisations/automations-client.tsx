"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/lib/hooks/use-action";
import { decideClientProposalAction, saveAutomationsAction } from "@/lib/actions/marketing-automations";
import { RULES, type AutomationSettings, type RuleKey } from "@/lib/marketing/automations";
import { euro } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, INPUT, Panel, Pill } from "../kit";

export interface JournalRow { id: string; when: string; rule: string; prospectId: string | null; prospect: string | null; action: string; ok: boolean; detail: string | null }
export interface ProposalRow { id: string; prospectId: string; name: string | null; email: string | null; amount: number | null; when: string }

function Hours({ label, value, onChange, min = 1, max = 720, step = 1, disabled }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[14px] text-mk-text">
      <span>{label}</span>
      <Input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} className={cn(INPUT, "w-24 tabular-nums")} />
      <span className="text-mk-sub">h</span>
    </label>
  );
}
function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <label className={cn("flex min-h-10 items-center gap-2.5 text-[14px] text-mk-text", disabled && "text-mk-sub")}><Switch checked={checked} onCheckedChange={onChange} disabled={disabled} /><span>{label}</span></label>;
}

export function AutomationsForm({ initial, mailNote, mailLive }: { initial: AutomationSettings; mailNote: string; mailLive: boolean }) {
  const { exec, pending } = useAction();
  const [s, setS] = React.useState(initial);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const set = <K extends RuleKey>(rule: K, patch: Partial<AutomationSettings[K]>) => setS((v) => ({ ...v, [rule]: { ...v[rule], ...patch } }));
  const save = () => exec(() => saveAutomationsAction(s), { success: "Automatisations enregistrées.", onSuccess: (clean) => setS(clean) });
  const options: Record<RuleKey, React.ReactNode> = {
    new_lead: <><Check label="Envoyer l'alerte « nouveau lead »" checked={s.new_lead.alert} onChange={(v) => set("new_lead", { alert: v })} disabled={!s.new_lead.enabled} /><Check label="Attribuer à un setter, chacun son tour" checked={s.new_lead.round_robin} onChange={(v) => set("new_lead", { round_robin: v })} disabled={!s.new_lead.enabled} /></>,
    no_booking: <><Hours label="Délai sans rendez-vous :" value={s.no_booking.delay_hours} onChange={(n) => set("no_booking", { delay_hours: n })} disabled={!s.no_booking.enabled} /><Check label="Email de relance au prospect" checked={s.no_booking.email} onChange={(v) => set("no_booking", { email: v })} disabled={!s.no_booking.enabled} /><Check label="Tâche « À appeler » si le téléphone est connu" checked={s.no_booking.task} onChange={(v) => set("no_booking", { task: v })} disabled={!s.no_booking.enabled} /></>,
    booked: <><Check label="Rappels par email au prospect avant l'appel" checked={s.booked.reminders} onChange={(v) => set("booked", { reminders: v })} disabled={!s.booked.enabled} />{s.booked.reminders ? <span className="text-[13px] text-mk-sub">Envoyés {s.booked.reminder_hours.map((h) => `${h} h`).join(" et ")} avant.</span> : null}</>,
    no_result: <Hours label="Délai après la fin de l'appel :" value={s.no_result.delay_hours} onChange={(n) => set("no_result", { delay_hours: n })} min={0.25} max={168} step={0.25} disabled={!s.no_result.enabled} />,
    no_show: <Hours label="Relance à faire sous :" value={s.no_show.due_in_hours} onChange={(n) => set("no_show", { due_in_hours: n })} min={0} max={168} disabled={!s.no_show.enabled} />,
    signed: <Check label="Proposer de créer le client dans Studio" checked={s.signed.propose_client} onChange={(v) => set("signed", { propose_client: v })} disabled={!s.signed.enabled} />,
  };
  const writesToProspect = (k: RuleKey) => (k === "no_booking" && s.no_booking.enabled && s.no_booking.email) || (k === "booked" && s.booked.enabled && s.booked.reminders);
  return (
    <Panel flush title="Les six règles" description={mailNote}
      action={<Button className={BTN} onClick={save} disabled={!dirty || pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>}>
      <ul>
        {RULES.map((r) => (
          <li key={r.key} className="border-b border-mk-line px-4 py-4 last:border-b-0 sm:px-5 sm:py-5">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-mk-strong">{r.title}{s[r.key].enabled ? <Pill tone="success">Allumée</Pill> : <Pill>Éteinte</Pill>}{writesToProspect(r.key) ? <Pill tone={mailLive ? "warn" : "neutral"}>{mailLive ? "Écrit au prospect" : "Email en simulation"}</Pill> : null}</p>
                <p className="mt-1 text-[14px] text-mk-text">{r.text}</p>
              </div>
              <Switch className="mt-0.5" aria-label={`${r.title} : allumer ou éteindre`} checked={s[r.key].enabled} onCheckedChange={(v) => set(r.key, { enabled: v } as Partial<AutomationSettings[typeof r.key]>)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">{options[r.key]}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ClientProposals({ rows }: { rows: ProposalRow[] }) {
  const { exec, pending } = useAction();
  return (
    <Panel className="border-accent/40" title="Clients à créer dans Studio" description="Ces prospects ont signé. Rien n'est créé dans Studio tant que tu n'as pas validé. À la validation : la fiche client (nom et email), ses tâches d'onboarding et un premier brief vide.">
      <ul>
        {rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-mk-line py-3 first:pt-0 last:border-b-0 last:pb-0">
            <div className="min-w-0 flex-1 basis-56">
              <Link href={`/marketing/crm/${p.prospectId}`} className="text-[14px] font-semibold text-mk-strong hover:text-accent-2 hover:underline">{p.name ?? "Nom à renseigner"}</Link>
              <p className="text-[13px] text-mk-sub">{[p.email, p.amount != null ? `${euro.format(p.amount)} HT signés` : null, `signé le ${p.when}`].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="ghost" className={BTN_GHOST} disabled={pending} onClick={() => exec(() => decideClientProposalAction(p.id, "ignorer"), { success: "Proposition écartée." })}>Ignorer</Button>
              <Button size="sm" className={BTN} disabled={pending || !p.name} onClick={() => exec(() => decideClientProposalAction(p.id, "creer"), { onSuccess: (r) => window.alert(`Client créé dans Studio, avec ${r.tasks} tâche${r.tasks > 1 ? "s" : ""} d'onboarding${r.brief ? " et un premier brief" : ""}. Tu le retrouves dans Studio › Clients.`) })}>Créer le client</Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
