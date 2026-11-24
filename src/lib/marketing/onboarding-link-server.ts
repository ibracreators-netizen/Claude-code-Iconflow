import "server-only";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { canAccess, SALES_ROLE_MODULES } from "@/lib/permissions";
import { getSession } from "@/lib/auth/session";
import { DemoStore } from "@/lib/data/demo-store";
import type { Session } from "@/lib/data/store";
import type { Db } from "./db";
import { isAdmin, salesRole, systemDb, type Crm } from "./crm-server";
import { normalizeEmail } from "./crm";
import { rateLimited } from "./public";
import { isMissingTable, PEOPLE_TABLE } from "./kpi-links";
import { setStepDone, type Doc, type Folder, type Progress, type Step } from "./resources";
import * as ol from "./onboarding-link";
import type { MarketingRole } from "./types";

/*
 * Lien d'onboarding, côté serveur : qui le gère, le réglage (version, actif), la page publique /bienvenue/<jeton>
 * et le cookie d'accès de la recrue. La logique pure (jeton, cookie, reconnaissance, filtres) est dans onboarding-link.ts.
 * La recrue n'a pas de compte : tout est lu et écrit avec la clé service (ou en mémoire sans base), avec des filtres
 * explicites, après revérification du jeton, du cookie et de la version à CHAQUE appel. Un membre de l'équipe, lui,
 * a un compte : il doit en plus être connecté à CE compte sur l'appareil (vérifié à l'ouverture et à chaque appel).
 */

/** Qui gère le lien : l'administrateur, ou un membre de l'agence qui peut écrire les ressources (même règle que la base). */
export const canManageOnboardingLink = (crm: Crm) =>
  isAdmin(crm.session) || (!salesRole(crm.session) && crm.session.profile.role === "agency" && canAccess(crm.session.profile, "marketing_ressources"));

/** Secret serveur : la clé service de Supabase en ligne ; un secret fixe de démo sans base. null : clé absente chez l'hébergeur. */
function secret(): string | null {
  if (!isSupabaseConfigured()) return ol.DEMO_SECRET;
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return k.length >= 20 ? k : null;
}
interface Ctx { db: Db; key: Buffer; setting: ol.OnboardingLinkSetting }
/** Accès système, clé dérivée et réglage du lien. null : indisponible (clé absente, réglage illisible) — jamais « actif » par défaut sur une erreur. */
async function context(): Promise<Ctx | null> {
  const s = secret(), db = systemDb();
  if (!s || !db) return null;
  try { return { db, key: ol.deriveKey(s), setting: ol.parseSetting(await db.setting(ol.SETTING_KEY)) }; }
  catch (e) { console.error("[onboarding lien] réglage illisible :", e instanceof Error ? e.message : e); return null; }
}

/* ─────────────────────────── Administrateur ─────────────────────────── */

export type AdminLink = { state: "ok"; token: string; path: string; enabled: boolean } | { state: "unavailable" };
export const UNAVAILABLE_ADMIN = "Le lien d'onboarding n'est pas disponible : la clé service de Supabase manque chez l'hébergeur, ou la base ne répond pas.";
const adminView = (c: Ctx): AdminLink => { const token = ol.linkToken(c.key, c.setting.version); return { state: "ok", token, path: ol.onboardingLinkPath(token), enabled: c.setting.enabled }; };

/** Le lien et son état, pour la carte de la page Ressources. null : la personne connectée ne gère pas le lien. */
export async function adminOnboardingLink(crm: Crm): Promise<AdminLink | null> {
  if (!canManageOnboardingLink(crm)) return null;
  const c = await context();
  return c ? adminView(c) : { state: "unavailable" };
}
/** « Changer le lien » : version suivante. L'ancien lien et tous les accès déjà ouverts cessent de marcher. */
export async function changeOnboardingLink(): Promise<AdminLink> {
  const c = await context();
  if (!c) throw new Error(UNAVAILABLE_ADMIN);
  const next = ol.nextVersion(c.setting);
  await c.db.saveSetting(ol.SETTING_KEY, next);
  return adminView({ ...c, setting: next });
}
/** « Lien actif » : coupé, le lien et les accès ouverts ne marchent plus ; rallumé, le même lien remarche. */
export async function setOnboardingLinkEnabled(enabled: boolean): Promise<AdminLink> {
  const c = await context();
  if (!c) throw new Error(UNAVAILABLE_ADMIN);
  const next = { ...c.setting, enabled: enabled === true };
  await c.db.saveSetting(ol.SETTING_KEY, next);
  return adminView({ ...c, setting: next });
}

