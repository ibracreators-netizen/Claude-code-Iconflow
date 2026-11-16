import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isMailerConfigured, sendEmail } from "@/lib/email/mailer";
import { flushAlerts, processRow, schedulerState, type AlertGateway, type InboxRepo, type LeadData } from "./inbox-core";
import { scheduleRelanceIfNeeded } from "./public";
import { SupabaseDb } from "./db-supabase";
import { upsertLead, type LeadInput } from "./crm";
import { afterLeadReceived, automationSettings } from "./automations";
import { teamForSystem } from "./team-system";
import { demoAddTestLead, demoBeat, demoInboxRepo, demoInboxRows, demoSetBeat, demoSettings } from "./demo-store";
import { DEFAULT_MARKETING_SETTINGS, type InboxAlert, type InboxRow, type MarketingSettings, type SchedulerBeat, type SchedulerState } from "./types";

/**
 * Boîte de réception des leads, côté serveur (clé service : le planificateur n'a pas de session).
 * Les sites écrivent dans `leads_inbox` par la fonction `lead_inbox_receive` de la base, sans passer
 * par l'application. Ici, on transforme chaque ligne en prospect, de façon rejouable, et on alerte.
 */

export interface InboxRunSummary { ran: boolean; reason?: string; processed: number; traite: number; erreur: number; skipped: number; stuck: number }
const EMPTY: InboxRunSummary = { ran: false, processed: 0, traite: 0, erreur: 0, skipped: 0, stuck: 0 };
const STUCK_AFTER_MS = 5 * 60_000;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
const missingSchema = (e: { message?: string; code?: string } | null) => !!e && /42P01|42703|PGRST20[45]|does not exist|could not find/i.test(`${e.code ?? ""} ${e.message ?? ""}`);
const mergeSettings = (raw: unknown): MarketingSettings => ({ ...DEFAULT_MARKETING_SETTINGS, ...((raw && typeof raw === "object" ? raw : {}) as Partial<MarketingSettings>) });
const recipientsOf = (s: MarketingSettings) => (Array.isArray(s.alert_emails) ? s.alert_emails.filter((e) => typeof e === "string" && e.includes("@")) : []);
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

async function loadSettings(a: Admin): Promise<MarketingSettings> {
  const { data } = await a.from("marketing_settings").select("value").eq("key", "config").maybeSingle();
  return mergeSettings(data?.value);
}

/* ─────────────────────────── Alertes internes (Resend) ─────────────────────────── */

/**
 * Alerte interne : part dès que RESEND_API_KEY et EMAIL_FROM sont lues (elle ne dépend pas du réglage
 * « envoi réel », qui concerne les emails adressés aux prospects). Sinon elle est « simulée », et l'app le montre.
 */
