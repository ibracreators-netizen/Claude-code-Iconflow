"use client";
import * as React from "react";
import { Check, ChevronRight, LinkIcon, Minus, Plus, TriangleAlert } from "lucide-react";
import { submitKpiLinkEntryAction } from "@/lib/actions/marketing-kpi-links";
import { closerWarnings, daySummary, groupFields } from "@/lib/marketing/closer-report";
import { cleanKpiInput, dayLabel, forDay, KPI_LINK_ROLE, kpiFieldsFor, kpiInputNumber, type KpiLinkRole, type OwnEntry } from "@/lib/marketing/kpi-links";
import { kpiMax, kpiValueError, type KpiField } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

/** Un résumé « 3 show-up · 1 close · 1 500 € cash » ne se coupe qu'entre deux chiffres, jamais au milieu d'un montant. */
const keepTogether = (s: string) => s.split(" · ").map((part) => part.replace(/ /g, "\u00a0")).join(" · ");
/** Taille du chiffre dans une case à – et + (54 px de large sur téléphone) : plus petit quand il est long, jamais coupé. */
const stepperText = (v: string) => (v.length <= 3 ? "text-[20px]" : v.length === 4 ? "text-[18px]" : v.length === 5 ? "text-[16px]" : "text-[13px]");
const INPUT_BASE = "min-w-0 rounded-[12px] border bg-surface font-semibold text-mk-strong tabular-nums outline-none transition placeholder:text-mk-sub/60 focus:ring-4";

/**
 * Formulaire du lien personnel : choix du jour (aujourd'hui → 7 jours en arrière), un gros champ par indicateur
 * du rôle avec – et +, une remarque facultative, un bouton pleine largeur. Après l'envoi : confirmation et
 * liste de ses derniers jours (les siens seulement).
 */