/* ─────────────────────────── Reconnaître la recrue ─────────────────────────── */

const MEMBER_COLUMNS = "id, role, display_name, email, disabled_at, marketing_role, permissions";
const PERSON_COLUMNS = "id, name, email, role, active";
const PUBLIC_SESSION = { user: { id: "public", email: "" }, profile: { role: "agency" }, demo: true } as unknown as Session;
const TRIAL_LABEL: Record<MarketingRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };
const asPermissions = (raw: unknown): string[] | null => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : null);
const asMember = (p: Partial<Omit<ol.MemberCandidate, "permissions">> & { permissions?: unknown }): ol.MemberCandidate => ({
  id: String(p.id ?? ""), role: p.role ?? null, display_name: p.display_name ?? null, email: p.email ?? null, disabled_at: p.disabled_at ?? null, marketing_role: p.marketing_role ?? null, permissions: asPermissions(p.permissions),
});
const asPerson = (p: Partial<ol.PersonCandidate>): ol.PersonCandidate => ({ id: String(p.id ?? ""), name: String(p.name ?? ""), email: p.email ?? null, role: String(p.role ?? ""), active: p.active === true });

/**
 * Sans base : les membres de la démo (comptes « marketing » créés pendant la session) et les comptes d'essai des trois
 * rôles (setter@demo.invalid, closer@demo.invalid, media_buyer@demo.invalid), comme la liste des membres de l'espace.
 */
async function demoMembers(): Promise<ol.MemberCandidate[]> {
  const live = (await new DemoStore(PUBLIC_SESSION).profiles()).filter((p) => p.role === "marketing").map((p) => asMember({ ...p, marketing_role: p.marketing_role ?? null }));
  const trial = (["setter", "closer", "media_buyer"] as const).map((r) => asMember({ id: `demo-${r}`, role: "marketing", display_name: `${TRIAL_LABEL[r]} (essai)`, email: `${r}@demo.invalid`, disabled_at: null, marketing_role: r, permissions: [...SALES_ROLE_MODULES[r]] }));
  return [...live, ...trial.filter((t) => !live.some((l) => l.id === t.id))];
}
async function membersByEmail(db: Db, email: string): Promise<ol.MemberCandidate[]> {
  if (!isSupabaseConfigured()) return demoMembers();
  return (await db.list<ol.MemberCandidate>("profiles", { where: [["eq", "role", "marketing"], ["null", "disabled_at"], ["ieq", "email", email]], columns: MEMBER_COLUMNS, limit: 5 })).map(asMember);
}
async function memberById(db: Db, id: string): Promise<ol.MemberCandidate | null> {
  if (!isSupabaseConfigured()) return (await demoMembers()).find((m) => m.id === id) ?? null;
  const [row] = await db.list<ol.MemberCandidate>("profiles", { where: [["eq", "id", id]], columns: MEMBER_COLUMNS, limit: 1 });
  return row ? asMember(row) : null;
}
/** Personnes des liens de saisie (sans leur jeton). Table absente (migration 0028 non passée) : personne. */
async function people(db: Db, where: Parameters<Db["list"]>[1]): Promise<ol.PersonCandidate[]> {
  try { return (await db.list<ol.PersonCandidate>(PEOPLE_TABLE, { ...where, columns: PERSON_COLUMNS })).map(asPerson); }
  catch (e) { if (isMissingTable(e)) return []; throw e; }
}
const peopleByEmail = (db: Db, email: string) => people(db, { where: [["eq", "active", true], ["ieq", "email", email]], limit: 5 });
const personById = async (db: Db, id: string) => (await people(db, { where: [["eq", "id", id]], limit: 1 }))[0] ?? null;

