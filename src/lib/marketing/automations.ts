/**
 * Automatisations de l'espace Marketing. Pas de constructeur visuel : six règles fixes, chacune avec son
 * interrupteur et ses délais (Réglages › Automatisations), et un journal de ce qui s'est exécuté.
 *
 * Écrit contre `Db`, comme le reste du CRM, donc vérifiable hors ligne (scripts/automations-selfcheck.ts).
 * Chaque action passe par `once()` : une clé unique dans le journal garantit qu'une règle n'agit qu'une
 * fois pour un même prospect ou un même rendez-vous, même si le planificateur repasse dix fois.
 */
import type { Db } from "./db";
import { closeOpenTasks, ensureTask, listStages, logEvent, moveToStage, type LeadResult } from "./crm";
import type { Appointment, Contact, MarketingTask, Member, Prospect, Stage } from "./types";

export type RuleKey = "new_lead" | "no_booking" | "booked" | "no_result" | "no_show" | "signed";
export interface AutomationSettings {
  /** 1. Nouveau lead : alerte, attribution à un setter à tour de rôle. */
  new_lead: { enabled: boolean; alert: boolean; round_robin: boolean };
  /** 2. Lead sans rendez-vous après X heures : email de relance, et tâche « À appeler » si un téléphone est connu. */
  no_booking: { enabled: boolean; delay_hours: number; email: boolean; task: boolean };
  /** 3. Rendez-vous pris : passage en « Audit réservé ». Rappels avant l'appel éteints par défaut. */
  booked: { enabled: boolean; reminders: boolean; reminder_hours: number[] };
  /** 4. Rendez-vous passé sans résultat saisi : rappel au closer. */
  no_result: { enabled: boolean; delay_hours: number };
  /** 5. Absent au rendez-vous : tâche de relance pour le setter. */
  no_show: { enabled: boolean; due_in_hours: number };
  /** 6. Signé : passage en « Gagné », puis proposition de créer le client dans Studio (à valider). */
  signed: { enabled: boolean; propose_client: boolean };
}
/**
 * Réglages de départ. Tout ce qui écrit à un prospect est ÉTEINT (règle 2, rappels de la règle 3) :
 * l'allumer est une décision. Les règles internes (étapes, tâches, rappel au closer) sont allumées.
 */
export const DEFAULT_AUTOMATIONS: AutomationSettings = {
  new_lead: { enabled: true, alert: true, round_robin: true },
  no_booking: { enabled: false, delay_hours: 24, email: true, task: true },
  booked: { enabled: true, reminders: false, reminder_hours: [24, 1] },
  no_result: { enabled: true, delay_hours: 2 },
  no_show: { enabled: true, due_in_hours: 2 },
  signed: { enabled: true, propose_client: true },
};
export const RULES: Array<{ key: RuleKey; title: string; text: string }> = [
  { key: "new_lead", title: "1. Nouveau lead", text: "Une alerte part, et le lead est attribué à un setter, chacun son tour." },
  { key: "no_booking", title: "2. Lead sans rendez-vous", text: "Passé le délai, un email de relance part au prospect, et une tâche « À appeler » est créée si son téléphone est connu." },
  { key: "booked", title: "3. Rendez-vous pris", text: "Le prospect passe en « Audit réservé ». Les rappels avant l'appel sont éteints par défaut : iClosed peut déjà envoyer les siens." },
  { key: "no_result", title: "4. Rendez-vous passé sans résultat", text: "Passé le délai, le closer reçoit un rappel et une tâche « Résultat à saisir »." },
  { key: "no_show", title: "5. Absent au rendez-vous", text: "Une tâche de relance est créée pour le setter du prospect." },
  { key: "signed", title: "6. Signé", text: "Le prospect passe en « Gagné », puis l'app propose de créer le client dans Studio. Rien n'y est créé sans ta validation." },
];

