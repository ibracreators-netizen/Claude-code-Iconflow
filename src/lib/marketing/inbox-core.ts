/**
 * Cœur du traitement de la boîte de réception — fonctions PURES, sans accès direct à la base :
 * le même code sert en production (Supabase) et sans base reliée, et se teste hors ligne
 * (scripts/leads-inbox-selfcheck.ts).
 *
 * Règles :
 *  - rejouable : retraiter une ligne ne crée jamais de doublon (rapprochement par email) ;
 *  - rien n'est ignoré en silence : une ligne illisible passe « erreur » avec la raison ;
 *  - une ligne « suspect » attend une décision humaine (bouton « retraiter ») ;
 *  - un lead de test suit tout le circuit mais ne crée PAS de prospect ;
 *  - les alertes sont regroupées : au plus un email par passage, plafonné par heure et par jour.
 */
import type { InboxAlert, InboxRow, InboxStatus, SchedulerBeat, SchedulerState } from "./types";

export interface LeadData {
  email: string;
  name: string | null;
  phone: string | null;
  marque: string | null;
  source: string | null;
  site: string | null;
  landing_page: string | null;
  page: string | null;
  referrer: string | null;
  utm: Record<string, string> | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
  return s || null;
};
const firstOf = (p: Record<string, unknown>, keys: string[], max: number) => { for (const k of keys) { const v = str(p[k], max); if (v) return v; } return null; };