/** Identifiant du compte connecté sur cet appareil (session de l'app), ou null. Session illisible : personne. */
async function sessionUserId(): Promise<string | null> {
  try { return (await getSession())?.user.id ?? null; }
  catch { return null; }
}
/**
 * La recrue du cookie, revérifiée : signature, version du lien, expiration, et toujours active (membre non retiré,
 * avec la page « Ressources » et connecté à SON compte sur cet appareil ; lien de saisie actif).
 */
async function recruitFromCookie(c: Ctx): Promise<ol.Recruit | null> {
  const pass = ol.readPass(c.key, (await cookies()).get(ol.COOKIE_NAME)?.value, c.setting);
  if (!pass) return null;
  if (pass.k === "m") return ol.passRecruit(pass, await memberById(c.db, pass.id), null, await sessionUserId());
  return ol.passRecruit(pass, null, await personById(c.db, pass.id), null);
}

/* ─────────────────────────── Page publique /bienvenue/<jeton> ─────────────────────────── */

export const UNKNOWN_EMAIL = "Cet e-mail n'est pas reconnu. Utilise celui que ton responsable a enregistré pour toi.";
export const OTHER_ACCOUNT = "Cet e-mail a un compte dans l'app, mais un autre compte est connecté sur cet appareil. Ouvre ce lien là où tu es connecté à ton compte.";
export const NO_RESOURCES = "Ton compte n'a pas accès aux ressources. Demande à ton responsable de t'ouvrir la page Ressources.";
const LINK_GONE = "Ce lien n'est plus valable.";
const LINK_PAUSED = "Ce lien est en pause pour le moment.";
const TOO_MANY = "Trop d'essais d'un coup. Réessaie dans 10 minutes.";
const UNAVAILABLE = "Le lien n'est pas disponible pour le moment. Réessaie un peu plus tard.";
const EXPIRED = "Ton accès a expiré. Recharge la page et retape ton e-mail.";

export interface PublicDoc { id: string; title: string; kind: string }
export interface PublicStep { id: string; title: string; description: string | null; document_id: string | null }
export interface PublicGroup { key: string; name: string; standard: boolean; docs: PublicDoc[] }
export type WelcomeState =
  | { state: "gone" } | { state: "paused" } | { state: "unavailable" } | { state: "ask" }
  | { state: "ok"; kind: "m" | "l"; personId: string; firstName: string; role: MarketingRole; steps: PublicStep[]; done: string[]; onboardingDocs: PublicDoc[]; groups: PublicGroup[] };

const ipKey = (ip: string) => ip.slice(0, 64) || "anon";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicDoc = (d: Doc): PublicDoc => ({ id: d.id, title: d.title, kind: d.kind });
/**
 * Ouvre le lien : jeton bien formé, de la version actuelle, lien actif. Le vrai jeton d'un lien coupé : « paused »
 * (il remarchera tel quel). Tout autre jeton : la même réponse « plus valable ».
 */
async function openLink(token: unknown): Promise<Ctx | "gone" | "paused" | "unavailable"> {
  if (!ol.isOnboardingToken(token)) return "gone";
  const c = await context();
  if (!c) return "unavailable";
  const state = ol.linkState(c.key, c.setting, token);
  return state === "open" ? c : state;
}

/**
 * Données de la page du lien. Jeton faux ou ancien : « gone » ; lien coupé : « paused » ; rien d'autre. Lien valable sans accès ouvert : le
 * formulaire. Accès ouvert : le contenu du rôle de la recrue, et sa progression (membre) ; jamais le contenu d'un autre rôle.
 */
