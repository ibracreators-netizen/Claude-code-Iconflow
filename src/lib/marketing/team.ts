import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, isSupabaseConfigured } from "@/lib/supabase/env";
import { isMailerConfigured, sendEmail } from "@/lib/email/mailer";
import { teamInviteEmail } from "@/lib/email/templates";
import { SALES_ASSIGNABLE_MODULES, SALES_ROLE_MODULES, type SalesRole } from "@/lib/permissions";
import type { TeamLogEntry } from "./types";
import type { Session } from "@/lib/data/store";

/**
 * Équipe commerciale de l'espace Marketing. Réservé à l'administrateur (vérifié par l'appelant), exécuté avec
 * la clé service : un compte commercial a le rôle « marketing », jamais « agency », et n'est rattaché à aucun client.
 */
export interface SalesMember { id: string; name: string; email: string | null; kind: "admin" | "agence" | "commercial"; role: SalesRole | null; disabled: boolean; google: "ok" | "invalide" | null; created_at: string; permissions: string[]; avatar: string | null }
interface Row { id: string; role: string; display_name: string | null; email: string | null; permissions: unknown; disabled_at: string | null; marketing_role: string | null; created_at: string; avatar_url?: string | null }
const ROLES: SalesRole[] = ["setter", "closer", "media_buyer"];
export const SALES_ROLE_LABEL: Record<SalesRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer" };

function admin() { const a = createAdminClient(); if (!a) throw new Error("La variable SUPABASE_SERVICE_ROLE_KEY n'est pas lue sur l'hébergeur."); return a; }

export async function salesTeam(): Promise<SalesMember[]> {
  if (!isSupabaseConfigured()) return [];
  const a = admin();
  const [{ data, error }, google] = await Promise.all([
    a.from("profiles").select("*").in("role", ["agency", "marketing"]).order("created_at"),
    a.from("marketing_google_accounts").select("profile_id, status"),
  ]);
  if (error) throw new Error(error.message);
  const g = new Map(((google.data ?? []) as Array<{ profile_id: string; status: "ok" | "invalide" }>).map((r) => [r.profile_id, r.status]));
  return ((data ?? []) as Row[])
    .filter((p) => p.role === "marketing" || p.permissions == null || (Array.isArray(p.permissions) && p.permissions.some((m) => String(m).startsWith("marketing_"))))
    .map((p) => ({ id: p.id, name: p.display_name?.trim() || p.email || "Membre", email: p.email, kind: p.role === "marketing" ? "commercial" : p.permissions == null ? "admin" : "agence",
      role: ROLES.includes(p.marketing_role as SalesRole) ? (p.marketing_role as SalesRole) : null, disabled: !!p.disabled_at, google: g.get(p.id) ?? null, created_at: p.created_at,
      permissions: Array.isArray(p.permissions) ? p.permissions.map(String).filter((m) => m.startsWith("marketing_")) : [], avatar: p.avatar_url ?? null }));
}

/** Invite un commercial : compte créé avec le rôle « marketing », les modules de son rôle, et aucun client. */
/** Pages accordées : seulement celles qu'un compte commercial peut recevoir ; liste vide ou absente → celles de son rôle. */
const pagesFor = (role: SalesRole, wanted?: string[] | null): string[] => { const kept = SALES_ASSIGNABLE_MODULES.filter((m) => (wanted ?? []).includes(m)); return kept.length ? kept : SALES_ROLE_MODULES[role]; };
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

export async function inviteSalesMember(inviter: Session, input: { email: string; name: string; role: SalesRole; permissions?: string[] }): Promise<{ emailed: boolean }> {
  const a = admin();
  const email = input.email.trim().toLowerCase(), name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new Error("Cet email n'est pas valide.");
  if (!ROLES.includes(input.role)) throw new Error("Rôle inconnu.");
  const existing = await a.from("profiles").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (existing.data) throw new Error("Un compte existe déjà avec cet email.");
  const metadata = { full_name: name, role: "marketing", invited_by: inviter.user.id };
  const redirectTo = `${APP_URL}/auth/callback`;
  const taken = (e: { message: string }) => new Error(/already|exists|registered/i.test(e.message) ? "Un compte existe déjà avec cet email." : e.message);
  let id: string, link: string | null = null;
  if (isMailerConfigured()) {
    const { data, error } = await a.auth.admin.generateLink({ type: "invite", email, options: { data: metadata, redirectTo } });
    if (error) throw taken(error);
    id = data.user.id; link = data.properties.action_link;
  } else {
    const { data, error } = await a.auth.admin.inviteUserByEmail(email, { data: metadata, redirectTo });
    if (error) throw taken(error);
    id = data.user.id;
  }
  // Le profil créé à l'inscription est un compte « client » sans espace : on le remplace par le compte commercial.
  const permissions = pagesFor(input.role, input.permissions);
  const { error } = await a.from("profiles").upsert({ id, role: "marketing", marketing_role: input.role, client_id: null, permissions, display_name: name || email, email, title: SALES_ROLE_LABEL[input.role], invited_by: inviter.user.id });
  if (error) throw new Error(error.message);
  await logTeam(id, inviter.user.id, "invitation", { role: input.role, pages: permissions });
  if (!link) return { emailed: true };
  try { await sendEmail({ to: email, ...teamInviteEmail({ name: name || null, inviter: inviter.profile.display_name, link }) }); return { emailed: true }; }
  catch { return { emailed: false }; }
}

/** Change le rôle ou les pages d'un commercial, ou retire / rétablit son accès. Ne touche jamais un compte agence ou client. */
export async function updateSalesMember(id: string, patch: { role?: SalesRole; disabled?: boolean; permissions?: string[] }, actorId: string | null = null): Promise<void> {
  const a = admin();
  const { data } = await a.from("profiles").select("id, role, marketing_role, permissions").eq("id", id).maybeSingle();
  const row = data as { role: string; marketing_role: string | null; permissions: unknown } | null;
  if (!row || row.role !== "marketing") throw new Error("Ce compte n'est pas un compte commercial : il se gère dans Studio › Équipe & accès.");
  const values: Record<string, unknown> = {};
  if (patch.role) {
    if (!ROLES.includes(patch.role)) throw new Error("Rôle inconnu.");
    values.marketing_role = patch.role; values.title = SALES_ROLE_LABEL[patch.role];
    // Changer de rôle remet les pages de ce rôle, sauf si une liste est donnée dans le même geste.
    values.permissions = pagesFor(patch.role, patch.permissions);
  } else if (patch.permissions) {
    const role = (ROLES.includes(row.marketing_role as SalesRole) ? row.marketing_role : "setter") as SalesRole;
    const kept = SALES_ASSIGNABLE_MODULES.filter((m) => patch.permissions!.includes(m));
    if (!kept.length) throw new Error("Garde au moins une page, ou retire l'accès du membre.");
    void role; values.permissions = kept;
  }
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