function cleanUtm(...sources: unknown[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const src of sources) {
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    for (const [k, v] of Object.entries(src as Record<string, unknown>).slice(0, 40)) {
      const key = k.toLowerCase().slice(0, 80), val = str(v, 200);
      if (key && val && !(key in out)) out[key] = val;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Lit une ligne reçue. Seul l'email est obligatoire ; tout le reste est facultatif. */
export function parseLead(row: Pick<InboxRow, "payload" | "site" | "landing_page" | "page" | "referrer" | "utm">): { ok: true; lead: LeadData } | { ok: false; error: string } {
  const p = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : null;
  if (!p) return { ok: false, error: "Charge utile illisible : un objet JSON est attendu." };
  const email = (str(p.email, 160) ?? "").toLowerCase();
  if (!email) return { ok: false, error: "Email manquant dans la charge utile." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: `Email invalide : « ${email} ».` };
  const site = row.site ?? str(p.site, 120);
  const page = row.page ?? str(p.page, 500);
  return {
    ok: true,
    lead: {
      email,
      name: firstOf(p, ["name", "prenom", "full_name", "nom"], 160),
      phone: firstOf(p, ["phone", "telephone", "tel"], 40),
      marque: firstOf(p, ["marque", "brand", "entreprise"], 120),
      source: str(p.source, 80) ?? (site ? `${site}${page ?? ""}`.slice(0, 80) : null),
      site,
      landing_page: row.landing_page ?? str(p.landing_page, 500),
      page,
      referrer: row.referrer ?? str(p.referrer, 500),
      utm: cleanUtm(row.utm, p.utm),
    },
  };
}

/** Ce dont le traitement a besoin de la base. */
export interface InboxRepo {
  /** Crée le prospect ou complète l'existant (même email), sans jamais écraser une valeur déjà enregistrée. */
  upsertProspect(lead: LeadData, receivedAt: string): Promise<{ id: string; created: boolean }>;
  mark(id: string, patch: Partial<Pick<InboxRow, "status" | "error" | "processed_at" | "prospect_id" | "attempts" | "alert_status" | "alert_error">>): Promise<void>;
  /** Lignes dont l'alerte n'est pas encore partie : traitées ou en erreur, et lignes « suspect » de la dernière heure. */
  pendingAlerts(): Promise<{ rows: InboxRow[]; ids: string[]; suspectIds: string[] }>;
  markAlerts(ids: string[], status: InboxAlert, error?: string | null): Promise<void>;
}

export interface RowOutcome { id: string; status: InboxStatus; skipped: boolean; error?: string; prospectId?: string; created?: boolean }

/**
 * Traite UNE ligne. `force` = demande humaine (bouton « retraiter ») : elle lève l'attente d'une ligne
 * « suspect » ou « erreur », et rejoue une ligne déjà traitée sans créer de doublon.
 * L'alerte ne part pas d'ici : elle est regroupée après le passage (voir flushAlerts).
 */
export async function processRow(row: InboxRow, repo: InboxRepo, opts: { force?: boolean; now?: () => string } = {}): Promise<RowOutcome> {
  const now = opts.now ?? (() => new Date().toISOString());
  if (!opts.force && row.status !== "recu") return { id: row.id, status: row.status, skipped: true };
  const attempts = row.attempts + 1;
  // Une alerte par ligne : elle reste « à envoyer » si aucune n'est partie ; une alerte en échec est retentée.
  const retry = row.alert_status === "echec" ? { alert_status: null, alert_error: null } : {};

  const parsed = parseLead(row);
  if (!parsed.ok) {
    await repo.mark(row.id, { status: "erreur", error: parsed.error, attempts, processed_at: now(), ...retry });
    return { id: row.id, status: "erreur", skipped: false, error: parsed.error };
  }

  if (row.is_test) {
    await repo.mark(row.id, { status: "traite", error: null, attempts, processed_at: now(), ...retry });
    return { id: row.id, status: "traite", skipped: false };
  }

  try {
    const res = await repo.upsertProspect(parsed.lead, row.received_at);
    await repo.mark(row.id, { status: "traite", error: null, attempts, processed_at: now(), prospect_id: res.id, ...retry });
    return { id: row.id, status: "traite", skipped: false, prospectId: res.id, created: res.created };
  } catch (e) {
    const message = `Écriture du prospect impossible : ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    await repo.mark(row.id, { status: "erreur", error: message, attempts, processed_at: now(), ...retry });
    return { id: row.id, status: "erreur", skipped: false, error: message };
  }
}

/* ─────────────────────────── Alertes regroupées ─────────────────────────── */

/** Au plus 6 emails d'alerte par heure et 40 par jour, par destinataire. Au-delà, les leads attendent le message suivant. */
export const ALERTS_PER_HOUR = 6;
export const ALERTS_PER_DAY = 40;
/** À partir de 10 lignes « suspect » en une heure, on signale un afflux inhabituel. */
export const SUSPECT_FLOOD = 10;
const DIGEST_LINES = 25;

export interface AlertMessage { subject: string; intro: string; lines: Array<[string, string | null | undefined]>; key: string }
/** Ce dont l'envoi des alertes a besoin : qui prévenir, si le service d'envoi est prêt, et combien d'emails sont déjà partis. */
export interface AlertGateway {
  /** Faux : la règle « Nouveau lead » a coupé l'alerte. Les erreurs et les afflux restent signalés. */
  leadAlerts?: boolean;
  recipients: number;
  mailerReady: boolean;
  sent(): Promise<{ hour: number; day: number }>;
  send(message: AlertMessage): Promise<{ ok: boolean; error?: string }>;
}
export interface AlertFlush { sent: number; rows: number; deferred: number; status: InboxAlert | "aucune" | "differee" }

const campaign = (utm: Record<string, string> | null | undefined) => Object.entries(utm ?? {}).map(([k, v]) => `${k}=${v}`).join(" · ") || null;
const emailOf = (r: InboxRow) => (typeof r.payload?.email === "string" ? r.payload.email : null);

/** Compose UN message pour tout ce qui attend : le détail s'il n'y a qu'un lead, un récapitulatif sinon. */
export function buildAlert(rows: InboxRow[], total: number, suspects: number): AlertMessage {
  const key = `alerte:${rows[0]?.id ?? "afflux"}:${total}:${suspects}`;
  if (rows.length === 1 && total === 1 && suspects === 0) {
    const r = rows[0], p = parseLead(r), lead = p.ok ? p.lead : undefined;
    const who = lead?.name ?? lead?.email ?? emailOf(r) ?? "lead illisible";
    const where = `${r.site ?? ""}${r.page ?? ""}` || "site inconnu";
    const lines: AlertMessage["lines"] = [
      ["Nom", lead?.name], ["Email", lead?.email ?? emailOf(r)], ["Téléphone", lead?.phone], ["Marque", lead?.marque],
      ["Site", r.site ?? lead?.site], ["Page d'entrée", r.landing_page ?? lead?.landing_page], ["Page du formulaire", r.page ?? lead?.page],
      ["Campagne", campaign(lead?.utm ?? r.utm)], ["Reçu le", new Date(r.received_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })],
    ];
    if (r.status === "erreur") return { key, subject: `Lead en erreur : ${who} (${where})`, lines, intro: `Un lead reçu n'a pas pu être transformé en prospect. Raison : ${r.error ?? "inconnue"}. Il reste dans la réception, où tu peux le retraiter.` };
    return { key, subject: `${r.is_test ? "[Test] " : ""}Nouveau lead : ${who} (${where})`, lines, intro: r.is_test ? "Lead de test envoyé depuis l'application. Aucun prospect n'a été créé." : "Un lead vient d'arriver." };
  }
  const errors = rows.filter((r) => r.status === "erreur").length;
  const parts = [total ? `${total} lead${total > 1 ? "s" : ""} reçu${total > 1 ? "s" : ""}` : null, errors ? `${errors} en erreur` : null, suspects ? `afflux inhabituel (${suspects} lignes suspectes)` : null].filter(Boolean);
  const intro = [
    total ? `${total} lead${total > 1 ? "s sont arrivés" : " est arrivé"} depuis la dernière alerte. Ils sont regroupés dans ce seul message.` : null,
    suspects ? `${suspects} lignes ont été mises de côté en « suspect » en moins d'une heure (email invalide, champ piège ou afflux inhabituel). Elles ne sont pas devenues des prospects : vérifie-les dans la réception.` : null,
  ].filter(Boolean).join(" ");
  const lines: AlertMessage["lines"] = rows.slice(0, DIGEST_LINES).map((r) => [
    r.status === "erreur" ? "Erreur" : r.is_test ? "Test" : "Lead",
    [emailOf(r) ?? "email absent", `${r.site ?? ""}${r.page ?? ""}` || null, campaign(r.utm), r.status === "erreur" ? r.error : null].filter(Boolean).join(" · "),
  ]);
  if (total > lines.length) lines.push(["Et aussi", `${total - lines.length} autre${total - lines.length > 1 ? "s" : ""}, à voir dans la réception`]);
  return { key, subject: `Iconflow Marketing : ${parts.join(", ")}`, intro, lines };
}

/**
 * Envoie AU PLUS UN email par passage pour tout ce qui attend (leads traités, erreurs, afflux de lignes suspectes).
 * Mille lignes d'un coup ne font donc jamais mille emails. Quand le plafond horaire ou quotidien est atteint,
 * rien n'est perdu : les lignes restent « en attente » et partent dans le message suivant.
 */
export async function flushAlerts(repo: InboxRepo, gw: AlertGateway): Promise<AlertFlush> {
  // `rows` : les premières lignes, pour le détail du message ; `ids` : toutes celles que ce message couvre.
  const pending = await repo.pendingAlerts();
  let rows = pending.rows, leadIds = pending.ids; const suspectIds = pending.suspectIds;
  if (gw.leadAlerts === false) {
    // Les leads bien traités ne sont pas signalés ; une ligne en erreur l'est toujours.
    const quiet = rows.filter((r) => r.status === "traite").map((r) => r.id);
    const errors = new Set(rows.filter((r) => r.status === "erreur").map((r) => r.id));
    const silenced = leadIds.filter((id) => !errors.has(id));
    if (silenced.length || quiet.length) await repo.markAlerts([...new Set([...silenced, ...quiet])], "desactivee");
    rows = rows.filter((r) => r.status === "erreur"); leadIds = leadIds.filter((id) => errors.has(id));
  }
  const suspects = suspectIds.length >= SUSPECT_FLOOD ? suspectIds : [];
  const total = leadIds.length;
  const ids = [...leadIds, ...suspects];
  if (!ids.length) return { sent: 0, rows: 0, deferred: 0, status: "aucune" };
  if (!gw.recipients) { await repo.markAlerts(ids, "aucun_destinataire"); return { sent: 0, rows: ids.length, deferred: 0, status: "aucun_destinataire" }; }
  if (!gw.mailerReady) { await repo.markAlerts(ids, "simulee"); return { sent: 0, rows: ids.length, deferred: 0, status: "simulee" }; }
  const used = await gw.sent();
  if (used.hour >= ALERTS_PER_HOUR || used.day >= ALERTS_PER_DAY) return { sent: 0, rows: 0, deferred: ids.length, status: "differee" };
  const res = await gw.send(buildAlert(rows, total, suspects.length));
  await repo.markAlerts(ids, res.ok ? "envoyee" : "echec", res.ok ? null : (res.error ?? "envoi impossible"));
  return { sent: res.ok ? 1 : 0, rows: ids.length, deferred: 0, status: res.ok ? "envoyee" : "echec" };
}

/** Seuils du planificateur : en retard au-delà de 5 minutes sans passage, arrêté au-delà de 15. */
export const SCHEDULER_LATE_MS = 5 * 60_000;
export const SCHEDULER_DOWN_MS = 15 * 60_000;
export function schedulerState(beat: SchedulerBeat | null, now: number = Date.now()): SchedulerState {
  const t = beat?.last_run_at ? Date.parse(beat.last_run_at) : NaN;
  if (Number.isNaN(t)) return "jamais";
  const age = now - t;
  return age > SCHEDULER_DOWN_MS ? "arrete" : age > SCHEDULER_LATE_MS ? "en_retard" : "ok";
}
