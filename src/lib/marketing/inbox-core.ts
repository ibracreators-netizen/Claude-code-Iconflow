/**
 * Cœur du traitement de la boîte de réception — fonctions PURES, sans accès direct à la base :
 * le même code sert en production (Supabase) et sans base reliée, et se teste hors ligne
 * (scripts/leads-inbox-selfcheck.ts).
 *
 * Règles :
 *  - rejouable : retraiter une ligne ne crée jamais de doublon (rapprochement par email) ;
 *  - rien n'est ignoré en silence : une ligne illisible passe « erreur » avec la raison ;
 *  - une ligne « suspect » attend une décision humaine (bouton « retraiter ») ;
 *  - un lead de test suit tout le circuit mais ne crée PAS de prospect.
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

/** Ce dont le traitement a besoin de la base et de l'envoi d'emails. */
export interface InboxRepo {
  /** Crée le prospect ou complète l'existant (même email), sans jamais écraser une valeur déjà enregistrée. */
  upsertProspect(lead: LeadData, receivedAt: string): Promise<{ id: string; created: boolean }>;
  mark(id: string, patch: Partial<Pick<InboxRow, "status" | "error" | "processed_at" | "prospect_id" | "attempts" | "alert_status" | "alert_error">>): Promise<void>;
  notify(kind: "lead" | "erreur", row: InboxRow, info: { lead?: LeadData; error?: string; created?: boolean }): Promise<{ status: InboxAlert; error?: string }>;
}

export interface RowOutcome { id: string; status: InboxStatus; skipped: boolean; error?: string; prospectId?: string; created?: boolean }

/**
 * Traite UNE ligne. `force` = demande humaine (bouton « retraiter ») : elle lève l'attente d'une ligne
 * « suspect » ou « erreur », et rejoue une ligne déjà traitée sans créer de doublon.
 */
export async function processRow(row: InboxRow, repo: InboxRepo, opts: { force?: boolean; now?: () => string } = {}): Promise<RowOutcome> {
  const now = opts.now ?? (() => new Date().toISOString());
  if (!opts.force && row.status !== "recu") return { id: row.id, status: row.status, skipped: true };
  const attempts = row.attempts + 1;
  // Une alerte par ligne : on ne renvoie que si aucune n'est partie (ou si la précédente a échoué).
  const alertDue = row.alert_status === null || row.alert_status === "echec";

  const parsed = parseLead(row);
  if (!parsed.ok) {
    const a = alertDue ? await repo.notify("erreur", row, { error: parsed.error }) : null;
    await repo.mark(row.id, { status: "erreur", error: parsed.error, attempts, processed_at: now(), ...(a ? { alert_status: a.status, alert_error: a.error ?? null } : {}) });
    return { id: row.id, status: "erreur", skipped: false, error: parsed.error };
  }

  if (row.is_test) {
    const a = alertDue ? await repo.notify("lead", row, { lead: parsed.lead }) : null;
    await repo.mark(row.id, { status: "traite", error: null, attempts, processed_at: now(), ...(a ? { alert_status: a.status, alert_error: a.error ?? null } : {}) });
    return { id: row.id, status: "traite", skipped: false };
  }

  try {
    const res = await repo.upsertProspect(parsed.lead, row.received_at);
    const a = alertDue ? await repo.notify("lead", row, { lead: parsed.lead, created: res.created }) : null;
    await repo.mark(row.id, { status: "traite", error: null, attempts, processed_at: now(), prospect_id: res.id, ...(a ? { alert_status: a.status, alert_error: a.error ?? null } : {}) });
    return { id: row.id, status: "traite", skipped: false, prospectId: res.id, created: res.created };
  } catch (e) {
    const message = `Écriture du prospect impossible : ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    const a = alertDue ? await repo.notify("erreur", row, { lead: parsed.lead, error: message }) : null;
    await repo.mark(row.id, { status: "erreur", error: message, attempts, processed_at: now(), ...(a ? { alert_status: a.status, alert_error: a.error ?? null } : {}) });
    return { id: row.id, status: "erreur", skipped: false, error: message };
  }
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
