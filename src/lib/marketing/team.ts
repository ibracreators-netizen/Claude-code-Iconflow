import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, isSupabaseConfigured } from "@/lib/supabase/env";
import { isMailerConfigured, sendEmail } from "@/lib/email/mailer";
import { escapeHtml } from "@/lib/email/templates";
import type { SalesRole } from "@/lib/permissions";
import {
  INVITE_ROLE_LABEL, assignablePages, checkInviteInput, existingAccountProblem, explainInviteError, firstName, isMarketingOnly, pagesForRole, redirectRefused,
  type InviteOutcome, type InviteProblem, type InviteRole,
} from "./invite-errors";
import type { TeamLogEntry } from "./types";
import type { Session } from "@/lib/data/store";

/**
 * Équipe de l'espace Marketing : toi (administrateur) et tes membres. Réservé à l'administrateur (vérifié par l'appelant),
 * exécuté avec la clé service. Setter, Closer, Media buyer : compte « marketing », jamais « agency ». Responsable : compte
 * agence dont les pages sont seulement les modules Marketing. Aucun membre n'est rattaché à un client.
 */
export interface SalesMember {
  id: string; name: string; email: string | null; kind: "admin" | "agence" | "commercial"; role: SalesRole | null; disabled: boolean; google: "ok" | "invalide" | null; created_at: string; permissions: string[]; avatar: string | null;
  /** Compte agence aux seules pages Marketing (rôle « Responsable »). */
  manager?: boolean;
  /** Jamais connecté depuis son invitation (lu dans l'authentification). Absent : inconnu. */
  pending?: boolean;
}
interface Row { id: string; role: string; display_name: string | null; email: string | null; permissions: unknown; disabled_at: string | null; marketing_role: string | null; created_at: string; avatar_url?: string | null; client_id?: string | null }
const ROLES: SalesRole[] = ["setter", "closer", "media_buyer"];
export const SALES_ROLE_LABEL: Record<SalesRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };

function admin() { const a = createAdminClient(); if (!a) throw new Error("La variable SUPABASE_SERVICE_ROLE_KEY n'est pas lue sur l'hébergeur."); return a; }
type Admin = ReturnType<typeof admin>;
const redirectTo = () => `${APP_URL}/auth/callback`;

/** Dernière connexion connue d'un compte d'authentification. undefined : lecture impossible. */
async function authUser(a: Admin, id: string) {
  try { const { data, error } = await a.auth.admin.getUserById(id); return error ? undefined : data.user ?? null; } catch { return undefined; }
}

export async function salesTeam(): Promise<SalesMember[]> {
  if (!isSupabaseConfigured()) return [];
  const a = admin();
  const [{ data, error }, google] = await Promise.all([
    a.from("profiles").select("*").in("role", ["agency", "marketing"]).order("created_at"),
    a.from("marketing_google_accounts").select("profile_id, status"),
  ]);
  if (error) throw new Error(error.message);
  const g = new Map(((google.data ?? []) as Array<{ profile_id: string; status: "ok" | "invalide" }>).map((r) => [r.profile_id, r.status]));
  const rows = ((data ?? []) as Row[])
    .filter((p) => p.role === "marketing" || p.permissions == null || (Array.isArray(p.permissions) && p.permissions.some((m) => String(m).startsWith("marketing_"))));
  // Invitation acceptée ou non : seulement pour les membres (un administrateur s'est forcément connecté).
  const seen = new Map(await Promise.all(rows.filter((p) => p.permissions != null || p.role === "marketing").map(async (p) => {
    const u = await authUser(a, p.id);
    return [p.id, u === undefined ? undefined : !u?.last_sign_in_at] as const;
  })));
  return rows.map((p) => ({ id: p.id, name: p.display_name?.trim() || p.email || "Membre", email: p.email, kind: p.role === "marketing" ? "commercial" : p.permissions == null ? "admin" : "agence",
    role: ROLES.includes(p.marketing_role as SalesRole) ? (p.marketing_role as SalesRole) : null, disabled: !!p.disabled_at, google: g.get(p.id) ?? null, created_at: p.created_at,
    permissions: Array.isArray(p.permissions) ? p.permissions.map(String).filter((m) => m.startsWith("marketing_")) : [], avatar: p.avatar_url ?? null,
    manager: p.role === "agency" && isMarketingOnly(p.permissions), pending: seen.get(p.id) }));
}