export async function welcomePage(token: string, ip: string): Promise<WelcomeState> {
  if (rateLimited(`bienvenue-page:${ipKey(ip)}`, 120, 60_000)) return { state: "unavailable" };
  const c = await openLink(token);
  if (typeof c === "string") return { state: c };
  try {
    const recruit = await recruitFromCookie(c);
    if (!recruit) return { state: "ask" };
    const content = await ol.loadRoleContent(c.db, recruit.role);
    const stepIds = new Set(content.steps.map((s) => s.id));
    const done = recruit.kind === "m"
      ? (await c.db.list<Progress>("marketing_onboarding_progress", { where: [["eq", "profile_id", recruit.id]] })).map((p) => p.step_id).filter((id) => stepIds.has(id))
      : [];
    const grouped = ol.groupDocs(recruit.role, content);
    return {
      state: "ok", kind: recruit.kind, personId: recruit.id, firstName: ol.recruitFirstName(recruit), role: recruit.role, done,
      steps: ol.stepsView(content),
      onboardingDocs: grouped.onboarding.map(publicDoc),
      groups: grouped.groups.map((g) => ({ key: g.key, name: g.name, standard: g.standard, docs: g.docs.map(publicDoc) })),
    };
  } catch (e) {
    console.error("[onboarding lien] lecture impossible :", e instanceof Error ? e.message : e);
    return { state: "unavailable" };
  }
}

export type WelcomeDocState = { state: "gone" } | { state: "paused" } | { state: "unavailable" } | { state: "ask" } | { state: "missing" } | { state: "ok"; doc: { id: string; title: string; kind: string; content: string } };
/** Un document, en lecture seule, seulement s'il appartient au rôle de la recrue (mêmes filtres que la page). */
export async function welcomeDocument(token: string, docId: string, ip: string): Promise<WelcomeDocState> {
  if (rateLimited(`bienvenue-page:${ipKey(ip)}`, 120, 60_000)) return { state: "unavailable" };
  const c = await openLink(token);
  if (typeof c === "string") return { state: c };
  try {
    const recruit = await recruitFromCookie(c);
    if (!recruit) return { state: "ask" };
    if (typeof docId !== "string" || !UUID_RE.test(docId)) return { state: "missing" };
    const [doc, folders] = await Promise.all([
      c.db.get<Doc>("documents", docId),
      c.db.list<Folder>("document_folders", { where: [["eq", "space", "marketing"]] }),
    ]);
    const mine = doc ? ol.roleContent(recruit.role, folders, [doc], []).docs[0] : undefined;
    if (!mine || mine.id !== docId) return { state: "missing" };
    return { state: "ok", doc: { id: mine.id, title: mine.title, kind: mine.kind, content: typeof mine.content === "string" ? mine.content : "" } };
  } catch (e) {
    console.error("[onboarding lien] document illisible :", e instanceof Error ? e.message : e);
    return { state: "unavailable" };
  }
}

/** `closed` : le lien ne s'ouvre pas (« gone » : plus valable ; « paused » : en pause). `login` : se connecter d'abord à son compte. */
export type OpenResult = { ok: true } | { ok: false; error: string; closed?: "gone" | "paused"; login?: boolean };
/** Essais ratés du formulaire, par adresse IP : 10 en 10 minutes. Une ouverture réussie ne compte pas. */
const failures = new ol.FailureLimiter(10, 10 * 60_000);
/**
 * La recrue tape son e-mail. Une adresse IP qui a raté 10 essais en 10 minutes est refusée (même avec le bon e-mail) ;
 * seul un essai raté compte, et le compteur est propre à chaque adresse : personne ne peut bloquer les autres recrues.
 * Jeton et lien revérifiés ; e-mail reconnu (membre actif de l'équipe Marketing connecté à son compte sur cet appareil,
 * sinon personne active d'un lien de saisie). Reconnu : cookie d'accès signé (httpOnly, 30 jours, limité à
 * /bienvenue), lié à la version du lien.
 */