const num = (v: unknown, def: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
/** Réglages lus en base → réglages sûrs (valeurs bornées, clés inconnues ignorées). */
export function mergeAutomations(raw: unknown): AutomationSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>, d = DEFAULT_AUTOMATIONS;
  const hours = Array.isArray(r.booked?.reminder_hours) ? [...new Set((r.booked!.reminder_hours as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0 && n <= 168))].sort((a, b) => b - a).slice(0, 4) : d.booked.reminder_hours;
  return {
    new_lead: { enabled: bool(r.new_lead?.enabled, d.new_lead.enabled), alert: bool(r.new_lead?.alert, d.new_lead.alert), round_robin: bool(r.new_lead?.round_robin, d.new_lead.round_robin) },
    no_booking: { enabled: bool(r.no_booking?.enabled, d.no_booking.enabled), delay_hours: num(r.no_booking?.delay_hours, d.no_booking.delay_hours, 1, 720), email: bool(r.no_booking?.email, d.no_booking.email), task: bool(r.no_booking?.task, d.no_booking.task) },
    booked: { enabled: bool(r.booked?.enabled, d.booked.enabled), reminders: bool(r.booked?.reminders, d.booked.reminders), reminder_hours: hours },
    no_result: { enabled: bool(r.no_result?.enabled, d.no_result.enabled), delay_hours: num(r.no_result?.delay_hours, d.no_result.delay_hours, 0.25, 168) },
    no_show: { enabled: bool(r.no_show?.enabled, d.no_show.enabled), due_in_hours: num(r.no_show?.due_in_hours, d.no_show.due_in_hours, 0, 168) },
    signed: { enabled: bool(r.signed?.enabled, d.signed.enabled), propose_client: bool(r.signed?.propose_client, d.signed.propose_client) },
  };
}
export async function automationSettings(db: Db): Promise<AutomationSettings> { return mergeAutomations(await db.setting("automations")); }
/** Vrai si une règle allumée fait partir des emails vers les prospects : la file d'emails doit alors avancer. */
export const sendsProspectEmails = (s: AutomationSettings) => (s.no_booking.enabled && s.no_booking.email) || (s.booked.enabled && s.booked.reminders);

/** Ce que les règles font faire au monde extérieur (emails). Injecté : rien ne part pendant les vérifications. */
export interface Effects {
  /** Email interne à un membre de l'équipe (rappel au closer). */
  notifyMember(member: Member, subject: string, lines: Array<[string, string | null]>): Promise<{ status: string; error?: string }>;
  now(): Date;
}
export interface AutomationContext { settings: AutomationSettings; members: Member[]; effects: Effects }

/** Exécute `fn` une seule fois pour cette clé, et l'écrit au journal. Rejouer ne refait rien. */
async function once(db: Db, rule: RuleKey, key: string, prospectId: string | null, fn: () => Promise<{ action: string; detail?: string | null; ok?: boolean }>): Promise<boolean> {
  const dedupe = `${rule}:${key}`;
  // Journal illisible (migration 0025 pas encore appliquée) : la règle ne fait rien, plutôt que d'agir sans
  // pouvoir garantir « une seule fois » ou de faire échouer la réception ou la synchronisation qui l'appelle.
  let seen: { id: string } | undefined;
  try { [seen] = await db.list<{ id: string }>("marketing_automation_runs", { where: [["eq", "dedupe_key", dedupe]], limit: 1 }); }
  catch { return false; }
  if (seen) return false;
  let entry: { id: string };
  try { entry = await db.insert<{ id: string }>("marketing_automation_runs", { rule, dedupe_key: dedupe, prospect_id: prospectId, action: "en cours", ok: true }); }
  catch { return false; }   // un autre passage vient de prendre cette clé
  try {
    const res = await fn();
    await db.update("marketing_automation_runs", entry.id, { action: res.action.slice(0, 300), detail: res.detail?.slice(0, 400) ?? null, ok: res.ok ?? true });
    if (prospectId) await logEvent(db, prospectId, "automatisation", { regle: RULES.find((r) => r.key === rule)?.title ?? rule, detail: res.action });
    return true;
  } catch (e) {
    await db.update("marketing_automation_runs", entry.id, { action: "échec", detail: (e instanceof Error ? e.message : String(e)).slice(0, 400), ok: false }).catch(() => undefined);
    return false;
  }
}
const names = (ctx: AutomationContext) => Object.fromEntries(ctx.members.map((m) => [m.id, m.name]));
const stageKey = (stages: Stage[], p: Prospect) => stages.find((s) => s.id === p.stage_id)?.key ?? null;

/* ─── Règle 1 : nouveau lead → attribution à un setter, chacun son tour ─── */
export async function afterLeadReceived(db: Db, lead: LeadResult, ctx?: AutomationContext): Promise<void> {
  const c = ctx ?? await bareContext(db);
  if (!c.settings.new_lead.enabled || !c.settings.new_lead.round_robin || !lead.createdProspect || lead.prospect.setter_id) return;
  const setters = c.members.filter((m) => m.marketing_role === "setter").sort((a, b) => a.id.localeCompare(b.id));
  if (!setters.length) return;
  await once(db, "new_lead", lead.prospect.id, lead.prospect.id, async () => {
    const state = (await db.setting<{ last_setter_id?: string }>("automation_state")) ?? {};
    const next = setters[(setters.findIndex((s) => s.id === state.last_setter_id) + 1) % setters.length];
    await db.update("marketing_prospects", lead.prospect.id, { setter_id: next.id });
    await db.saveSetting("automation_state", { ...state, last_setter_id: next.id });
    await logEvent(db, lead.prospect.id, "attribution", { role: "setter", membre: next.id, nom: next.name, avant: null });
    // Sa tâche « À appeler », si elle existe déjà, le suit.
    for (const t of await db.list<MarketingTask>("marketing_tasks", { where: [["eq", "prospect_id", lead.prospect.id], ["eq", "status", "ouverte"], ["null", "assignee_id"]] })) await db.update("marketing_tasks", t.id, { assignee_id: next.id });
    return { action: `Attribué à ${next.name} (tour de rôle)` };
  });
}