/** Historique d'un compte. Best-effort : journaliser n'échoue jamais l'action (table absente avant la migration 0026). */
async function logTeam(profileId: string, actorId: string | null, kind: TeamLogEntry["kind"], data: Record<string, unknown> = {}) {
  try { await admin().from("marketing_team_log").insert({ profile_id: profileId, actor_id: actorId, kind, data }); } catch { /* best-effort */ }
}
export async function teamLog(profileId: string): Promise<TeamLogEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await admin().from("marketing_team_log").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(100);
  return error ? [] : ((data ?? []) as TeamLogEntry[]);
}
/** Dernière connexion d'un compte (lue dans l'authentification). null si inconnue. */
export async function lastSignIn(profileId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try { const { data } = await admin().auth.admin.getUserById(profileId); return data.user?.last_sign_in_at ?? null; } catch { return null; }
}

/* ─── Invitation ───────────────────────────────────────────────────────────── */

/** E-mail d'invitation à l'équipe Marketing (tutoiement, sans mot technique). */
function inviteEmail(i: { name: string; inviter: string | null; role: InviteRole; link: string }) {
  const first = firstName(i.name, ""), inviter = i.inviter?.trim() || "L'équipe Iconflow", role = INVITE_ROLE_LABEL[i.role];
  const lines = [`${inviter} t'invite à rejoindre l'équipe Marketing d'Iconflow, comme ${role}.`, "Ouvre ton compte en un clic : tu choisiras ensuite ton mot de passe."];
  const note = "Ce lien est personnel et ne sert qu'une fois. S'il ne marche plus, demande une nouvelle invitation.";
  const title = first ? `Bienvenue dans l'équipe, ${first}.` : "Bienvenue dans l'équipe.";
  const p = (t: string, extra = "") => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2f3a2e;${extra}">${escapeHtml(t)}</p>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px 12px;background:#f2f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e7e0;border-radius:14px;padding:28px 24px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#10160f;">${escapeHtml(title)}</h1>
${lines.map((l) => p(l)).join("\n")}
<p style="margin:22px 0;"><a href="${escapeHtml(i.link)}" style="display:inline-block;background:#2f6b3f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px;">Créer mon mot de passe</a></p>
${p(note, "font-size:13px;color:#6b766a;")}
</div></body></html>`;
  const text = [title, "", ...lines, "", `Créer mon mot de passe : ${i.link}`, "", note].join("\n");
  return { subject: "Ton accès à l'équipe Marketing d'Iconflow", html, text };
}

/** Envoie l'e-mail si l'app sait envoyer ; sinon, ou si l'envoi échoue, remet le lien à l'administrateur. */
async function deliver(inviter: Session, m: { id: string; name: string; email: string; role: InviteRole }, link: string): Promise<InviteOutcome> {
  const base = { memberId: m.id, name: m.name, email: m.email };
  if (!isMailerConfigured()) return { status: "lien", ...base, link, reason: "pas_d_envoi" };
  try {
    await sendEmail({ to: m.email, ...inviteEmail({ name: m.name, inviter: inviter.profile.display_name, role: m.role, link }) });
    return { status: "envoye", ...base };
  } catch (e) {
    return { status: "lien", ...base, link, reason: "envoi_echoue", detail: e instanceof Error ? e.message : null };
  }
}

/** Fiche à poser pour un rôle : jamais de client, toujours des pages Marketing seulement. */
function profileFor(role: InviteRole, wanted: string[] | null | undefined) {
  const permissions = pagesForRole(role, wanted);
  return role === "responsable"
    ? { role: "agency", marketing_role: null, client_id: null, permissions, title: INVITE_ROLE_LABEL.responsable }
    : { role: "marketing", marketing_role: role, client_id: null, permissions, title: SALES_ROLE_LABEL[role] };
}

/** Compte d'authentification créé par cet appel (et jamais utilisé) : seul cas où l'on peut le supprimer en cas d'échec. */
const createdNow = (u: { created_at?: string; last_sign_in_at?: string | null }) => !u.last_sign_in_at && Date.now() - Date.parse(u.created_at ?? "") < 10 * 60_000;
async function dropAccount(a: Admin, id: string): Promise<boolean> {
  try { const { error } = await a.auth.admin.deleteUser(id); return !error; } catch { return false; }
}
const refusedRedirect = (): InviteProblem => ({ ...explainInviteError(new Error("redirect_to not allowed"), { redirect: redirectTo() }), technical: null });

/**
 * Invite un membre de l'équipe. Toujours le même chemin, quelle que soit la configuration e-mail :
 *   1. lien d'invitation généré par Supabase (generateLink, qui crée le compte sans envoyer d'e-mail) ;
 *   2. fiche posée (rôle, pages, aucun client) ; si elle échoue, le compte tout juste créé est supprimé ;
 *   3. historique ;
 *   4. e-mail envoyé par l'app si elle sait le faire, sinon le lien est remis à l'administrateur.
 * `reuse` : reprendre un compte inactif (sans aucun espace, jamais connecté) qui porte déjà cet e-mail.
 * Ne lève jamais : toute erreur devient un message simple avec quoi faire.
 */
export async function inviteSalesMember(inviter: Session, input: { email: string; name: string; role: InviteRole; permissions?: string[] | null; reuse?: boolean }): Promise<InviteOutcome> {
  const email = String(input.email ?? "").trim().toLowerCase(), name = String(input.name ?? "").trim().slice(0, 120);
  const bad = checkInviteInput({ name, email, role: input.role, pages: input.permissions });
  if (bad) return { status: "erreur", problem: bad };
  const ctx = { redirect: redirectTo() };
  try {
    const a = admin();
    // 0. Un compte porte déjà cet e-mail ?
    const found = await a.from("profiles").select("id, role, client_id, permissions, disabled_at").ilike("email", email.replace(/[\\%_]/g, "\\$&")).limit(1);
    if (found.error) throw found.error;
    const existing = (found.data?.[0] ?? null) as Pick<Row, "id" | "role" | "client_id" | "permissions" | "disabled_at"> | null;
    let reused: string | null = null;
    if (existing) {
      const u = await authUser(a, existing.id);
      const problem = existingAccountProblem({ ...existing, client_id: existing.client_id ?? null, disabled: !!existing.disabled_at, signedIn: u === undefined ? null : !!u?.last_sign_in_at });
      if (!(input.reuse && problem.fix === "reprendre")) return { status: "erreur", problem };
      reused = existing.id;
    }
    // 1. Lien (et compte, s'il n'existe pas). Compte repris : invitation s'il n'a jamais été confirmé, sinon lien de connexion.
    const confirmed = reused ? !!(await authUser(a, reused))?.email_confirmed_at : false;
    const gen = confirmed
      ? await a.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: ctx.redirect } })
      : await a.auth.admin.generateLink({ type: "invite", email, options: { data: { full_name: name, invited_by: inviter.user.id }, redirectTo: ctx.redirect } });
    if (gen.error) return { status: "erreur", problem: explainInviteError(gen.error, ctx) };
    const user = gen.data.user, link = gen.data.properties.action_link;
    const fresh = !reused && createdNow(user);
    if (reused && user.id !== reused) return { status: "erreur", problem: { code: "email_autre_compte", title: "Cet e-mail est déjà utilisé par un autre compte de l'application.", help: "Utilise une autre adresse e-mail pour ce membre." } };
    if (!reused && !fresh) {
      // Compte de connexion antérieur (jamais confirmé) : on ne touche à sa fiche que si elle est vide.
      const { data: prior } = await a.from("profiles").select("id, role, client_id, permissions, disabled_at").eq("id", user.id).maybeSingle();
      const p = prior as Pick<Row, "id" | "role" | "client_id" | "permissions" | "disabled_at"> | null;
      if (p && !(p.role === "client" && !p.client_id && !p.disabled_at)) return { status: "erreur", problem: existingAccountProblem({ ...p, client_id: p.client_id ?? null, disabled: !!p.disabled_at, signedIn: false }) };
    }
    if (redirectRefused(ctx.redirect, gen.data.properties.redirect_to)) {
      if (fresh) await dropAccount(a, user.id);
      return { status: "erreur", problem: refusedRedirect() };
    }
    // 2. La fiche créée à l'inscription est un compte « client » sans espace : on la remplace par celle du membre.
    const values = profileFor(input.role, input.permissions);
    const { error } = await a.from("profiles").upsert({ id: user.id, ...values, display_name: name, email, invited_by: inviter.user.id });
    if (error) {
      const problem = explainInviteError(error, ctx);
      const dropped = fresh && (await dropAccount(a, user.id));
      return { status: "erreur", problem: { ...problem, help: `${problem.help} ${dropped ? "Le compte qui venait d'être créé a été supprimé : rien n'est resté à moitié." : fresh ? "Le compte créé n'a pas pu être supprimé : supprime-le dans Supabase (Authentication › Users) avant de réessayer." : ""}`.trim() } };
    }
    // 3. Historique, puis 4. remise du lien.
    await logTeam(user.id, inviter.user.id, "invitation", { role: input.role, pages: values.permissions, ...(reused ? { repris: true } : {}) });
    return deliver(inviter, { id: user.id, name, email, role: input.role }, link);
  } catch (e) {
    return { status: "erreur", problem: explainInviteError(e, ctx) };
  }
}

/** Membre de l'équipe Marketing (commercial ou responsable), jamais un administrateur ni un compte de Studio. */
const isTeamRow = (r: Pick<Row, "role" | "permissions">) => r.role === "marketing" || (r.role === "agency" && isMarketingOnly(r.permissions));
const roleOf = (r: Pick<Row, "role" | "marketing_role">): InviteRole => (r.role === "agency" ? "responsable" : ROLES.includes(r.marketing_role as SalesRole) ? (r.marketing_role as SalesRole) : "setter");

/** « Renvoyer l'invitation » : nouveau lien pour un membre qui ne s'est jamais connecté (l'ancien lien ne sert plus). */
export async function resendSalesInvite(inviter: Session, id: string): Promise<InviteOutcome> {
  const ctx = { redirect: redirectTo() };
  try {
    const a = admin();
    const { data, error } = await a.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    const row = data as Row | null;
    if (!row || !isTeamRow(row) || !row.email) return { status: "erreur", problem: { code: "inconnu", title: "Ce compte n'est pas un membre de l'équipe Marketing.", help: "Rien à renvoyer ici. Actualise la page." } };
    if (row.disabled_at) return { status: "erreur", problem: { code: "deja_retire", memberId: id, fix: "retablir", title: "Son accès est retiré.", help: "Rétablis d'abord son accès, puis renvoie l'invitation." } };
    const u = await authUser(a, id);
    if (u === undefined) throw new Error("Lecture du compte de connexion impossible.");
    if (!u) return { status: "erreur", problem: { code: "email_connexion", title: "Ce membre n'a plus de compte de connexion.", help: "Retire son accès, puis invite-le de nouveau." } };
    if (u.last_sign_in_at) return { status: "erreur", problem: { code: "deja_membre", memberId: id, fix: "fiche", title: "Cette personne s'est déjà connectée.", help: "Pas besoin de nouvelle invitation : sur la page de connexion, elle utilise son mot de passe, ou « Lien magique » pour recevoir un lien." } };
    const gen = u.email_confirmed_at
      ? await a.auth.admin.generateLink({ type: "magiclink", email: row.email, options: { redirectTo: ctx.redirect } })
      : await a.auth.admin.generateLink({ type: "invite", email: row.email, options: { redirectTo: ctx.redirect } });
    if (gen.error) return { status: "erreur", problem: explainInviteError(gen.error, ctx) };
    if (redirectRefused(ctx.redirect, gen.data.properties.redirect_to)) return { status: "erreur", problem: refusedRedirect() };
    const role = roleOf(row);
    await logTeam(id, inviter.user.id, "invitation", { role, renvoi: true });
    return deliver(inviter, { id, name: row.display_name?.trim() || row.email, email: row.email, role }, gen.data.properties.action_link);
  } catch (e) {
    return { status: "erreur", problem: explainInviteError(e, ctx) };
  }
}

/**
 * Change le rôle ou les pages d'un commercial, ou retire / rétablit l'accès d'un membre de l'équipe (commercial ou responsable).
 * Ne touche jamais un administrateur, un compte de Studio ni un compte d'espace client.
 */
export async function updateSalesMember(id: string, patch: { role?: SalesRole; disabled?: boolean; permissions?: string[] }, actorId: string | null = null): Promise<void> {
  const a = admin();
  const { data } = await a.from("profiles").select("id, role, marketing_role, permissions").eq("id", id).maybeSingle();
  const row = data as { role: string; marketing_role: string | null; permissions: unknown } | null;
  if (!row || !isTeamRow(row)) throw new Error("Ce compte ne fait pas partie de l'équipe Marketing : ses accès ne se règlent pas ici.");
  if (row.role !== "marketing" && (patch.role || patch.permissions)) throw new Error("Un responsable voit tout l'espace Marketing : son rôle et ses pages ne se changent pas ici.");
  const values: Record<string, unknown> = {};
  if (patch.role) {
    if (!ROLES.includes(patch.role)) throw new Error("Rôle inconnu.");
    values.marketing_role = patch.role; values.title = SALES_ROLE_LABEL[patch.role];
    // Changer de rôle remet les pages de ce rôle, sauf si une liste est donnée dans le même geste.
    values.permissions = pagesForRole(patch.role, patch.permissions);
  } else if (patch.permissions != null) {
    values.permissions = assignablePages(patch.permissions);
  }
  // Pages cochées : jamais hors de ce qu'un commercial peut recevoir, et jamais aucune (on retire alors l'accès).
  if (Array.isArray(values.permissions) && values.permissions.length === 0) throw new Error("Garde au moins une page, ou retire l'accès du membre.");
  if (patch.disabled !== undefined) values.disabled_at = patch.disabled ? new Date().toISOString() : null;
  if (!Object.keys(values).length) return;
  const { error } = await a.from("profiles").update(values).eq("id", id);
  if (error) throw new Error(error.message);
  if (patch.role && patch.role !== row.marketing_role) await logTeam(id, actorId, "role", { de: row.marketing_role, vers: patch.role });
  if (values.permissions && JSON.stringify(values.permissions) !== JSON.stringify(row.permissions)) await logTeam(id, actorId, "acces", { pages: values.permissions });
  if (patch.disabled !== undefined) await logTeam(id, actorId, patch.disabled ? "acces_retire" : "acces_retabli");
  // Accès retiré : la base refuse déjà tout (my_has_module), le bannissement empêche en plus toute reconnexion.
  if (patch.disabled !== undefined) await a.auth.admin.updateUserById(id, { ban_duration: patch.disabled ? "876000h" : "none" }).catch(() => undefined);
}
