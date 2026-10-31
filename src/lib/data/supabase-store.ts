/**
 * SupabaseStore — implémentation production du DataStore.
 * La RLS Supabase reste l'autorité : chaque requête passe par la session utilisateur.
 * Les transitions métier passent par des RPC atomiques (legacy + v2).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { isMailerConfigured, sendEmail } from "@/lib/email/mailer";
import { clientInviteEmail, magicLinkEmail, teamInviteEmail } from "@/lib/email/templates";
import { hasFullAccess, sanitizePermissions } from "@/lib/permissions";
import { StoreError, type DataStore, type Patch, type Session, type ShellCounts } from "./store";
import type {
  Activity, Avatar, BrainEntry, BrainImport, BrandDossier, BrandDossierData, Brief, BriefConcept, BriefStatus, CalendarEvent, Client, ClientManagement, Contact,
  Document, DocumentFolder, FileAsset, Integration, Invoice, Knowledge, Livrable, LivrableComment, LivrableStatus, ManagementStage, Message, Metric, PipelineStage, Profile, Role,
  Task, TaskStatus, Validation,
} from "./types";
import { AGENCY_ONLY_ACTIVITY, emptyBriefContent, stageKeyFromLabel } from "./types";

const INTEGRATION_COLUMNS = "id,client_id,provider,account_id,account_name,token_expires_at,scopes,connected_by,created_at,updated_at,last_sync_at,last_error";
const publicIntegration = (row: Row): Integration => { const copy = { ...row }; delete copy.access_token; return copy as Integration; };
const withItems = (l: Row): Livrable => ({ ...l, items: Array.isArray(l.items) ? l.items : [] }) as Livrable;

type Row = Record<string, any>;

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, fallback = "Opération impossible."): T {
  if (res.error) throw new StoreError(res.error.message || fallback, res.error.code);
  if (res.data === null || res.data === undefined) throw new StoreError(fallback);
  return res.data;
}
function list<T>(res: { data: T[] | null; error: { message: string; code?: string } | null }): T[] {
  if (res.error) throw new StoreError(res.error.message, res.error.code);
  return res.data ?? [];
}

const clientDefaults = (c: Row): Client => {
  const base = {
    website: null, logo_url: null, segment: "ecommerce", monthly_budget: 0, retainer: 0, performance_fee_pct: 0, health: "bon", tags: [],
    city: null, owner_id: null, archived_at: null, updated_at: c.created_at, sector: null, contact_email: null, current_step: 1, dashboard_url: null, ...c,
  };
  return { ...base, monthly_budget: Number(base.monthly_budget ?? 0), retainer: Number(base.retainer ?? 0), performance_fee_pct: Number(base.performance_fee_pct ?? 0) } as unknown as Client;
};

export class SupabaseStore implements DataStore {
  constructor(private sb: SupabaseClient, public readonly session: Session) {}
  private get isAgency() { return this.session.profile.role === "agency"; }
  private get myClient() { return this.session.profile.client_id; }
  private agencyOnly() { if (!this.isAgency) throw new StoreError("not_an_agency"); }
  private t(name: string) { return this.sb.from(name) as any; }
  private async log(kind: Activity["kind"], summary: string, client_id: string | null = null, entity_id: string | null = null) {
    await this.t("activity_log").insert({ kind, summary, client_id, entity_id, actor_id: this.session.user.id });
  }

  // People
  private withDefaults(p: Row): Profile {
    const row: Row = { disabled_at: null, invited_by: null, email: null, avatar_url: null, title: null, ...p };
    return { ...row, permissions: row.role === "agency" ? sanitizePermissions(row.permissions) : null } as Profile;
  }
  async profiles(): Promise<Profile[]> { return list<Row>(await this.t("profiles").select("*").order("created_at")).map((p) => this.withDefaults(p)); }
  async profile(id: string): Promise<Profile | null> { const { data, error } = await this.t("profiles").select("*").eq("id", id).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data ? this.withDefaults(data) : null; }
  async inviteMember(input: Parameters<DataStore["inviteMember"]>[0]): Promise<Profile> {
    this.agencyOnly();
    const admin = createAdminClient(); if (!admin) throw new StoreError("service_key_missing");
    const email = input.email.trim().toLowerCase();
    if (input.role === "client" && !input.client_id) throw new StoreError("Choisis l'espace client à rattacher.");
    const metadata = { full_name: input.full_name.trim(), role: input.role, client_id: input.role === "client" ? input.client_id : null, invited_by: this.session.user.id };
    const redirectTo = `${APP_URL}/auth/callback`;
    const inviteError = (e: { message: string }) => new StoreError(/already|exists|registered/i.test(e.message) ? "email_taken" : e.message);
    // Avec Resend : Supabase crée le compte et le lien d'invitation sans envoyer d'email, le studio envoie le sien.
    // Sinon : email d'invitation envoyé par Supabase (service par défaut, limité, ou SMTP du projet).
    let id: string; let link: string | null = null;
    if (isMailerConfigured()) {
      const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: metadata, redirectTo } });
      if (error) throw inviteError(error);
      id = data.user.id; link = data.properties.action_link;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: metadata, redirectTo });
      if (error) throw inviteError(error);
      id = data.user.id;
    }
    // Le trigger handle_new_user a créé le profil ; on complète droits, fonction et invitant.
    const patch: Row = { title: input.title ?? null, invited_by: this.session.user.id, display_name: metadata.full_name || email, email };
    if (input.role === "agency") { patch.role = "agency"; patch.permissions = input.permissions ?? null; }
    const row = must<Row>(await (admin.from("profiles") as any).upsert({ id, role: input.role, client_id: input.role === "client" ? input.client_id : null, ...patch }).select("*").single());
    await this.log("note", `${row.display_name} invité${input.role === "client" ? " (compte client)" : " dans l'équipe"}`, row.client_id, row.id);
    if (link) await this.sendAccountEmail(admin, { email, role: input.role, display_name: row.display_name ?? null, client_id: row.client_id ?? null }, link, "invite", true);
    return this.withDefaults(row);
  }
  async updateMemberAccess(id: string, patch: Parameters<DataStore["updateMemberAccess"]>[1]): Promise<Profile> {
    this.agencyOnly();
    if (id === this.session.user.id && (patch.permissions !== undefined || patch.disabled !== undefined)) throw new StoreError("cannot_edit_self");
    const target = await this.profile(id); if (!target) throw new StoreError("target_not_found");
    // Un administrateur à accès complet n'est modifiable que par un autre administrateur à accès complet (la RLS l'impose aussi).
    if (target.role === "agency" && target.permissions === null && !hasFullAccess(this.session.profile)) throw new StoreError("admin_target");
    const values: Row = {};
    if (patch.permissions !== undefined) values.permissions = target.role === "agency" ? patch.permissions : null;
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.client_id !== undefined && target.role === "client") values.client_id = patch.client_id;
    if (patch.disabled !== undefined) values.disabled_at = patch.disabled ? new Date().toISOString() : null;
    if (!Object.keys(values).length) return target;
    const admin = createAdminClient();
    // Avec la clé service : mise à jour directe (le trigger « dernier administrateur » s'applique quand même).
    // Sans : la RLS du compte connecté fait foi (module Équipe, pas d'administrateur touché par un membre limité).
    const db = (admin ?? this.sb).from("profiles") as any;
    const row = must<Row>(await db.update(values).eq("id", id).select("*").single());
    if (patch.disabled !== undefined) {
      // La RLS refuse déjà tout accès à un compte retiré (my_role() devient null) ; le bannissement Auth,
      // quand la clé service est disponible, empêche en plus tout rafraîchissement de session et toute reconnexion.
      if (admin) await admin.auth.admin.updateUserById(id, { ban_duration: patch.disabled ? "876000h" : "none" });
      await this.log("note", `${row.display_name} : accès ${patch.disabled ? "retiré" : "rétabli"}`, row.client_id, row.id);
    }
    if (patch.permissions !== undefined && target.role === "agency") await this.log("note", `${row.display_name} : droits modifiés`, null, row.id);
    return this.withDefaults(row);
  }
  async resendInvite(id: string) {
    this.agencyOnly();
    const admin = createAdminClient(); if (!admin) throw new StoreError("service_key_missing");
    const target = await this.profile(id); if (!target?.email) throw new StoreError("target_not_found");
    if (target.disabled_at) throw new StoreError("account_disabled");
    const { data: found, error: lookupError } = await admin.auth.admin.getUserById(id);
    if (lookupError) throw new StoreError(lookupError.message);
    const redirectTo = `${APP_URL}/auth/callback`;
    const neverConfirmed = !!found.user && !found.user.email_confirmed_at; // invitation jamais acceptée
    if (isMailerConfigured()) {
      // Supabase génère le lien (invitation si jamais acceptée, sinon lien magique) sans envoyer d'email ; le studio envoie le sien.
      const kind = neverConfirmed ? "invite" : "magiclink";
      const { data, error } = await admin.auth.admin.generateLink({ type: kind, email: target.email, options: { redirectTo } });
      if (error) throw new StoreError(error.message);
      await this.sendAccountEmail(admin, { email: target.email, role: target.role, display_name: target.display_name, client_id: target.client_id }, data.properties.action_link, kind);
      await this.log("note", `${target.display_name ?? target.email} : ${neverConfirmed ? "invitation renvoyée" : "lien de connexion renvoyé"}`, target.client_id, target.id);
      return;
    }
    if (neverConfirmed) {
      // Invitation jamais acceptée : GoTrue renvoie l'email d'invitation.
      const { error } = await admin.auth.admin.inviteUserByEmail(target.email, { redirectTo });
      if (error) throw new StoreError(error.message);
      return;
    }
    // Compte déjà actif : lien magique envoyé par Supabase (generateLink ne fait que générer, il n'envoie rien).
    const anon = createBareClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.auth.signInWithOtp({ email: target.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
    if (error) throw new StoreError(error.message);
    await this.log("note", `${target.display_name ?? target.email} : lien de connexion renvoyé`, target.client_id, target.id);
  }
  /**
   * Email d'invitation ou de connexion envoyé par le studio (Resend) avec le lien généré par Supabase.
   * Un échec d'envoi devient une consigne lisible : le compte, lui, existe déjà (« Renvoyer un lien » depuis sa fiche).
   */
  private async sendAccountEmail(admin: SupabaseClient, target: { email: string; role: Role; display_name: string | null; client_id: string | null }, link: string, kind: "invite" | "magiclink", justCreated = false) {
    const inviter = this.session.profile.display_name;
    const clientName = async () => (target.client_id ? ((await (admin.from("clients") as any).select("name").eq("id", target.client_id).maybeSingle()).data?.name ?? null) : null);
    const content = kind === "magiclink"
      ? magicLinkEmail({ name: target.display_name, link, tone: target.role === "agency" ? "tu" : "vous" })
      : target.role === "client"
        ? clientInviteEmail({ name: target.display_name, clientName: await clientName(), inviter, link })
        : teamInviteEmail({ name: target.display_name, inviter, link });
    try {
      await sendEmail({ to: target.email, ...content });
    } catch (err) {
      const reason = err instanceof Error && err.message ? err.message : "envoi impossible.";
      throw new StoreError(justCreated ? `Le compte est créé, mais l'email n'est pas parti : ${reason} Renvoie un lien de connexion depuis sa fiche.` : reason);
    }
  }
  async updateProfile(patch: Patch<Profile>): Promise<Profile> {
    const { display_name, title, avatar_url } = patch;
    const res = await this.t("profiles").update({ display_name, title, avatar_url }).eq("id", this.session.user.id).select("*").maybeSingle();
    if (res.error) throw new StoreError(res.error.message, res.error.code);
    // Aucune ligne modifiée : la base n'a pas (encore) la politique « profiles_update_own » (migration 0002 puis 0004).
    if (!res.data) throw new StoreError("Ton profil n'a pas pu être enregistré : la base n'autorise pas encore la modification des profils. Lance les migrations 0002_studio_v2.sql puis 0004_team.sql dans Supabase.", "PGRST116");
    return res.data as Profile;
  }

  // Clients
  async clients(opts?: { includeArchived?: boolean }): Promise<Client[]> {
    let q = this.t("clients").select("*").order("name");
    if (!opts?.includeArchived) q = q.neq("status", "archived");
    return list<Row>(await q).map(clientDefaults);
  }
  async client(id: string): Promise<Client | null> {
    const { data, error } = await this.t("clients").select("*").eq("id", id).maybeSingle();
    if (error) throw new StoreError(error.message, error.code);
    return data ? clientDefaults(data) : null;
  }
  async createClient(input: Parameters<DataStore["createClient"]>[0]): Promise<Client> {
    this.agencyOnly();
    const slug = input.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) throw new StoreError("Le nom doit contenir au moins une lettre ou un chiffre.");
    const row = must<Row>(await this.t("clients").insert({
      name: input.name.trim(), slug, status: "onboarding", current_step: 1, sector: input.sector ?? null, contact_email: input.contact_email ?? null,
      segment: input.segment ?? "ecommerce", website: input.website ?? null, monthly_budget: input.monthly_budget ?? 0, retainer: input.retainer ?? 0,
      performance_fee_pct: input.performance_fee_pct ?? 0, city: input.city ?? null, owner_id: this.session.user.id,
    }).select("*").single());
    await this.log("client.stage", `${row.name} créé · onboarding`, row.id);
    return clientDefaults(row);
  }
  async updateClient(id: string, patch: Patch<Client>): Promise<Client> {
    this.agencyOnly();
    return clientDefaults(must(await this.t("clients").update(patch).eq("id", id).select("*").single()));
  }
  async archiveClient(id: string, archived: boolean): Promise<Client> {
    this.agencyOnly();
    const row = must<Row>(await this.t("clients").update({ status: archived ? "archived" : "active", archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("*").single());
    await this.log("client.stage", `${row.name} ${archived ? "archivé" : "restauré"}`, row.id);
    return clientDefaults(row);
  }
  async management(): Promise<ClientManagement[]> { this.agencyOnly(); return list(await this.t("agency_client_management").select("*")); }
  async saveManagement(clientId: string, stage: ManagementStage, notes: string, revision: number): Promise<ClientManagement> {
    this.agencyOnly();
    const { data, error } = await this.sb.rpc("agency_save_client_management", { p_client_id: clientId, p_stage: stage, p_notes: notes, p_expected_revision: revision });
    if (error) throw new StoreError(error.message, error.code);
    return (Array.isArray(data) ? data[0] : data) as ClientManagement;
  }
  async deleteClient(id: string) {
    this.adminOnly();
    const { data, error } = await this.sb.rpc("agency_delete_client", { p_client_id: id });
    if (error) throw new StoreError(error.message, error.code);
    const paths = (Array.isArray(data) ? data : []) as string[];
    if (paths.length) await this.sb.storage.from("studio").remove(paths);
  }
  private adminOnly() { this.agencyOnly(); if (!hasFullAccess(this.session.profile)) throw new StoreError("admin_only"); }

  // Étapes du pipeline
  async stages(): Promise<PipelineStage[]> { return list(await this.t("pipeline_stages").select("*").order("position")); }
  async saveStage(input: Parameters<DataStore["saveStage"]>[0]): Promise<PipelineStage> {
    this.agencyOnly();
    const label = input.label.trim(); if (!label) throw new StoreError("bad_stage");
    if (input.key) return must(await this.t("pipeline_stages").update({ label, ...(input.color ? { color: input.color } : {}) }).eq("key", input.key).select("*").single());
    const { count } = await this.t("pipeline_stages").select("key", { count: "exact", head: true });
    return must(await this.t("pipeline_stages").insert({ key: stageKeyFromLabel(label), label, color: input.color ?? "neutral", position: count ?? 0 }).select("*").single());
  }
  async reorderStages(keys: string[]) { this.agencyOnly(); await Promise.all(keys.map((k, i) => this.t("pipeline_stages").update({ position: i }).eq("key", k))); }
  async deleteStage(key: string, replacement: string) {
    this.agencyOnly();
    const { error } = await this.sb.rpc("agency_delete_stage", { p_key: key, p_replacement: replacement });
    if (error) throw new StoreError(error.message, error.code);
  }
  async contacts(clientId: string): Promise<Contact[]> { return list(await this.t("contacts").select("*").eq("client_id", clientId).order("is_primary", { ascending: false })); }
  async upsertContact(input: Parameters<DataStore["upsertContact"]>[0]): Promise<Contact> {
    this.agencyOnly();
    return must(await this.t("contacts").upsert(input).select("*").single());
  }
  async deleteContact(id: string) { this.agencyOnly(); must(await this.t("contacts").delete().eq("id", id).select("id")); }

  // Briefs
  async briefs(opts?: { clientId?: string; month?: string; includeArchived?: boolean }): Promise<Brief[]> {
    let q = this.t("briefs").select("*").order("position", { ascending: true, nullsFirst: false }).order("created_at");
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.month) q = q.gte("month", `${opts.month.slice(0, 7)}-01`).lte("month", `${opts.month.slice(0, 7)}-31`);
    if (!opts?.includeArchived) q = q.neq("status", "archived");
    return list(await q);
  }
  async brief(id: string): Promise<Brief | null> { const { data, error } = await this.t("briefs").select("*").eq("id", id).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data; }
  async createBrief(input: Parameters<DataStore["createBrief"]>[0]): Promise<Brief> {
    this.agencyOnly();
    const content = emptyBriefContent(input.kind);
    const row = must<Brief>(await this.t("briefs").insert({ client_id: input.client_id, month: input.month.length === 7 ? `${input.month}-01` : input.month, kind: input.kind, title: input.title.trim(), status: "redaction", source: "agence", content, assignee_id: this.session.user.id }).select("*").single());
    await this.t("brief_concepts").insert({ brief_id: row.id, title: "Concept 1", position: 0, content });
    await this.log("brief.created", `Nouveau brief : ${row.title}`, row.client_id, row.id);
    return row;
  }
  async updateBrief(id: string, patch: Patch<Brief>): Promise<Brief> {
    this.agencyOnly();
    const current = await this.brief(id); if (!current) throw new StoreError("brief_not_found");
    const values: Row = { ...patch };
    if (patch.content !== undefined && JSON.stringify(patch.content) !== JSON.stringify(current.content) && !["redaction", "archived"].includes(current.status)) {
      Object.assign(values, { status: "redaction", validated_by: null, validated_at: null });
    }
    return must(await this.t("briefs").update(values).eq("id", id).select("*").single());
  }
  async transitionBrief(id: string, next: BriefStatus): Promise<Brief> {
    this.agencyOnly();
    if (next === "archived") {
      const row = must<Brief>(await this.t("briefs").update({ status: "archived" }).eq("id", id).select("*").single());
      await this.log("brief.status", `${row.title} → corbeille`, row.client_id, row.id); return row;
    }
    const { data, error } = await this.sb.rpc("agency_transition_brief", { p_brief_id: id, p_next: next });
    if (error) throw new StoreError(error.message, error.code);
    return (Array.isArray(data) ? data[0] : data) as Brief;
  }
  async clientDecideScript(id: string, decision: "valide" | "correction", comment: string | null = null): Promise<Brief> {
    const { error } = await this.sb.rpc("client_decide_script", { p_brief_id: id, p_decision: decision, p_comment: comment });
    if (error) throw new StoreError(error.message, error.code);
    const fresh = await this.brief(id); if (!fresh) throw new StoreError("brief_not_found");
    return fresh;
  }
  async reorderBriefs(ids: string[]) {
    this.agencyOnly();
    await Promise.all(ids.map((id, i) => this.t("briefs").update({ position: i + 1 }).eq("id", id)));
  }

  // Concepts d'un brief
  async concepts(briefId: string): Promise<BriefConcept[]> { return list(await this.t("brief_concepts").select("*").eq("brief_id", briefId).order("position")); }
  async conceptCounts(briefIds: string[]): Promise<Record<string, number>> {
    if (!briefIds.length) return {};
    const rows = list<{ brief_id: string }>(await this.t("brief_concepts").select("brief_id").in("brief_id", briefIds));
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.brief_id] = (counts[r.brief_id] ?? 0) + 1;
    return counts;
  }
  async createConcept(briefId: string, input?: { title?: string; content?: Record<string, unknown> }): Promise<BriefConcept> {
    this.agencyOnly();
    const b = await this.brief(briefId); if (!b) throw new StoreError("brief_not_found");
    const { count } = await this.t("brief_concepts").select("id", { count: "exact", head: true }).eq("brief_id", briefId);
    const n = count ?? 0;
    return must(await this.t("brief_concepts").insert({ brief_id: briefId, title: input?.title?.trim() || `Concept ${n + 1}`, position: n, content: input?.content ?? emptyBriefContent(b.kind) }).select("*").single());
  }
  async updateConcept(id: string, patch: { title?: string; content?: Record<string, unknown> }): Promise<BriefConcept> {
    this.agencyOnly();
    const values: Row = {};
    if (patch.title !== undefined && patch.title.trim()) values.title = patch.title.trim();
    if (patch.content !== undefined) values.content = patch.content;
    const row = must<BriefConcept>(await this.t("brief_concepts").update(values).eq("id", id).select("*").single());
    if (patch.content !== undefined) {
      // Toute modification d'un brief soumis le remet en rédaction (règle legacy).
      const b = await this.brief(row.brief_id);
      if (b && b.status !== "redaction" && b.status !== "archived") await this.t("briefs").update({ status: "redaction", validated_by: null, validated_at: null }).eq("id", b.id);
    }
    return row;
  }
  async reorderConcepts(briefId: string, ids: string[]) { this.agencyOnly(); await Promise.all(ids.map((id, i) => this.t("brief_concepts").update({ position: i }).eq("id", id).eq("brief_id", briefId))); }
  async deleteConcept(id: string) {
    this.agencyOnly();
    const { data: c } = await this.t("brief_concepts").select("brief_id").eq("id", id).maybeSingle();
    if (!c) return;
    const { count } = await this.t("brief_concepts").select("id", { count: "exact", head: true }).eq("brief_id", c.brief_id);
    if ((count ?? 0) <= 1) throw new StoreError("last_concept");
    must(await this.t("brief_concepts").delete().eq("id", id).select("id"));
  }

  // Livrables
  async livrables(opts?: { clientId?: string; month?: string }): Promise<Livrable[]> {
    let q = this.t("livrables").select("*").order("created_at", { ascending: false });
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.month) q = q.gte("month", `${opts.month.slice(0, 7)}-01`).lte("month", `${opts.month.slice(0, 7)}-31`);
    return list<Row>(await q).map(withItems);
  }
  async livrable(id: string): Promise<Livrable | null> { const { data, error } = await this.t("livrables").select("*").eq("id", id).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data ? withItems(data) : null; }
  async createLivrable(input: Parameters<DataStore["createLivrable"]>[0]): Promise<Livrable> {
    this.agencyOnly();
    const row = must<Row>(await this.t("livrables").insert({ client_id: input.client_id, month: input.month.length === 7 ? `${input.month}-01` : input.month, kind: input.kind, title: input.title.trim(), file_url: input.file_url ?? null, duration_sec: input.duration_sec ?? null, brief_id: input.brief_id ?? null, status: "en_controle", items: input.items ?? [] }).select("*").single());
    await this.log("livrable.created", `Batch ajouté : ${row.title}`, row.client_id, row.id);
    return withItems(row);
  }
  async updateLivrable(id: string, patch: Patch<Livrable>): Promise<Livrable> { this.agencyOnly(); return withItems(must<Row>(await this.t("livrables").update(patch).eq("id", id).select("*").single())); }
  async transitionLivrable(id: string, next: LivrableStatus, comment: string | null = null): Promise<Livrable> {
    const { data, error } = await this.sb.rpc("transition_livrable", { p_livrable_id: id, p_next: next, p_comment: comment });
    if (error) throw new StoreError(error.message, error.code);
    const row = withItems((Array.isArray(data) ? data[0] : data) as Row);
    if (comment) await this.addLivrableComment(id, comment);
    return row;
  }
  async livrableComments(livrableId: string): Promise<LivrableComment[]> { return list(await this.t("livrable_comments").select("*").eq("livrable_id", livrableId).order("created_at")); }
  async addLivrableComment(livrableId: string, body: string): Promise<LivrableComment> {
    return must(await this.t("livrable_comments").insert({ livrable_id: livrableId, body: body.trim(), author: this.session.user.id }).select("*").single());
  }
  async validations(clientId?: string): Promise<Validation[]> {
    let q = this.t("validations").select("*").order("created_at", { ascending: false }).limit(500);
    if (clientId) q = q.eq("client_id", clientId);
    return list(await q);
  }

  // Avatars
  async avatars(clientId: string): Promise<Avatar[]> { return list(await this.t("avatars").select("*").eq("client_id", clientId).order("created_at")); }
  async createAvatar(input: Parameters<DataStore["createAvatar"]>[0]): Promise<Avatar> { this.agencyOnly(); return must(await this.t("avatars").insert({ ...input, chosen: false }).select("*").single()); }
  async toggleAvatar(id: string): Promise<Avatar> {
    const { data: a } = await this.t("avatars").select("*").eq("id", id).single();
    if (!a) throw new StoreError("Avatar introuvable.");
    return must(await this.t("avatars").update({ chosen: !a.chosen }).eq("id", id).eq("chosen", a.chosen).select("*").single());
  }
  async deleteAvatar(id: string) { this.agencyOnly(); must(await this.t("avatars").delete().eq("id", id).select("id")); }

  // Brain client
  async brandDossier(clientId: string): Promise<BrandDossier | null> { const { data, error } = await this.t("brand_dossiers").select("*").eq("client_id", clientId).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data ? { ...data, data: data.data && typeof data.data === "object" ? data.data : {} } : null; }
  async saveBrandDossier(clientId: string, data: BrandDossierData): Promise<BrandDossier> {
    return must(await this.t("brand_dossiers").upsert({ client_id: clientId, data, updated_at: new Date().toISOString(), updated_by: this.session.user.id }).select("*").single());
  }
  async brainEntries(clientId: string): Promise<BrainEntry[]> {
    this.agencyOnly();
    return list(await this.t("brain_entries").select("*").eq("client_id", clientId).order("position", { ascending: true, nullsFirst: false }).order("created_at").limit(1000));
  }
  async createBrainEntry(input: Parameters<DataStore["createBrainEntry"]>[0]): Promise<BrainEntry> {
    this.agencyOnly();
    const { origin, import_id, position, ...rest } = input;
    return must(await this.t("brain_entries").insert({ ...rest, source_url: input.source_url ?? null, origin: origin ?? "manuel", import_id: import_id ?? null, position: position ?? null, created_by: this.session.user.id }).select("*").single());
  }
  async updateBrainEntry(id: string, patch: Patch<BrainEntry>): Promise<BrainEntry> {
    this.agencyOnly();
    const { section, title, content, source_url, kind, position } = patch;
    return must(await this.t("brain_entries").update({ section, title, content, source_url, kind, position }).eq("id", id).select("*").single());
  }
  async deleteBrainEntry(id: string) { this.agencyOnly(); must(await this.t("brain_entries").delete().eq("id", id).select("id")); }

  // Brain agence
  async knowledge(): Promise<Knowledge[]> { this.agencyOnly(); return list(await this.t("knowledge").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false })); }
  async createKnowledge(input: Parameters<DataStore["createKnowledge"]>[0]): Promise<Knowledge> { this.agencyOnly(); return must(await this.t("knowledge").insert({ ...input, author_id: this.session.user.id }).select("*").single()); }
  async updateKnowledge(id: string, patch: Patch<Knowledge>): Promise<Knowledge> { this.agencyOnly(); return must(await this.t("knowledge").update(patch).eq("id", id).select("*").single()); }
  async deleteKnowledge(id: string) { this.agencyOnly(); must(await this.t("knowledge").delete().eq("id", id).select("id")); }

  // Tâches
  async tasks(opts?: { clientId?: string; assigneeId?: string }): Promise<Task[]> {
    this.agencyOnly();
    let q = this.t("tasks").select("*").order("position");
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.assigneeId) q = q.eq("assignee_id", opts.assigneeId);
    return list(await q);
  }
  async createTask(input: Parameters<DataStore["createTask"]>[0]): Promise<Task> {
    this.agencyOnly();
    const { count } = await this.t("tasks").select("id", { count: "exact", head: true }).eq("status", input.status ?? "a_faire");
    return must(await this.t("tasks").insert({ ...input, status: input.status ?? "a_faire", position: count ?? 0, created_by: this.session.user.id }).select("*").single());
  }
  async updateTask(id: string, patch: Patch<Task>): Promise<Task> {
    this.agencyOnly();
    const row = must<Task>(await this.t("tasks").update(patch).eq("id", id).select("*").single());
    if (patch.status === "termine") await this.log("task.done", `${row.title} terminée`, row.client_id, row.id);
    return row;
  }
  async moveTask(id: string, status: TaskStatus, position: number): Promise<Task> {
    this.agencyOnly();
    const column = list<Task>(await this.t("tasks").select("*").eq("status", status).neq("id", id).order("position"));
    const moving = must<Task>(await this.t("tasks").select("*").eq("id", id).single());
    column.splice(Math.max(0, Math.min(position, column.length)), 0, { ...moving, status });
    await Promise.all(column.map((t, i) => this.t("tasks").update({ position: i, status }).eq("id", t.id)));
    if (status === "termine" && moving.status !== "termine") await this.log("task.done", `${moving.title} terminée`, moving.client_id, moving.id);
    return { ...moving, status, position };
  }
  async deleteTask(id: string) { this.agencyOnly(); must(await this.t("tasks").delete().eq("id", id).select("id")); }

  // Documents
  async documents(opts?: { clientId?: string | null; includeArchived?: boolean }): Promise<Document[]> {
    let q = this.t("documents").select("*").order("updated_at", { ascending: false });
    if (opts?.clientId === null) q = q.is("client_id", null); else if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (!opts?.includeArchived) q = q.is("archived_at", null);
    return list(await q);
  }
  async document(id: string): Promise<Document | null> { const { data, error } = await this.t("documents").select("*").eq("id", id).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data; }
  async createDocument(input: Parameters<DataStore["createDocument"]>[0]): Promise<Document> { this.agencyOnly(); return must(await this.t("documents").insert({ ...input, author_id: this.session.user.id }).select("*").single()); }
  async updateDocument(id: string, patch: Patch<Document>): Promise<Document> {
    this.agencyOnly();
    const row = must<Document>(await this.t("documents").update(patch).eq("id", id).select("*").single());
    if (patch.shared_with_client && row.client_id) await this.log("doc.shared", `${row.title} partagé avec le client`, row.client_id, row.id);
    return row;
  }
  async archiveDocument(id: string, archived: boolean): Promise<Document> { this.agencyOnly(); return must(await this.t("documents").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("*").single()); }

  // Bibliothèque : dossiers
  async folders(): Promise<DocumentFolder[]> { this.agencyOnly(); return list(await this.t("document_folders").select("*").order("position").order("name")); }
  async createFolder(input: Parameters<DataStore["createFolder"]>[0]): Promise<DocumentFolder> {
    this.agencyOnly();
    const name = input.name.trim(); if (!name) throw new StoreError("Indique un nom de dossier.");
    const parent = input.parent_id ?? null;
    let q = this.t("document_folders").select("id", { count: "exact", head: true });
    q = parent ? q.eq("parent_id", parent) : q.is("parent_id", null);
    const { count } = await q;
    return must(await this.t("document_folders").insert({ name, parent_id: parent, client_id: input.client_id ?? null, position: count ?? 0, created_by: this.session.user.id }).select("*").single());
  }
  async updateFolder(id: string, patch: Parameters<DataStore["updateFolder"]>[1]): Promise<DocumentFolder> {
    this.agencyOnly();
    if (patch.parent_id) {
      let p: string | null = patch.parent_id; const seen = new Set<string>();
      while (p) {
        if (p === id) throw new StoreError("Un dossier ne peut pas être déplacé dans lui-même.");
        if (seen.has(p)) break; seen.add(p);
        const res: { data: { parent_id: string | null } | null } = await this.t("document_folders").select("parent_id").eq("id", p).maybeSingle();
        p = res.data?.parent_id ?? null;
      }
    }
    const values: Row = {};
    if (patch.name !== undefined) { const name = patch.name.trim(); if (!name) throw new StoreError("Indique un nom de dossier."); values.name = name; }
    if (patch.parent_id !== undefined) values.parent_id = patch.parent_id;
    if (patch.position !== undefined) values.position = patch.position;
    return must(await this.t("document_folders").update(values).eq("id", id).select("*").single());
  }
  async deleteFolder(id: string) { this.agencyOnly(); must(await this.t("document_folders").delete().eq("id", id).select("id")); }

  // Fichiers
  async files(opts?: { clientId?: string | null; folder?: string }): Promise<FileAsset[]> {
    let q = this.t("files").select("*").order("created_at", { ascending: false });
    if (opts?.clientId === null) q = q.is("client_id", null); else if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.folder) q = q.eq("folder", opts.folder);
    return list(await q);
  }
  async registerFile(input: Parameters<DataStore["registerFile"]>[0]): Promise<FileAsset> {
    const row = must<FileAsset>(await this.t("files").insert({ ...input, uploaded_by: this.session.user.id }).select("*").single());
    await this.log("file.uploaded", `${row.name} déposé`, row.client_id, row.id);
    return row;
  }
  async updateFile(id: string, patch: Patch<FileAsset>): Promise<FileAsset> { this.agencyOnly(); return must(await this.t("files").update(patch).eq("id", id).select("*").single()); }
  async deleteFile(id: string) {
    this.agencyOnly();
    const { data } = await this.t("files").select("path").eq("id", id).maybeSingle();
    if (data?.path) await this.sb.storage.from("studio").remove([data.path]);
    must(await this.t("files").delete().eq("id", id).select("id"));
  }
  async fileUrl(path: string): Promise<string | null> {
    const { data } = await this.sb.storage.from("studio").createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }

  // Facturation
  async invoices(opts?: { clientId?: string }): Promise<Invoice[]> {
    let q = this.t("invoices").select("*").order("issue_date", { ascending: false });
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    return list<Row>(await q).map((i) => ({ ...i, lines: i.lines ?? [] })) as Invoice[];
  }
  async invoice(id: string): Promise<Invoice | null> { const { data, error } = await this.t("invoices").select("*").eq("id", id).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data ? { ...data, lines: data.lines ?? [] } : null; }
  async createInvoice(input: Parameters<DataStore["createInvoice"]>[0]): Promise<Invoice> {
    this.agencyOnly();
    const { data: number, error } = await this.sb.rpc("next_invoice_number", { p_type: input.type });
    if (error) throw new StoreError(error.message, error.code);
    return must(await this.t("invoices").insert({ ...input, number, lines: input.lines ?? [], created_by: this.session.user.id }).select("*").single());
  }
  async updateInvoice(id: string, patch: Patch<Invoice>): Promise<Invoice> {
    this.agencyOnly();
    const values: Row = { ...patch };
    if (patch.status === "payee") values.paid_at = new Date().toISOString();
    const row = must<Invoice>(await this.t("invoices").update(values).eq("id", id).select("*").single());
    if (patch.status === "envoyee") await this.log("invoice.sent", `${row.number} envoyée`, row.client_id, row.id);
    if (patch.status === "payee") await this.log("invoice.paid", `${row.number} payée`, row.client_id, row.id);
    return row;
  }
  async deleteInvoice(id: string) { this.agencyOnly(); must(await this.t("invoices").delete().eq("id", id).select("id")); }

  // Messages, activité, planning, métriques
  async messages(clientId: string, limit = 200): Promise<Message[]> {
    const rows = list<Message>(await this.t("messages").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(limit));
    return rows.reverse();
  }
  async sendMessage(clientId: string, body: string): Promise<Message> {
    const row = must<Message>(await this.t("messages").insert({ client_id: clientId, body: body.trim(), author_id: this.session.user.id }).select("*").single());
    await this.log("message", `Nouveau message de ${this.session.profile.display_name ?? "un utilisateur"}`, clientId, row.id);
    return row;
  }
  async shellCounts(): Promise<ShellCounts> {
    const today = new Date().toISOString().slice(0, 10);
    // Une requête HEAD sur une table absente revient sans corps ni erreur (count null) : dans ce cas
    // on relit en GET pour obtenir le vrai code (table manquante → écran d'installation).
    const count = async (name: string, q: PromiseLike<{ count: number | null; error: { message: string; code?: string } | null }>) => {
      const { count: n, error } = await q;
      if (error) throw new StoreError(error.message, error.code);
      if (n === null) {
        const probe = await this.t(name).select("id").limit(1);
        if (probe.error) throw new StoreError(probe.error.message, probe.error.code);
        return 0;
      }
      return n;
    };
    const head = (name: string) => this.t(name).select("id", { count: "exact", head: true });
    if (!this.isAgency) {
      const [briefs, livrables] = await Promise.all([
        count("briefs", head("briefs").eq("status", "attente_client").eq("kind", "video")),
        count("livrables", head("livrables").eq("status", "attente_client")),
      ]);
      return { briefs: 0, livrables: 0, taches: 0, factures: 0, validations: briefs + livrables };
    }
    const [briefs, livrables, taches, factures] = await Promise.all([
      count("briefs", head("briefs").eq("status", "attente_ibra")),
      count("livrables", head("livrables").in("status", ["en_controle", "correction"])),
      count("tasks", head("tasks").neq("status", "termine").lte("due_date", today)),
      count("invoices", head("invoices").eq("status", "en_retard")),
    ]);
    return { briefs, livrables, taches, factures, validations: 0 };
  }
  async activity(opts?: { clientId?: string; actorId?: string; limit?: number }): Promise<Activity[]> {
    let q = this.t("activity_log").select("*").order("created_at", { ascending: false }).limit(opts?.limit ?? 50);
    // Événements internes à l'agence : filtrés ici et par la RLS (0006) pour un compte client.
    if (this.session.profile.role !== "agency") q = q.not("kind", "in", `(${AGENCY_ONLY_ACTIVITY.join(",")})`);
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.actorId) q = q.eq("actor_id", opts.actorId);
    return list(await q);
  }
  async logActivity(input: Parameters<DataStore["logActivity"]>[0]) { await this.log(input.kind, input.summary, input.client_id ?? null, input.entity_id ?? null); }
  async events(opts?: { from?: string; to?: string; clientId?: string }): Promise<CalendarEvent[]> {
    let q = this.t("calendar_events").select("*").order("starts_at");
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.from) q = q.gte("starts_at", opts.from);
    if (opts?.to) q = q.lte("starts_at", opts.to);
    return list(await q);
  }
  async createEvent(input: Parameters<DataStore["createEvent"]>[0]): Promise<CalendarEvent> { this.agencyOnly(); return must(await this.t("calendar_events").insert({ ...input, created_by: this.session.user.id }).select("*").single()); }
  async deleteEvent(id: string) { this.agencyOnly(); must(await this.t("calendar_events").delete().eq("id", id).select("id")); }
  async metrics(opts?: { clientId?: string; from?: string; to?: string }): Promise<Metric[]> {
    let q = this.t("metrics").select("*").order("period_start");
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.from) q = q.gte("period_start", opts.from);
    if (opts?.to) q = q.lte("period_start", opts.to);
    return list<Row>(await q).map((m) => ({ ...m, spend: Number(m.spend), revenue: Number(m.revenue), impressions: Number(m.impressions), clicks: Number(m.clicks), thruplays_3s: Number(m.thruplays_3s), purchases: Number(m.purchases) })) as Metric[];
  }
  async upsertMetric(input: Omit<Metric, "id">): Promise<Metric> {
    this.agencyOnly();
    if (input.livrable_id === null) {
      // Deux NULL sont distincts pour la contrainte unique : la ligne « compte entier » de la semaine est retrouvée à la main,
      // sinon chaque saisie ou synchronisation Meta ajouterait un doublon au lieu de remplacer.
      const found = await this.t("metrics").select("id").eq("client_id", input.client_id).eq("period_start", input.period_start).is("livrable_id", null).limit(1).maybeSingle();
      if (found.error) throw new StoreError(found.error.message, found.error.code); // ne jamais retomber sur insert et créer un doublon
      if (found.data?.id) return must(await this.t("metrics").update(input).eq("id", found.data.id).select("*").single());
      return must(await this.t("metrics").insert(input).select("*").single());
    }
    return must(await this.t("metrics").upsert(input, { onConflict: "client_id,livrable_id,period_start" }).select("*").single());
  }

  // Intégrations (administrateurs) — la RLS n'ouvre la table qu'à l'accès complet ; le jeton ne sort jamais d'ici.
  async integrations(clientId?: string): Promise<Integration[]> {
    this.adminOnly();
    let q = this.t("integrations").select(INTEGRATION_COLUMNS).order("created_at");
    if (clientId) q = q.eq("client_id", clientId);
    return list<Row>(await q).map(publicIntegration);
  }
  async saveIntegration(input: Parameters<DataStore["saveIntegration"]>[0]): Promise<Integration> {
    this.adminOnly();
    const row = must<Row>(await this.t("integrations").upsert({ client_id: input.client_id, provider: input.provider, account_id: input.account_id, account_name: input.account_name ?? null, access_token: input.access_token, token_expires_at: input.token_expires_at ?? null, scopes: input.scopes ?? [], connected_by: this.session.user.id, last_error: null }, { onConflict: "client_id,provider" }).select("*").single());
    return publicIntegration(row);
  }
  async integrationToken(id: string): Promise<string | null> { this.adminOnly(); const { data } = await this.t("integrations").select("access_token").eq("id", id).maybeSingle(); return data?.access_token ?? null; }
  async updateIntegration(id: string, patch: Parameters<DataStore["updateIntegration"]>[1]): Promise<Integration> { this.adminOnly(); return publicIntegration(must<Row>(await this.t("integrations").update(patch).eq("id", id).select("*").single())); }
  async deleteIntegration(id: string) { this.adminOnly(); must(await this.t("integrations").delete().eq("id", id).select("id")); }

  // Imports Brain
  async brainImports(clientId: string): Promise<BrainImport[]> { return list(await this.t("brain_imports").select("*").eq("client_id", clientId).order("created_at", { ascending: false })); }
  async createBrainImport(input: Parameters<DataStore["createBrainImport"]>[0]): Promise<BrainImport> { this.agencyOnly(); return must(await this.t("brain_imports").insert({ ...input, pages_lues: input.pages_lues ?? null, created_by: this.session.user.id }).select("*").single()); }
  async updateBrainImport(id: string, patch: Parameters<DataStore["updateBrainImport"]>[1]): Promise<BrainImport> { this.agencyOnly(); return must(await this.t("brain_imports").update(patch).eq("id", id).select("*").single()); }
}