export function KpiLinkForm({ token, firstName, role, today: today0, days: days0, entries: entries0 }: {
  token: string; firstName: string; role: KpiLinkRole; today: string; days: string[]; entries: OwnEntry[];
}) {
  const fields = kpiFieldsFor(role);
  const [today, setToday] = React.useState(today0);
  const [days, setDays] = React.useState(days0);
  const [entries, setEntries] = React.useState(entries0);
  const [day, setDay] = React.useState(today0);
  const [done, setDone] = React.useState<string | null>(null);
  const [gone, setGone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const existing = entries.find((e) => e.day === day) ?? null;
  const [draft, setDraft] = React.useState<{ day: string; values: Record<string, string>; note: string }>({ day: "", values: {}, note: "" });
  if (draft.day !== day) setDraft({ day, values: Object.fromEntries(fields.map((f) => [f.key, existing && existing.metrics[f.key] !== undefined ? String(existing.metrics[f.key]) : ""])), note: existing?.note ?? "" });
  const top = React.useRef<HTMLDivElement>(null);
  // Page hors de l'espace Marketing : son style est posé ici aussi (navigation dans l'app sans rechargement).
  React.useEffect(() => { document.documentElement.dataset.app = "marketing"; }, []);

  // La saisie est gardée telle que tapée (virgule et point compris) : « 2499,99 » est refusé « sans centimes », jamais lu 249 999.
  const setValue = (f: KpiField, v: string) => setDraft((d) => ({ ...d, values: { ...d.values, [f.key]: cleanKpiInput(v) } }));
  const step = (f: KpiField, delta: number) => setDraft((d) => {
    const n = kpiInputNumber(d.values[f.key] ?? "");
    return { ...d, values: { ...d.values, [f.key]: String(Math.max(0, Math.min(kpiMax(f), Math.trunc(Number.isFinite(n) ? n : 0) + delta))) } };
  });
  const pick = (d: string) => { setDay(d); setDone(null); setError(null); };
  const metrics = Object.fromEntries(fields.map((f) => [f.key, kpiInputNumber(draft.values[f.key] ?? "")]));
  // Au-delà de la limite d'un champ : message sous la case, envoi bloqué (le serveur refuse aussi). Les avertissements laissent enregistrer.
  const fieldError = (f: KpiField) => (draft.values[f.key] ? kpiValueError(f, metrics[f.key]) : null);
  const firstError = fields.map(fieldError).find(Boolean) ?? null;
  const warnings = role === "closer" ? closerWarnings(metrics) : [];
  const submit = () => {
    if (pending) return;
    if (firstError) { setError(firstError); return; }
    setError(null);
    startTransition(async () => {
      const res = await submitKpiLinkEntryAction(token, { day, metrics, note: draft.note });
      if (!res.ok) { if (res.gone) setGone(true); else setError(res.error); return; }
      setEntries(res.entries); setToday(res.today); setDays(res.days); setDone(res.message);
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const summary = (e: OwnEntry | undefined) => (e ? keepTogether(daySummary(e.metrics, role)) || "Tout à 0" : null);

  if (gone) return (
    <section className="mt-10 rounded-[16px] border border-mk-line bg-surface px-5 py-10 text-center shadow-soft">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon" aria-hidden><LinkIcon className="size-6" strokeWidth={1.8} /></span>
      <h1 className="mt-4 text-[20px] font-semibold leading-snug text-mk-strong">Ce lien n&apos;est plus actif.</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-mk-sub">Demande un nouveau lien à ton responsable.</p>
    </section>
  );

  const history = (
    <section className="mt-6" aria-labelledby="kpi-history">
      <h2 id="kpi-history" className="text-[17px] font-semibold text-mk-strong">Tes derniers jours</h2>
      <p className="mt-0.5 text-[14px] text-mk-sub">Seulement tes saisies. Touche un jour pour le corriger.</p>
      <ul className="mt-3 overflow-hidden rounded-[14px] border border-mk-line bg-surface shadow-soft">
        {days.map((d) => {
          const e = entries.find((x) => x.day === d), s = summary(e);
          return (
            <li key={d} className="border-b border-mk-line last:border-b-0">
              <button type="button" onClick={() => { pick(d); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className={cn("flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-mk-chip", d === day && !done && "bg-accent-soft/40")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", e ? "bg-mk-success-soft text-mk-success" : "border border-dashed border-mk-input text-transparent")} aria-hidden><Check className="size-4" strokeWidth={2.4} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-mk-strong">{dayLabel(d, today)}</span>
                  <span className={cn("block text-[14px] leading-snug", s ? "text-mk-text" : "text-mk-sub")}>{s ?? "Pas encore saisi"}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-mk-icon" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div ref={top} className="scroll-mt-4">
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-mk-strong">Bonjour {firstName}</h1>
        <span className="inline-flex h-7 items-center rounded-full border border-mk-teal/30 bg-mk-teal-soft px-3 text-[13px] font-semibold text-mk-teal">{KPI_LINK_ROLE[role]}</span>
      </div>

      {done ? (
        <>
          <section role="status" className="mt-5 rounded-[16px] border border-mk-success/30 bg-surface px-5 py-6 text-center shadow-soft">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-mk-success-soft text-mk-success" aria-hidden><Check className="size-7" strokeWidth={2.4} /></span>
            <p className="mt-3 text-[20px] font-semibold leading-snug text-mk-strong">{done}</p>
            <p className="mt-1.5 text-[15px] text-mk-sub">{summary(entries.find((e) => e.day === day))}</p>
            <p className="mt-3 text-[14px] text-mk-sub">Ton responsable le voit déjà dans son tableau de bord. Reviens demain avec le même lien.</p>
            <button type="button" onClick={() => setDone(null)} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[12px] border border-mk-input bg-surface px-4 text-[16px] font-semibold text-mk-strong transition active:bg-mk-chip">Corriger ou saisir un autre jour</button>
          </section>
          {history}
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[16px] leading-relaxed text-mk-sub">{role === "closer" ? "Note tes rendez-vous du jour, leur résultat et l'argent encaissé. Ça prend une minute." : "Note tes chiffres du jour. Ça prend 30 secondes."}</p>

          <form className="mt-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-[15px] font-semibold text-mk-strong">Jour</legend>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {days.map((d) => {
                  const has = entries.some((e) => e.day === d), on = d === day;
                  return (
                    <button key={d} type="button" onClick={() => pick(d)} aria-pressed={on}
                      className={cn("relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold transition", on ? "border-accent bg-accent text-accent-fg" : "border-mk-input bg-surface text-mk-strong active:bg-mk-chip")}>
                      {has ? <Check className={cn("size-4", on ? "text-accent-fg" : "text-mk-success")} strokeWidth={2.6} aria-hidden /> : null}{dayLabel(d, today)}{has ? <span className="sr-only"> (déjà saisi)</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {groupFields(fields).map(([group, list]) => (
              <section key={group ?? "champs"} className="mt-5" aria-label={group ?? "Tes chiffres"}>
                {group ? <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-mk-sub">{group}</h2> : null}
                <div className="grid grid-cols-2 gap-2.5">
                  {list.map((f) => {
                    const err = fieldError(f), value = draft.values[f.key] ?? "";
                    return (
                      <div key={f.key} className={cn("flex min-w-0 flex-col rounded-[14px] border bg-surface p-3 shadow-soft", err ? "border-mk-danger/50" : "border-mk-line")}>
                        <label htmlFor={`kpi-${f.key}`} className="block text-[15px] font-semibold leading-snug text-mk-strong">{f.label}</label>
                        <p id={`kpi-${f.key}-hint`} className={cn("mt-0.5 text-[12.5px] leading-snug", err ? "font-medium text-mk-danger" : "text-mk-sub")}>{err ?? f.hint}</p>
                        {f.unit === "euro" ? (
                          <span className="relative mt-auto block pt-2.5">
                            <input id={`kpi-${f.key}`} type="text" inputMode="numeric" pattern="[0-9 .,]*" autoComplete="off" enterKeyHint="done" aria-describedby={`kpi-${f.key}-hint`} aria-invalid={err ? true : undefined}
                              value={value} placeholder="0" onChange={(e) => setValue(f, e.target.value)} onFocus={(e) => e.currentTarget.select()}
                              className={cn(INPUT_BASE, "h-11 w-full pl-3 pr-8 text-right", value.length > 9 ? "text-[17px]" : "text-[20px]", err ? "border-mk-danger focus:ring-mk-danger/15" : "border-mk-input focus:border-accent focus:ring-accent/15")} />
                            <span className="pointer-events-none absolute bottom-0 right-3 flex h-11 items-center text-[17px] font-semibold text-mk-sub" aria-hidden>€</span>
                          </span>
                        ) : (
                          <div className="mt-auto flex items-center gap-1.5 pt-2.5">
                            <button type="button" onClick={() => step(f, -1)} aria-label={`Retirer 1 : ${f.label}`} disabled={!(kpiInputNumber(value) > 0)}
                              className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-mk-input bg-surface text-mk-strong transition active:scale-95 active:bg-mk-chip disabled:opacity-40"><Minus className="size-5" strokeWidth={2.2} /></button>
                            <input id={`kpi-${f.key}`} type="text" inputMode="numeric" pattern="[0-9 .,]*" autoComplete="off" enterKeyHint="done" aria-describedby={`kpi-${f.key}-hint`} aria-invalid={err ? true : undefined}
                              value={value} placeholder="0" onChange={(e) => setValue(f, e.target.value)} onFocus={(e) => e.currentTarget.select()}
                              className={cn(INPUT_BASE, "h-11 w-full flex-1 px-0 text-center", stepperText(value), err ? "border-mk-danger focus:ring-mk-danger/15" : "border-mk-input focus:border-accent focus:ring-accent/15")} />
                            <button type="button" onClick={() => step(f, 1)} aria-label={`Ajouter 1 : ${f.label}`}
                              className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-fg transition active:scale-95"><Plus className="size-5" strokeWidth={2.2} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {warnings.length ? (
              <div role="status" className="mt-4 rounded-[14px] border border-mk-warn/30 bg-mk-warn-soft px-4 py-3 text-[14px] leading-snug text-mk-warn-strong">
                <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4 shrink-0 text-mk-warn" strokeWidth={2} aria-hidden />À vérifier</p>
                <ul className="mt-1 space-y-0.5 pl-6">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                <p className="mt-1.5 pl-6 text-[13px]">Tu peux enregistrer quand même.</p>
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              <div className="rounded-[16px] border border-mk-line bg-surface p-4 shadow-soft">
                <label htmlFor="kpi-note" className="block text-[17px] font-semibold text-mk-strong">Remarque <span className="text-[14px] font-normal text-mk-sub">(facultatif)</span></label>
                <textarea id="kpi-note" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} maxLength={1000} rows={2} placeholder={role === "closer" ? "Ex. deux prospects à relancer jeudi" : "Ex. matinée sans réponse, à rappeler demain"}
                  className="mt-2 w-full resize-none rounded-[12px] border border-mk-input bg-surface px-3.5 py-3 text-[16px] leading-relaxed text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-4 focus:ring-accent/15" />
              </div>
            </div>

            {error ? <p role="alert" className="mt-4 rounded-[12px] border border-mk-danger/30 bg-[color-mix(in_oklab,var(--mk-danger)_8%,transparent)] px-4 py-3 text-[15px] font-medium text-mk-danger">{error}</p> : null}
            <p className="mt-4 text-center text-[14px] text-mk-sub">{existing ? `Déjà saisi ${forDay(day, today)} : tu peux corriger.` : `Rien de saisi ${forDay(day, today)}.`}</p>
            <button type="submit" disabled={pending}
              className="mt-3 inline-flex h-14 w-full items-center justify-center rounded-[14px] bg-accent px-4 text-[17px] font-bold uppercase tracking-[0.04em] text-accent-fg shadow-[0_8px_20px_-8px_rgb(0_105_92/0.6)] transition active:scale-[0.99] disabled:opacity-60">
              {pending ? "Enregistrement…" : existing ? "Mettre à jour" : "Enregistrer"}
            </button>
          </form>
          {history}
        </>
      )}
    </div>
  );
}