export async function sendInternalAlert(recipients: string[], subject: string, lines: Array<[string, string | null | undefined]>, opts: { intro?: string; key: string }): Promise<{ status: InboxAlert; error?: string }> {
  if (!recipients.length) return { status: "aucun_destinataire" };
  if (!isMailerConfigured()) return { status: "simulee" };
  const kept = lines.filter(([, v]) => v);
  const link = appUrl() ? `${appUrl()}/marketing/reglages/reception` : "";
  const text = [opts.intro, ...kept.map(([k, v]) => `${k} : ${v}`), link ? `\nOuvrir la réception : ${link}` : ""].filter(Boolean).join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#10160f">${opts.intro ? `<p>${esc(opts.intro)}</p>` : ""}<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${kept.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6b766a">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join("")}</table>${link ? `<p style="margin-top:16px"><a href="${esc(link)}">Ouvrir la réception</a></p>` : ""}</div>`;
  try {
    for (const to of recipients) await sendEmail({ to, subject, text, html }, { idempotencyKey: `${opts.key}:${to}`.slice(0, 250) });
    return { status: "envoyee" };
  } catch (e) {
    return { status: "echec", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

/* ─────────────────────────── Accès Supabase ─────────────────────────── */

export const leadInput = (lead: LeadData, receivedAt: string): LeadInput => ({
  email: lead.email, name: lead.name, phone: lead.phone, company: lead.marque, marque: lead.marque, source: lead.source ?? "optin",
  site: lead.site, landing_page: lead.landing_page, referrer: lead.referrer, utm: lead.utm, opted_in_at: receivedAt,
});

function supabaseRepo(a: Admin): InboxRepo {
  const db = new SupabaseDb(a, null);
  return {
    // Une seule porte d'entrée pour tout lead : le contact est rapproché par email puis par téléphone,
    // et son affaire en cours est complétée (jamais écrasée) ou ouverte à l'étape « Nouveau lead ».
    async upsertProspect(lead, receivedAt) {
      const res = await upsertLead(db, leadInput(lead, receivedAt), { kind: "cree", label: "Formulaire du site" });
      await afterLeadReceived(db, res, { settings: await automationSettings(db), members: await teamForSystem(), effects: { notifyMember: async () => ({ status: "simulee" }), now: () => new Date() } }).catch((e) => console.error("[reception] automatisation :", e instanceof Error ? e.message : e));
      // La relance est secondaire : son échec ne doit pas faire passer pour raté un lead bien enregistré.
      try { await scheduleRelanceIfNeeded(res.prospect); } catch (e) { console.error("[reception] relance non programmée :", e instanceof Error ? e.message : e); }
      return { id: res.prospect.id, created: res.createdProspect };
    },
    async mark(id, patch) {
      const { error } = await a.from("leads_inbox").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async pendingAlerts() {
      const { data, error } = await a.from("leads_inbox").select("*").is("alert_status", null).in("status", ["traite", "erreur"]).not("processed_at", "is", null).order("received_at").limit(30);
      if (error) throw new Error(error.message);
      const all = await a.from("leads_inbox").select("id").is("alert_status", null).in("status", ["traite", "erreur"]).not("processed_at", "is", null).order("received_at").limit(5000);
      if (all.error) throw new Error(all.error.message);
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const sus = await a.from("leads_inbox").select("id").eq("status", "suspect").is("alert_status", null).gt("received_at", hourAgo).limit(1000);
      return { rows: (data ?? []) as InboxRow[], ids: ((all.data ?? []) as Array<{ id: string }>).map((r) => r.id), suspectIds: ((sus.data ?? []) as Array<{ id: string }>).map((r) => r.id) };
    },
    async markAlerts(ids, status, error) {
      for (let k = 0; k < ids.length; k += 200) {
        const { error: e } = await a.from("leads_inbox").update({ alert_status: status, alert_error: error ?? null }).in("id", ids.slice(k, k + 200));
        if (e) throw new Error(e.message);
      }
    },
  };
}

/** Envoi des alertes regroupées : compte les emails déjà partis dans l'heure et dans la journée (plafonds dans inbox-core). */
function supabaseGateway(a: Admin, settings: MarketingSettings): AlertGateway {
  const recipients = recipientsOf(settings);
  const stamp = () => { const iso = new Date().toISOString(); return { hour: iso.slice(0, 13), day: iso.slice(0, 10) }; };
  const read = async () => {
    const { data } = await a.from("marketing_settings").select("value").eq("key", "inbox_alerts").maybeSingle();
    const v = (data?.value ?? {}) as { hour?: string; hourSent?: number; day?: string; daySent?: number };
    const now = stamp();
    return { hour: v.hour === now.hour ? (v.hourSent ?? 0) : 0, day: v.day === now.day ? (v.daySent ?? 0) : 0 };
  };
  return {
    recipients: recipients.length,
    mailerReady: isMailerConfigured(),
    sent: read,
    async send(m) {
      const res = await sendInternalAlert(recipients, m.subject, m.lines, { intro: m.intro, key: m.key });
      if (res.status !== "envoyee") return { ok: false, error: res.error ?? res.status };
      const used = await read(), now = stamp();
      await a.from("marketing_settings").upsert({ key: "inbox_alerts", value: { hour: now.hour, hourSent: used.hour + 1, day: now.day, daySent: used.day + 1 }, updated_at: new Date().toISOString() }, { onConflict: "key" });
      return { ok: true };
    },
  };
}
/** Sans base reliée : aucun service d'envoi, l'alerte est simulée (ou sans destinataire). */
const demoGateway = (): AlertGateway => ({ recipients: recipientsOf(demoSettings()).length, mailerReady: false, sent: async () => ({ hour: 0, day: 0 }), send: async () => ({ ok: false, error: "simulation" }) });

/** Traite les lignes « reçu » (ou les lignes désignées). Rejouable : deux passages ne créent jamais de doublon. */
export async function processInbox(opts: { limit?: number; ids?: string[]; force?: boolean } = {}): Promise<InboxRunSummary> {
  const sum: InboxRunSummary = { ...EMPTY, ran: true };
  let rows: InboxRow[]; let repo: InboxRepo; let gateway: AlertGateway; let a: Admin | null = null;

  if (!isSupabaseConfigured()) {
    rows = demoInboxRows().filter((r) => (opts.ids ? opts.ids.includes(r.id) : r.status === "recu"));
    repo = demoInboxRepo(); gateway = demoGateway();
  } else {
    a = createAdminClient();
    if (!a) return { ...EMPTY, reason: "SUPABASE_SERVICE_ROLE_KEY manquante" };
    let q = a.from("leads_inbox").select("*").order("received_at").limit(opts.limit ?? 100);
    q = opts.ids ? q.in("id", opts.ids) : q.eq("status", "recu");
    const { data, error } = await q;
    if (error) return { ...EMPTY, reason: missingSchema(error) ? "migration 0017 non appliquée (table leads_inbox absente)" : error.message };
    rows = (data ?? []) as InboxRow[];
    const settings = await loadSettings(a);
    repo = supabaseRepo(a); gateway = supabaseGateway(a, settings);
    // Règle 1 : l'alerte « nouveau lead » peut être coupée dans Réglages › Automatisations.
    const rule = (await automationSettings(new SupabaseDb(a, null)).catch(() => null))?.new_lead;
    if (rule && (!rule.enabled || !rule.alert)) gateway.leadAlerts = false;
  }

  for (const row of rows) {
    if (a) {
      // Verrou optimiste : si un autre passage a déjà touché la ligne, on la laisse.
      let claim = a.from("leads_inbox").update({ updated_at: new Date().toISOString() }).eq("id", row.id).eq("updated_at", row.updated_at);
      if (!opts.force) claim = claim.eq("status", "recu");
      const { data: claimed } = await claim.select("id");
      if (!claimed?.length) { sum.skipped++; continue; }
    }
    try {
      const out = await processRow(row, repo, { force: opts.force });
      if (out.skipped) sum.skipped++; else { sum.processed++; if (out.status === "traite") sum.traite++; else if (out.status === "erreur") sum.erreur++; }
    } catch (e) {
      // Même l'enregistrement du résultat a échoué : la ligne reste « reçu » et sera reprise au prochain passage.
      console.error("[reception] traitement interrompu :", row.id, e instanceof Error ? e.message : e);
      sum.skipped++;
    }
  }

  // Alertes : au plus un email pour tout le passage (plafonné par heure et par jour). Un échec ici ne défait rien.
  try { await flushAlerts(repo, gateway); } catch (e) { console.error("[reception] alertes non envoyées :", e instanceof Error ? e.message : e); }

  const before = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  if (a) { const { count } = await a.from("leads_inbox").select("id", { count: "exact", head: true }).eq("status", "recu").lt("received_at", before); sum.stuck = count ?? 0; }
  else sum.stuck = demoInboxRows().filter((r) => r.status === "recu" && r.received_at < before).length;
  return sum;
}

/** Lead de test : il suit tout le circuit (réception, traitement, alerte) mais ne crée aucun prospect. */
export async function sendTestLead(): Promise<{ id: string; summary: InboxRunSummary }> {
  const stamp = new Date().toISOString();
  const payload = { email: `test-${Date.now()}@test.invalid`, name: "Lead de test", prenom: "Lead de test", marque: "Test interne", site: "test-interne", page: "/marketing/reglages/reception", landing_page: "/marketing/reglages/reception?utm_source=test", utm: { utm_source: "test", utm_campaign: "lead-de-test" }, recu_le: stamp, is_test: true };
  if (!isSupabaseConfigured()) { const id = demoAddTestLead(payload); return { id, summary: await processInbox({ ids: [id] }) }; }
  const a = createAdminClient();
  if (!a) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante : le lead de test ne peut pas être écrit.");
  const { data, error } = await a.from("leads_inbox").insert({ request_id: `test-${crypto.randomUUID()}`, site: payload.site, landing_page: payload.landing_page, page: payload.page, utm: payload.utm, payload, is_test: true }).select("id").single();
  if (error || !data?.id) throw new Error(missingSchema(error) ? "La table leads_inbox n'existe pas encore : la migration 0017 n'est pas appliquée." : (error?.message ?? "écriture impossible"));
  return { id: data.id as string, summary: await processInbox({ ids: [data.id as string] }) };
}

/* ─────────────────────────── Planificateur : trace du dernier passage ─────────────────────────── */

export async function recordBeat(beat: SchedulerBeat): Promise<void> {
  if (!isSupabaseConfigured()) { demoSetBeat(beat); return; }
  const a = createAdminClient(); if (!a) return;
  await a.from("marketing_settings").upsert({ key: "scheduler", value: beat, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export async function readBeat(): Promise<SchedulerBeat | null> {
  if (!isSupabaseConfigured()) return demoBeat();
  const a = createAdminClient(); if (!a) return null;
  const { data } = await a.from("marketing_settings").select("value").eq("key", "scheduler").maybeSingle();
  const v = data?.value as Partial<SchedulerBeat> | undefined;
  return v && typeof v === "object" ? { last_run_at: v.last_run_at ?? null, ok: v.ok === true, detail: v.detail ?? null, inbox: v.inbox ?? null, outbox: v.outbox ?? null } : null;
}

/**
 * État du planificateur, lu à l'affichage de l'espace Marketing. S'il est arrêté, on prévient par email
 * (au plus une fois toutes les 6 heures). Limite assumée : cette alerte part quand quelqu'un ouvre l'app ;
 * pour une alerte même app éteinte, voir la sentinelle facultative de supabase/ops/marketing_planificateur.sql.
 */
export async function checkScheduler(): Promise<{ beat: SchedulerBeat | null; state: SchedulerState }> {
  const beat = await readBeat();
  const state = schedulerState(beat);
  if (state !== "arrete" || !isSupabaseConfigured()) return { beat, state };
  try {
    const a = createAdminClient(); if (!a) return { beat, state };
    const { data } = await a.from("marketing_settings").select("value").eq("key", "scheduler_alert").maybeSingle();
    const last = Date.parse(((data?.value as { last_sent_at?: string } | undefined)?.last_sent_at) ?? "");
    if (!Number.isNaN(last) && Date.now() - last < 6 * 3600_000) return { beat, state };
    const res = await sendInternalAlert(recipientsOf(await loadSettings(a)), "Iconflow Marketing : le planificateur ne tourne plus",
      [["Dernier passage", beat?.last_run_at ? new Date(beat.last_run_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "jamais"]],
      { intro: "Les leads continuent d'arriver dans la boîte de réception, mais ils ne sont plus transformés en prospects. « Traiter maintenant », dans Marketing › Réception, le fait à la main en attendant.", key: `planificateur-arrete:${new Date().toISOString().slice(0, 13)}` });
    if (res.status === "envoyee") await a.from("marketing_settings").upsert({ key: "scheduler_alert", value: { last_sent_at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch (e) { console.error("[planificateur] alerte non envoyée :", e instanceof Error ? e.message : e); }
  return { beat, state };
}

/** Variables attendues sur l'hébergeur : on dit seulement si elles sont lues, jamais leur valeur. */
export function envStatus(): Array<{ name: string; read: boolean; role: string }> {
  const has = (n: string) => !!(process.env[n] ?? "").trim();
  return [
    { name: "RESEND_API_KEY", read: has("RESEND_API_KEY"), role: "Envoi des alertes et des emails" },
    { name: "EMAIL_FROM", read: has("EMAIL_FROM"), role: "Adresse d'expédition" },
    { name: "CRON_SECRET", read: has("CRON_SECRET"), role: "Autorise le planificateur à appeler l'app" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", read: has("SUPABASE_SERVICE_ROLE_KEY"), role: "Traitement des leads sans session" },
    { name: "NEXT_PUBLIC_APP_URL", read: has("NEXT_PUBLIC_APP_URL"), role: "Liens dans les emails d'alerte" },
  ];
}

export async function alertRecipients(): Promise<string[]> {
  if (!isSupabaseConfigured()) return recipientsOf(demoSettings());
  const a = createAdminClient(); if (!a) return [];
  return recipientsOf(await loadSettings(a));
}
