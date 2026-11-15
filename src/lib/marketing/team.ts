import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, isSupabaseConfigured } from "@/lib/supabase/env";
import { isMailerConfigured, sendEmail } from "@/lib/email/mailer";
import { teamInviteEmail } from "@/lib/email/templates";
import { SALES_ROLE_MODULES, type SalesRole } from "@/lib/permissions";
import type { Session } from "@/lib/data/store";

/**
 * Équipe commerciale de l'espace Marketing. Réservé à l'administrateur (vérifié par l'appelant), exécuté avec
 * la clé service : un compte commercial a le rôle « marketing », jamais « agency », et n'est rattaché à aucun client.
 */
export interface SalesMember { id: string; name: string; email: string | null; kind: "admin" | "agence" | "commercial"; role: SalesRole | null; disabled: boolean; google: "ok" | "invalide" | null; created_at: string }
interface Row { id: string; role: string; display_name: string | null; email: string | null; permissions: unknown; disabled_at: string | null; marketing_role: string | null; created_at: string }
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
      role: ROLES.includes(p.marketing_role as SalesRole) ? (p.marketing_role as SalesRole) : null, disabled: !!p.disabled_at, google: g.get(p.id) ?? null, created_at: p.created_at }));
}

/** Invite un commercial : compte créé avec le rôle « marketing », les modules de son rôle, et aucun client. */
export async function inviteSalesMember(inviter: Session, input: { email: string; name: string; role: SalesRole }): Promise<{ emailed: boolean }> {
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
  const { error } = await a.from("profiles").upsert({ id, role: "marketing", marketing_role: input.role, client_id: null, permissions: SALES_ROLE_MODULES[input.role], display_name: name || email, email, title: SALES_ROLE_LABEL[input.role], invited_by: inviter.user.id });
  if (error) throw new Error(error.message);
  if (!link) return { emailed: true };
  try { await sendEmail({ to: email, ...teamInviteEmail({ name: name || null, inviter: inviter.profile.display_name, link }) }); return { emailed: true }; }
  catch { return { emailed: false }; }
}

/** Change le rôle d'un commercial (ses modules suivent) ou retire / rétablit son accès. Ne touche jamais un compte agence ou client. */
export async function updateSalesMember(id: string, patch: { role?: SalesRole; disabled?: boolean }): Promise<void> {
  const a = admin();
  const { data } = await a.from("profiles").select("id, role").eq("id", id).maybeSingle();
  if (!data || (data as { role: string }).role !== "marketing") throw new Error("Ce compte n'est pas un compte commercial : il se gère dans Studio › Équipe & accès.");
  const values: Record<string, unknown> = {};
  if (patch.role) { if (!ROLES.includes(patch.role)) throw new Error("Rôle inconnu."); values.marketing_role = patch.role; values.permissions = SALES_ROLE_MODULES[patch.role]; values.title = SALES_ROLE_LABEL[patch.role]; }
  if (patch.disabled !== undefined) values.disabled_at = patch.disabled ? new Date().toISOString() : null;
  if (!Object.keys(values).length) return;
  const { error } = await a.from("profiles").update(values).eq("id", id);
  if (error) throw new Error(error.message);
  // Accès retiré : la base refuse déjà tout (my_has_module), le bannissement empêche en plus toute reconnexion.
  if (patch.disabled !== undefined) await a.auth.admin.updateUserById(id, { ban_duration: patch.disabled ? "876000h" : "none" }).catch(() => undefined);
}