/* ─── Règle 3 : rendez-vous pris → « Audit réservé », rappels facultatifs ─── */
export async function afterBooking(db: Db, prospect: Prospect, appointment: Pick<Appointment, "id" | "starts_at">, ctx?: AutomationContext): Promise<void> {
  const c = ctx ?? await bareContext(db);
  if (!c.settings.booked.enabled) return;
  await once(db, "booked", appointment.id, prospect.id, async () => {
    const stages = await listStages(db, { includeInactive: true }), key = stageKey(stages, prospect);
    const moved = key === "nouveau_lead" || key === null ? !!(await moveToStage(db, prospect.id, "audit_reserve")) : false;
    const closed = await closeOpenTasks(db, prospect.id, "a_appeler");
    let reminders = 0;
    if (c.settings.booked.reminders && prospect.email) {
      for (const h of c.settings.booked.reminder_hours) {
        const at = new Date(Date.parse(appointment.starts_at) - h * 3_600_000);
        if (at.getTime() <= c.effects.now().getTime()) continue;
        try { await db.insert("marketing_scheduled_emails", { prospect_id: prospect.id, appointment_id: appointment.id, template: "rappel_rdv", params: { hours_before: h }, send_at: at.toISOString(), idempotency_key: `rappel:${appointment.id}:${h}` }); reminders++; } catch { /* déjà programmé */ }
      }
    }
    return { action: [moved ? "Passé en « Audit réservé »" : "Rendez-vous enregistré", closed ? `${closed} tâche « À appeler » fermée` : null, reminders ? `${reminders} rappel${reminders > 1 ? "s" : ""} programmé${reminders > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") };
  });
}

/* ─── Règles 5 et 6 : après une modification du prospect ─── */
export async function afterProspectChange(db: Db, before: Prospect, after: Prospect, ctx?: AutomationContext): Promise<void> {
  const c = ctx ?? await bareContext(db);
  // 5. Absent au rendez-vous : tâche de relance pour le setter.
  if (c.settings.no_show.enabled && after.call_result === "absent" && before.call_result !== "absent") {
    const day = c.effects.now().toISOString().slice(0, 10);
    await once(db, "no_show", `${after.id}:${day}`, after.id, async () => {
      const due = new Date(c.effects.now().getTime() + c.settings.no_show.due_in_hours * 3_600_000).toISOString();
      const { created } = await ensureTask(db, { prospect_id: after.id, kind: "relance", title: "Relancer : absent au rendez-vous", assignee_id: after.setter_id ?? null, due_at: due, origin: "automatisation" }, names(c));
      return { action: created ? `Tâche de relance créée${after.setter_id ? ` pour ${names(c)[after.setter_id] ?? "le setter"}` : " (aucun setter attribué)"}` : "Une tâche de relance existait déjà" };
    });
  }
  // 6. Signé : passage en « Gagné », puis proposition de créer le client dans Studio.
  if (c.settings.signed.enabled && after.outcome === "signe" && before.outcome !== "signe") {
    await once(db, "signed", after.id, after.id, async () => {
      const stages = await listStages(db, { includeInactive: true });
      const won = stages.find((s) => s.id === after.stage_id)?.kind === "gagne";
      if (!won) await moveToStage(db, after.id, "gagne");
      let proposed = false;
      if (c.settings.signed.propose_client) { try { await db.insert("marketing_client_proposals", { prospect_id: after.id, status: "en_attente" }); proposed = true; } catch { /* déjà proposé */ } }
      return { action: [won ? "Déjà en « Gagné »" : "Passé en « Gagné »", proposed ? "création du client proposée dans Studio (en attente de validation)" : null].filter(Boolean).join(" · ") };
    });
  }
}

/* ─── Règles 2 et 4 : celles qui attendent un délai (lancées par le planificateur) ─── */
export interface TimedSummary { no_booking: number; no_result: number }
export async function runTimedRules(db: Db, ctx: AutomationContext): Promise<TimedSummary> {
  const sum: TimedSummary = { no_booking: 0, no_result: 0 }, now = ctx.effects.now().getTime();

  // 2. Lead sans rendez-vous après X heures.
  if (ctx.settings.no_booking.enabled) {
    const stages = await listStages(db, { includeInactive: true }), first = stages.find((s) => s.key === "nouveau_lead");
    const before = new Date(now - ctx.settings.no_booking.delay_hours * 3_600_000).toISOString(), floor = new Date(now - 14 * 86_400_000).toISOString();
    // Seulement les leads récents (14 jours) : allumer la règle ne relance pas tout l'historique.
    const leads = first ? await db.list<Prospect>("marketing_prospects", { where: [["eq", "stage_id", first.id], ["lte", "created_at", before], ["gte", "created_at", floor]], limit: 200 }) : [];
    for (const p of leads) {
      if (p.unsubscribed_at) continue;
      const appts = await db.list<Appointment>("marketing_appointments", { where: [["eq", "prospect_id", p.id]], limit: 1 });
      if (appts.length) continue;
      const done = await once(db, "no_booking", p.id, p.id, async () => {
        const contact = p.contact_id ? await db.get<Contact>("marketing_contacts", p.contact_id) : null;
        const email = contact?.email ?? p.email, phone = contact?.phone ?? p.phone;
        const out: string[] = [];
        // Une relance déjà prévue ou partie pour ce prospect (ancien réglage « relance après opt-in ») : jamais deux.
        const already = ctx.settings.no_booking.email && email ? (await db.list("marketing_scheduled_emails", { where: [["eq", "prospect_id", p.id], ["eq", "template", "relance_optin"]], limit: 1 })).length > 0 : false;
        if (already) out.push("une relance existait déjà : pas de second email");
        else if (ctx.settings.no_booking.email && email) {
          // L'email part par la file existante : simulation tant que l'envoi réel n'est pas activé.
          try { await db.insert("marketing_scheduled_emails", { prospect_id: p.id, template: "relance_optin", params: { regle: "no_booking" }, send_at: new Date(now).toISOString(), idempotency_key: `auto:no_booking:${p.id}` }); out.push("email de relance mis en file"); }
          catch { out.push("email de relance déjà en file"); }
        } else if (ctx.settings.no_booking.email) out.push("pas d'email connu : aucun email");
        if (ctx.settings.no_booking.task && phone) {
          const { created } = await ensureTask(db, { prospect_id: p.id, kind: "a_appeler", assignee_id: p.setter_id ?? null, due_at: new Date(now).toISOString(), origin: "automatisation", note: `Aucun rendez-vous ${ctx.settings.no_booking.delay_hours} h après son arrivée.` }, names(ctx));
          out.push(created ? "tâche « À appeler » créée" : "tâche « À appeler » déjà ouverte");
        } else if (ctx.settings.no_booking.task) out.push("pas de téléphone connu : aucune tâche");
        return { action: out.join(" · ") || "rien à faire" };
      });
      if (done) sum.no_booking++;
    }
  }

  // 4. Rendez-vous passé sans résultat saisi : rappel au closer.
  if (ctx.settings.no_result.enabled) {
    const before = new Date(now - ctx.settings.no_result.delay_hours * 3_600_000).toISOString(), floor = new Date(now - 14 * 86_400_000).toISOString();
    const appts = await db.list<Appointment>("marketing_appointments", { where: [["eq", "status", "confirme"], ["eq", "result", "a_venir"], ["lte", "ends_at", before], ["gte", "ends_at", floor]], limit: 200 });
    for (const a of appts) {
      const done = await once(db, "no_result", a.id, a.prospect_id, async () => {
        const p = await db.get<Prospect>("marketing_prospects", a.prospect_id);
        const closerId = a.closer_id ?? p?.closer_id ?? null, closer = ctx.members.find((m) => m.id === closerId) ?? null;
        await ensureTask(db, { prospect_id: a.prospect_id, kind: "resultat", assignee_id: closerId, due_at: new Date(now).toISOString(), origin: "automatisation", note: `Appel du ${new Date(a.starts_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })} : résultat non saisi.` }, names(ctx));
        if (!closer) return { action: "Tâche « Résultat à saisir » créée (aucun closer attribué : pas de rappel par email)" };
        const mail = await ctx.effects.notifyMember(closer, "Résultat d'appel à saisir", [["Prospect", p?.name ?? "prospect"], ["Appel", new Date(a.starts_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })]]);
        return { action: `Tâche « Résultat à saisir » créée pour ${closer.name} · rappel ${mail.status === "envoyee" ? "envoyé" : mail.status === "simulee" ? "simulé (service d'envoi non configuré)" : "non envoyé"}`, detail: mail.error ?? null };
      });
      if (done) sum.no_result++;
    }
  }
  return sum;
}

/** Contexte par défaut : réglages lus en base, aucun membre connu, aucun email (les appelants serveur donnent le vrai). */
async function bareContext(db: Db): Promise<AutomationContext> {
  return { settings: await automationSettings(db), members: [], effects: { notifyMember: async () => ({ status: "simulee" }), now: () => new Date() } };
}