export async function openOnboarding(token: unknown, email: unknown, ip: string): Promise<OpenResult> {
  const who = ipKey(ip);
  if (failures.blocked(who)) return { ok: false, error: TOO_MANY };
  const c = await openLink(token);
  if (c === "paused") return { ok: false, closed: "paused", error: LINK_PAUSED };
  if (c === "gone") { failures.fail(who); return { ok: false, closed: "gone", error: LINK_GONE }; }
  if (c === "unavailable") return { ok: false, error: UNAVAILABLE };
  const e = normalizeEmail(email);
  if (!e) { failures.fail(who); return { ok: false, error: UNKNOWN_EMAIL }; }
  try {
    const [members, persons, userId] = await Promise.all([membersByEmail(c.db, e), peopleByEmail(c.db, e), sessionUserId()]);
    const match = ol.matchRecruit(e, members, persons, userId);
    if (!match.ok) {
      failures.fail(who);
      // Un autre compte est connecté sur cet appareil : on n'ouvre pas l'espace d'un collègue.
      if (match.why === "other-account") return { ok: false, error: OTHER_ACCOUNT };
      return { ok: false, error: match.why === "no-access" ? NO_RESOURCES : UNKNOWN_EMAIL };
    }
    (await cookies()).set(ol.COOKIE_NAME, ol.signPass(c.key, ol.newPass(match.recruit, c.setting)), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: ol.COOKIE_PATH, maxAge: ol.COOKIE_MAX_AGE,
    });
    return { ok: true };
  } catch (err) {
    console.error("[onboarding lien] reconnaissance impossible :", err instanceof Error ? err.message : err);
    return { ok: false, error: UNAVAILABLE };
  }
}
/** « Ce n'est pas moi » : l'accès ouvert sur cet appareil est effacé. */
export async function forgetOnboarding(): Promise<void> {
  (await cookies()).delete({ name: ol.COOKIE_NAME, path: ol.COOKIE_PATH });
}

export type StepResult = { ok: true } | { ok: false; error: string; expired?: boolean };
/**
 * Un membre coche ou décoche une étape. Revérifie le jeton, le cookie (signature, version, expiration), que le membre
 * est toujours actif, avec la page « Ressources », connecté à SON compte sur cet appareil, et que l'étape est bien de
 * son rôle ; puis écrit SA ligne de progression (clé service).
 * Une personne d'un lien de saisie n'a pas de profil : sa progression reste sur son appareil, rien n'est écrit ici.
 */
export async function toggleWelcomeStep(token: unknown, stepId: unknown, done: unknown, ip: string): Promise<StepResult> {
  if (rateLimited(`bienvenue-etape:${ipKey(ip)}`, 120, 60_000)) return { ok: false, error: "Trop d'actions d'un coup. Réessaie dans une minute." };
  const c = await openLink(token);
  if (c === "gone" || c === "paused") return { ok: false, expired: true, error: c === "paused" ? LINK_PAUSED : LINK_GONE };
  if (c === "unavailable") return { ok: false, error: UNAVAILABLE };
  try {
    const recruit = await recruitFromCookie(c);
    if (!recruit) return { ok: false, expired: true, error: EXPIRED };
    if (recruit.kind !== "m") return { ok: false, error: "Ta progression est enregistrée sur cet appareil." };
    const steps = await c.db.list<Step>("marketing_onboarding_steps", { where: [["eq", "role", recruit.role]] });
    const step = ol.stepOfRole(steps, stepId, recruit.role);
    if (!step) return { ok: false, error: "Cette étape n'existe plus. Recharge la page." };
    const rows = await c.db.list<Progress>("marketing_onboarding_progress", { where: [["eq", "profile_id", recruit.id], ["eq", "step_id", step.id]] });
    await setStepDone(c.db, step.id, recruit.id, done === true, rows);
    return { ok: true };
  } catch (e) {
    console.error("[onboarding lien] progression non enregistrée :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Enregistrement impossible pour le moment. Réessaie dans un instant." };
  }
}
