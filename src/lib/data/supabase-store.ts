/**
 * SupabaseStore — implémentation production du DataStore.
 * La RLS Supabase reste l'autorité : chaque requête passe par la session utilisateur.
 * Les transitions métier passent par des RPC atomiques (legacy + v2).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/supabase/env";
import { StoreError, type DataStore, type Patch, type Session } from "./store";
import type {
  Activity, Avatar, BrainEntry, BrandDossier, BrandDossierData, Brief, BriefStatus, CalendarEvent, Client, ClientManagement, Contact,
  Document, FileAsset, Invoice, Knowledge, Livrable, LivrableComment, LivrableStatus, ManagementStage, Message, Metric, Profile,
  Task, TaskStatus, Validation,
} from "./types";

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
    city: null, owner_id: null, archived_at: null, updated_at: c.created_at, sector: null, contact_email: null, current_step: 1, ...c,
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
  private withDefaults(p: Row): Profile { return { permissions: null, disabled_at: null, invited_by: null, email: null, avatar_url: null, title: null, ...p } as Profile; }
  async profiles(): Promise<Profile[]> { return list<Row>(await this.t("profiles").select("*").order("created_at")).map((p) => this.withDefaults(p)); }
  async profile(id: string): Promise<Profile | null> { const { data, error } = await this.t("profiles").select("*").eq("id", id).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data ? this.withDefaults(data) : null; }
  async inviteMember(input: Parameters<DataStore["inviteMember"]>[0]): Promise<Profile> {
    this.agencyOnly();
    const admin = createAdminClient(); if (!admin) throw new StoreError("service_key_missing");
    const email = input.email.trim().toLowerCase();
    if (input.role === "client" && !input.client_id) throw new StoreError("Choisis l'espace client à rattacher.");
    const metadata = { full_name: input.full_name.trim(), role: input.role, client_id: input.role === "client" ? input.client_id : null, invited_by: this.session.user.id };
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: metadata, redirectTo: `${APP_URL}/auth/callback` });
    if (error) throw new StoreError(/already|exists|registered/i.test(error.message) ? "email_taken" : error.message);
    const id = data.user.id;
    // Le trigger handle_new_user a créé le profil ; on complète droits, fonction et invitant.
    const patch: Row = { title: input.title ?? null, invited_by: this.session.user.id, display_name: metadata.full_name || email, email };
    if (input.role === "agency") { patch.role = "agency"; patch.permissions = input.permissions ?? null; }
    const row = must<Row>(await (admin.from("profiles") as any).upsert({ id, role: input.role, client_id: input.role === "client" ? input.client_id : null, ...patch }).select("*").single());
    await this.log("note", `${row.display_name} invité${input.role === "client" ? " (compte client)" : " dans l'équipe"}`, row.client_id, row.id);
    return this.withDefaults(row);
  }
  async updateMemberAccess(id: string, patch: Parameters<DataStore["updateMemberAccess"]>[1]): Promise<Profile> {
    this.agencyOnly();
    if (id === this.session.user.id && (patch.permissions !== undefined || patch.disabled !== undefined)) throw new StoreError("cannot_edit_self");
    const target = await this.profile(id); if (!target) throw new StoreError("Compte introuvable.");
    const values: Row = {};
    if (patch.permissions !== undefined) values.permissions = target.role === "agency" ? patch.permissions : null;
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.client_id !== undefined && target.role === "client") values.client_id = patch.client_id;
    if (patch.disabled !== undefined) values.disabled_at = patch.disabled ? new Date().toISOString() : null;
    const admin = createAdminClient();
    const db = (admin ?? this.sb).from("profiles") as any;
    const row = must<Row>(await db.update(values).eq("id", id).select("*").single());
    if (patch.disabled !== undefined && admin) {
      // Bannir / débannir le compte Auth pour couper aussi les sessions existantes.
      await admin.auth.admin.updateUserById(id, { ban_duration: patch.disabled ? "876000h" : "none" });
      await this.log("note", `${row.display_name} : accès ${patch.disabled ? "retiré" : "rétabli"}`, row.client_id, row.id);
    }
    return this.withDefaults(row);
  }
  async resendInvite(id: string) {
    this.agencyOnly();
    const admin = createAdminClient(); if (!admin) throw new StoreError("service_key_missing");
    const target = await this.profile(id); if (!target?.email) throw new StoreError("Compte introuvable.");
    const { error } = await admin.auth.admin.generateLink({ type: "magiclink", email: target.email, options: { redirectTo: `${APP_URL}/auth/callback` } });
    if (error) throw new StoreError(error.message);
  }
  async updateProfile(patch: Patch<Profile>): Promise<Profile> {
    const { display_name, title, avatar_url } = patch;
    return must(await this.t("profiles").update({ display_name, title, avatar_url }).eq("id", this.session.user.id).select("*").single());
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
    const content = input.kind === "video" ? { concept: "", transcription: { hooks: [""], corps: "", ctas: [""] }, acting: "" } : { reference: "", angle: "", overlay: "" };
    const row = must<Brief>(await this.t("briefs").insert({ client_id: input.client_id, month: input.month.length === 7 ? `${input.month}-01` : input.month, kind: input.kind, title: input.title.trim(), status: "redaction", source: "agence", content, assignee_id: this.session.user.id }).select("*").single());
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

  // Livrables
  async livrables(opts?: { clientId?: string; month?: string }): Promise<Livrable[]> {
    let q = this.t("livrables").select("*").order("created_at", { ascending: false });
    if (opts?.clientId) q = q.eq("client_id", opts.clientId);
    if (opts?.month) q = q.gte("month", `${opts.month.slice(0, 7)}-01`).lte("month", `${opts.month.slice(0, 7)}-31`);
    return list(await q);
  }
  async livrable(id: string): Promise<Livrable | null> { const { data, error } = await this.t("livrables").select("*").eq("id", id).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data; }
  async createLivrable(input: Parameters<DataStore["createLivrable"]>[0]): Promise<Livrable> {
    this.agencyOnly();
    const row = must<Livrable>(await this.t("livrables").insert({ client_id: input.client_id, month: input.month.length === 7 ? `${input.month}-01` : input.month, kind: input.kind, title: input.title.trim(), file_url: input.file_url ?? null, duration_sec: input.duration_sec ?? null, brief_id: input.brief_id ?? null, status: "en_controle" }).select("*").single());
    await this.log("livrable.created", `Livrable ajouté : ${row.title}`, row.client_id, row.id);
    return row;
  }
  async updateLivrable(id: string, patch: Patch<Livrable>): Promise<Livrable> { this.agencyOnly(); return must(await this.t("livrables").update(patch).eq("id", id).select("*").single()); }
  async transitionLivrable(id: string, next: LivrableStatus, comment: string | null = null): Promise<Livrable> {
    const { data, error } = await this.sb.rpc("transition_livrable", { p_livrable_id: id, p_next: next, p_comment: comment });
    if (error) throw new StoreError(error.message, error.code);
    const row = (Array.isArray(data) ? data[0] : data) as Livrable;
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
  async brandDossier(clientId: string): Promise<BrandDossier | null> { const { data, error } = await this.t("brand_dossiers").select("*").eq("client_id", clientId).maybeSingle(); if (error) throw new StoreError(error.message, error.code); return data; }
  async saveBrandDossier(clientId: string, data: BrandDossierData): Promise<BrandDossier> {
    return must(await this.t("brand_dossiers").upsert({ client_id: clientId, data, updated_at: new Date().toISOString(), updated_by: this.session.user.id }).select("*").single());
  }
  async brainEntries(clientId: string): Promise<BrainEntry[]> {
    this.agencyOnly();
    return list(await this.t("brain_entries").select("*").eq("client_id", clientId).order("position", { ascending: true, nullsFirst: false }).order("created_at").limit(1000));
  }
  async createBrainEntry(input: Parameters<DataStore["createBrainEntry"]>[0]): Promise<BrainEntry> {
    this.agencyOnly();
    return must(await this.t("brain_entries").insert({ ...input, source_url: input.source_url ?? null, origin: "manuel", created_by: this.session.user.id }).select("*").single());
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
  async activity(opts?: { clientId?: string; actorId?: string; limit?: number }): Promise<Activity[]> {
    let q = this.t("activity_log").select("*").order("created_at", { ascending: false }).limit(opts?.limit ?? 50);
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
  async upsertMetric(input: Omit<Metric, "id">): Promise<Metric> { this.agencyOnly(); return must(await this.t("metrics").upsert(input, { onConflict: "client_id,livrable_id,period_start" }).select("*").single()); }
}
