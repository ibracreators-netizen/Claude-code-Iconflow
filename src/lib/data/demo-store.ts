/**
 * DemoStore — implémentation en mémoire du DataStore.
 * Persisté dans globalThis le temps du processus (dev/preview). Reset au redémarrage.
 */
import { uid } from "@/lib/utils";
import * as seed from "./demo-data";
import { StoreError, type DataStore, type Patch, type Session, type ShellCounts } from "./store";
import type {
  Activity, Avatar, BrainEntry, BrandDossier, BrandDossierData, Brief, BriefStatus, CalendarEvent, Client, ClientManagement, Contact,
  Document, FileAsset, Invoice, Knowledge, Livrable, LivrableComment, LivrableStatus, ManagementStage, Message, Metric, Profile,
  Task, TaskStatus, Validation,
} from "./types";
import {
  briefTransition, allowedLivrableTransition, MANAGEMENT_STAGE, BRIEF_STATUS, LIVRABLE_STATUS,
} from "./types";

interface DB {
  profiles: Profile[]; clients: Client[]; management: ClientManagement[]; contacts: Contact[]; briefs: Brief[];
  livrables: Livrable[]; comments: LivrableComment[]; validations: Validation[]; avatars: Avatar[]; dossiers: BrandDossier[];
  brainEntries: BrainEntry[]; knowledge: Knowledge[]; tasks: Task[]; documents: Document[]; files: FileAsset[];
  invoices: Invoice[]; messages: Message[]; activity: Activity[]; events: CalendarEvent[]; metrics: Metric[]; invoiceSeq: number;
}

const g = globalThis as unknown as { __iconflowDemoDb?: DB };
function db(): DB {
  if (!g.__iconflowDemoDb) {
    g.__iconflowDemoDb = {
      profiles: structuredClone(seed.demoProfiles), clients: structuredClone(seed.demoClients), management: structuredClone(seed.demoManagement),
      contacts: structuredClone(seed.demoContacts), briefs: structuredClone(seed.demoBriefs), livrables: structuredClone(seed.demoLivrables),
      comments: structuredClone(seed.demoComments), validations: structuredClone(seed.demoValidations), avatars: structuredClone(seed.demoAvatars),
      dossiers: structuredClone(seed.demoDossiers), brainEntries: structuredClone(seed.demoBrainEntries), knowledge: structuredClone(seed.demoKnowledge),
      tasks: structuredClone(seed.demoTasks), documents: structuredClone(seed.demoDocuments), files: structuredClone(seed.demoFiles),
      invoices: structuredClone(seed.demoInvoices), messages: structuredClone(seed.demoMessages), activity: structuredClone(seed.demoActivity),
      events: structuredClone(seed.demoEvents), metrics: structuredClone(seed.demoMetrics), invoiceSeq: 45,
    };
  }
  return g.__iconflowDemoDb;
}

export function resetDemoDb() { g.__iconflowDemoDb = undefined; }

const now = () => new Date().toISOString();
const byDateDesc = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);

export function demoSession(persona: string): Session | null {
  // Lit le profil dans la base démo vivante (et non la graine) pour refléter nom, fonction, photo et droits.
  // persona : "agency" | "client" | "member:<id>" (aperçu du studio avec les droits d'un membre).
  const id = persona === "agency" ? seed.DEMO_IDS.ibra : persona === "client" ? seed.DEMO_IDS.clientUser : persona.startsWith("member:") ? persona.slice(7) : null;
  if (!id) return null;
  const profile = db().profiles.find((p) => p.id === id);
  if (!profile || profile.disabled_at) return null;
  return { user: { id: profile.id, email: profile.email ?? "" }, profile, demo: true };
}

export class DemoStore implements DataStore {
  constructor(public readonly session: Session) {}
  private get isAgency() { return this.session.profile.role === "agency"; }
  private get myClient() { return this.session.profile.client_id; }
  private agencyOnly() { if (!this.isAgency) throw new StoreError("not_an_agency"); }
  private scope(clientId: string | null | undefined) {
    if (!this.isAgency && clientId !== this.myClient) throw new StoreError("wrong_client");
  }
  private visible<T extends { client_id: string | null }>(rows: T[], clientId?: string | null) {
    const base = this.isAgency ? rows : rows.filter((r) => r.client_id === this.myClient);
    return clientId === undefined ? base : base.filter((r) => r.client_id === clientId);
  }
  private async log(kind: Activity["kind"], summary: string, client_id: string | null = null, entity_id: string | null = null) {
    db().activity.unshift({ id: uid("ac"), kind, actor_id: this.session.user.id, client_id, entity_id, summary, created_at: now() });
  }

  // People
  async profiles() { return this.isAgency ? db().profiles : db().profiles.filter((p) => p.id === this.session.user.id); }
  async profile(id: string) { const p = db().profiles.find((x) => x.id === id) ?? null; if (!p) return null; if (!this.isAgency && p.id !== this.session.user.id) return null; return p; }
  async inviteMember(input: Parameters<DataStore["inviteMember"]>[0]) {
    this.agencyOnly();
    const email = input.email.trim().toLowerCase();
    if (db().profiles.some((p) => p.email?.toLowerCase() === email)) throw new StoreError("email_taken");
    if (input.role === "client" && !input.client_id) throw new StoreError("Choisis l'espace client à rattacher.");
    const p: Profile = { id: uid("usr"), role: input.role, client_id: input.role === "client" ? input.client_id ?? null : null, display_name: input.full_name.trim() || email, email, avatar_url: null, title: input.title ?? null, permissions: input.role === "agency" ? input.permissions ?? null : null, disabled_at: null, invited_by: this.session.user.id, created_at: now() };
    db().profiles.push(p);
    await this.log("note", `${p.display_name} invité${input.role === "client" ? " (compte client)" : " dans l'équipe"}`, p.client_id, p.id);
    return p;
  }
  async updateMemberAccess(id: string, patch: Parameters<DataStore["updateMemberAccess"]>[1]) {
    this.agencyOnly();
    if (id === this.session.user.id && (patch.permissions !== undefined || patch.disabled !== undefined)) throw new StoreError("cannot_edit_self");
    const p = db().profiles.find((x) => x.id === id); if (!p) throw new StoreError("target_not_found");
    if (p.role === "agency" && p.permissions === null && this.session.profile.permissions !== null) throw new StoreError("admin_target");
    // Il reste toujours un administrateur à accès complet actif (même règle que le trigger SQL).
    const demotes = p.role === "agency" && p.permissions === null && !p.disabled_at && (patch.disabled === true || (patch.permissions !== undefined && patch.permissions !== null));
    if (demotes && !db().profiles.some((x) => x.id !== p.id && x.role === "agency" && x.permissions === null && !x.disabled_at)) throw new StoreError("last_admin");
    if (patch.permissions !== undefined) { p.permissions = p.role === "agency" ? patch.permissions : null; if (p.role === "agency") await this.log("note", `${p.display_name} : droits modifiés`, null, p.id); }
    if (patch.title !== undefined) p.title = patch.title;
    if (patch.client_id !== undefined && p.role === "client") p.client_id = patch.client_id;
    if (patch.disabled !== undefined) { p.disabled_at = patch.disabled ? now() : null; await this.log("note", `${p.display_name} : accès ${patch.disabled ? "retiré" : "rétabli"}`, p.client_id, p.id); }
    return p;
  }
  async resendInvite(id: string) {
    this.agencyOnly();
    const p = db().profiles.find((x) => x.id === id); if (!p) throw new StoreError("target_not_found");
    if (p.disabled_at) throw new StoreError("account_disabled");
    await this.log("note", `${p.display_name} : lien de connexion renvoyé`, p.client_id, p.id);
  }
  async updateProfile(patch: Patch<Profile>) {
    const p = db().profiles.find((x) => x.id === this.session.user.id)!;
    Object.assign(p, { display_name: patch.display_name ?? p.display_name, title: patch.title !== undefined ? patch.title : p.title, avatar_url: patch.avatar_url !== undefined ? patch.avatar_url : p.avatar_url });
    return p;
  }

  // Clients
  async clients(opts?: { includeArchived?: boolean }) {
    const rows = this.isAgency ? db().clients : db().clients.filter((c) => c.id === this.myClient);
    return rows.filter((c) => opts?.includeArchived || c.status !== "archived").sort((a, b) => a.name.localeCompare(b.name));
  }
  async client(id: string) { this.scope(id); return db().clients.find((c) => c.id === id) ?? null; }
  async createClient(input: Parameters<DataStore["createClient"]>[0]) {
    this.agencyOnly();
    const slug = input.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) throw new StoreError("Le nom doit contenir au moins une lettre ou un chiffre.");
    if (db().clients.some((c) => c.slug === slug)) throw new StoreError("23505");
    const c: Client = {
      id: uid("cl"), name: input.name.trim(), slug, status: "onboarding", current_step: 1, sector: input.sector ?? null, contact_email: input.contact_email ?? null,
      created_at: now(), website: input.website ?? null, logo_url: null, segment: input.segment ?? "ecommerce", monthly_budget: input.monthly_budget ?? 0,
      retainer: input.retainer ?? 0, performance_fee_pct: input.performance_fee_pct ?? 0, health: "bon", tags: [], city: input.city ?? null,
      owner_id: this.session.user.id, archived_at: null, updated_at: now(),
    };
    db().clients.push(c);
    db().management.push({ client_id: c.id, stage: "onboarding", notes: "", revision: 0, updated_at: now(), updated_by: this.session.user.id });
    await this.log("client.stage", `${c.name} créé · onboarding`, c.id);
    return c;
  }
  async updateClient(id: string, patch: Patch<Client>) {
    this.agencyOnly();
    const c = db().clients.find((x) => x.id === id); if (!c) throw new StoreError("client_not_available");
    Object.assign(c, patch, { updated_at: now() }); return c;
  }
  async archiveClient(id: string, archived: boolean) {
    this.agencyOnly();
    const c = db().clients.find((x) => x.id === id); if (!c) throw new StoreError("client_not_available");
    c.status = archived ? "archived" : "active"; c.archived_at = archived ? now() : null; c.updated_at = now();
    await this.log("client.stage", `${c.name} ${archived ? "archivé" : "restauré"}`, c.id);
    return c;
  }
  async management() { this.agencyOnly(); return db().management; }
  async saveManagement(clientId: string, stage: ManagementStage, notes: string, revision: number) {
    this.agencyOnly();
    if (notes.length > 20000) throw new StoreError("bad_notes");
    let m = db().management.find((x) => x.client_id === clientId);
    if (!m) { m = { client_id: clientId, stage: "onboarding", notes: "", revision: 0, updated_at: now(), updated_by: null }; db().management.push(m); }
    if (m.revision !== revision) throw new StoreError("stale_revision");
    const changedStage = m.stage !== stage;
    Object.assign(m, { stage, notes, revision: m.revision + 1, updated_at: now(), updated_by: this.session.user.id });
    if (changedStage) await this.log("client.stage", `${db().clients.find((c) => c.id === clientId)?.name} → ${MANAGEMENT_STAGE[stage]}`, clientId);
    return m;
  }
  async contacts(clientId: string) { this.scope(clientId); return db().contacts.filter((c) => c.client_id === clientId); }
  async upsertContact(input: Parameters<DataStore["upsertContact"]>[0]) {
    this.agencyOnly();
    if ("id" in input && input.id) { const c = db().contacts.find((x) => x.id === input.id)!; Object.assign(c, input); return c; }
    const c: Contact = { id: uid("ct"), created_at: now(), ...(input as Omit<Contact, "id" | "created_at">) };
    db().contacts.push(c); return c;
  }
  async deleteContact(id: string) { this.agencyOnly(); db().contacts = db().contacts.filter((c) => c.id !== id); }

  // Briefs
  async briefs(opts?: { clientId?: string; month?: string; includeArchived?: boolean }) {
    let rows = this.visible(db().briefs, opts?.clientId);
    if (!this.isAgency) rows = rows.filter((b) => b.status !== "redaction");
    if (opts?.month) rows = rows.filter((b) => b.month.startsWith(opts.month!));
    if (!opts?.includeArchived) rows = rows.filter((b) => b.status !== "archived");
    return rows.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.created_at.localeCompare(b.created_at));
  }
  async brief(id: string) {
    const b = db().briefs.find((x) => x.id === id); if (!b) return null;
    this.scope(b.client_id); if (!this.isAgency && b.status === "redaction") return null; return b;
  }
  async createBrief(input: Parameters<DataStore["createBrief"]>[0]) {
    this.agencyOnly();
    const content = input.kind === "video"
      ? { concept: "", transcription: { hooks: [""], corps: "", ctas: [""] }, acting: "" }
      : { reference: "", angle: "", overlay: "" };
    const siblings = db().briefs.filter((b) => b.client_id === input.client_id && b.month === input.month && b.kind === input.kind);
    const b: Brief = {
      id: uid("b"), client_id: input.client_id, month: input.month.length === 7 ? `${input.month}-01` : input.month, kind: input.kind, title: input.title.trim(),
      status: "redaction", content, source: "agence", validated_by: null, validated_at: null, created_at: now(), script_version: 1,
      submitted_content: null, position: siblings.length + 1, assignee_id: this.session.user.id, due_date: null, updated_at: now(),
    };
    db().briefs.push(b);
    await this.log("brief.created", `Nouveau brief : ${b.title}`, b.client_id, b.id);
    return b;
  }
  async updateBrief(id: string, patch: Patch<Brief>) {
    this.agencyOnly();
    const b = db().briefs.find((x) => x.id === id); if (!b) throw new StoreError("brief_not_found");
    const contentChanged = patch.content !== undefined && JSON.stringify(patch.content) !== JSON.stringify(b.content);
    Object.assign(b, patch, { updated_at: now() });
    // Toute modification de contenu d'un brief soumis le remet en rédaction (règle legacy).
    if (contentChanged && b.status !== "redaction" && b.status !== "archived") { b.status = "redaction"; b.validated_by = null; b.validated_at = null; }
    return b;
  }
  async transitionBrief(id: string, next: BriefStatus) {
    this.agencyOnly();
    const b = db().briefs.find((x) => x.id === id); if (!b) throw new StoreError("brief_not_found");
    if (next === "archived") { b.status = "archived"; await this.log("brief.status", `${b.title} → corbeille`, b.client_id, b.id); return b; }
    if (next === "redaction") { b.status = "redaction"; b.validated_by = null; b.validated_at = null; return b; }
    const expected = briefTransition("agency", b);
    if (expected !== next) throw new StoreError(`wrong_state:${b.status}`);
    if (next !== "attente_ibra") {
      db().validations.push({ id: uid("v"), client_id: b.client_id, item_kind: "script", brief_id: b.id, item_ref: `script-v${b.script_version}`, decision: "valide", comment: null, decided_by: this.session.user.id, created_at: now() });
      b.validated_by = this.session.user.id; b.validated_at = now();
    }
    b.status = next; b.updated_at = now();
    await this.log("brief.status", `${b.title} → ${BRIEF_STATUS[next]}`, b.client_id, b.id);
    return b;
  }
  async clientDecideScript(id: string, decision: "valide" | "correction", comment: string | null = null) {
    if (this.isAgency) throw new StoreError("not_a_client");
    const b = db().briefs.find((x) => x.id === id); if (!b) throw new StoreError("brief_not_found");
    if (b.client_id !== this.myClient) throw new StoreError("wrong_client");
    if (b.kind === "statique") throw new StoreError("static_brief_ibra_only");
    if (b.status !== "attente_client") throw new StoreError(`wrong_state:${b.status}`);
    const ref = `script-v${b.script_version}`;
    if (db().validations.some((v) => v.brief_id === b.id && v.item_ref === ref && v.decided_by === this.session.user.id)) throw new StoreError("already_decided");
    db().validations.push({ id: uid("v"), client_id: b.client_id, item_kind: "script", brief_id: b.id, item_ref: ref, decision, comment, decided_by: this.session.user.id, created_at: now() });
    if (decision === "valide") { b.status = "valide"; b.validated_by = this.session.user.id; b.validated_at = now(); }
    else { b.status = "redaction"; b.validated_by = null; b.validated_at = null; b.script_version += 1; }
    await this.log("validation", `${b.title} : ${decision === "valide" ? "validé par le client" : "correction demandée"}`, b.client_id, b.id);
    return b;
  }
  async reorderBriefs(ids: string[]) { this.agencyOnly(); ids.forEach((id, i) => { const b = db().briefs.find((x) => x.id === id); if (b) b.position = i + 1; }); }

  // Livrables
  async livrables(opts?: { clientId?: string; month?: string }) {
    let rows = this.visible(db().livrables, opts?.clientId);
    if (opts?.month) rows = rows.filter((l) => l.month.startsWith(opts.month!));
    return rows.sort(byDateDesc);
  }
  async livrable(id: string) { const l = db().livrables.find((x) => x.id === id); if (!l) return null; this.scope(l.client_id); return l; }
  async createLivrable(input: Parameters<DataStore["createLivrable"]>[0]) {
    this.agencyOnly();
    const l: Livrable = { id: uid("l"), client_id: input.client_id, month: input.month.length === 7 ? `${input.month}-01` : input.month, kind: input.kind, title: input.title.trim(), file_url: input.file_url ?? null, duration_sec: input.duration_sec ?? null, status: "en_controle", created_at: now(), brief_id: input.brief_id ?? null, thumbnail_url: null, storage_path: null, updated_at: now() };
    db().livrables.unshift(l);
    await this.log("livrable.created", `Livrable ajouté : ${l.title}`, l.client_id, l.id);
    return l;
  }
  async updateLivrable(id: string, patch: Patch<Livrable>) { this.agencyOnly(); const l = db().livrables.find((x) => x.id === id); if (!l) throw new StoreError("livrable_not_found"); Object.assign(l, patch, { updated_at: now() }); return l; }
  async transitionLivrable(id: string, next: LivrableStatus, comment: string | null = null) {
    const l = db().livrables.find((x) => x.id === id); if (!l) throw new StoreError("livrable_not_found");
    this.scope(l.client_id);
    if (!allowedLivrableTransition(this.session.profile.role, l, next)) throw new StoreError(`wrong_state:${l.status}`);
    if (!this.isAgency) db().validations.push({ id: uid("v"), client_id: l.client_id, item_kind: l.kind === "rush" ? "rushs" : "crea", brief_id: null, item_ref: l.id, decision: next, comment, decided_by: this.session.user.id, created_at: now() });
    if (comment) db().comments.push({ id: uid("lc"), livrable_id: l.id, author: this.session.user.id, body: comment, created_at: now() });
    l.status = next; l.updated_at = now();
    await this.log(this.isAgency ? "livrable.status" : "validation", `${l.title} → ${LIVRABLE_STATUS[next]}`, l.client_id, l.id);
    return l;
  }
  async livrableComments(livrableId: string) { const l = await this.livrable(livrableId); if (!l) return []; return db().comments.filter((c) => c.livrable_id === livrableId).sort((a, b) => a.created_at.localeCompare(b.created_at)); }
  async addLivrableComment(livrableId: string, body: string) {
    const l = await this.livrable(livrableId); if (!l) throw new StoreError("livrable_not_found");
    const c: LivrableComment = { id: uid("lc"), livrable_id: livrableId, author: this.session.user.id, body: body.trim(), created_at: now() };
    db().comments.push(c); return c;
  }
  async validations(clientId?: string) { return this.visible(db().validations, clientId).sort(byDateDesc); }

  // Avatars
  async avatars(clientId: string) { this.scope(clientId); return db().avatars.filter((a) => a.client_id === clientId); }
  async createAvatar(input: Parameters<DataStore["createAvatar"]>[0]) { this.agencyOnly(); const a: Avatar = { id: uid("a"), client_id: input.client_id, name: input.name, preview_url: input.preview_url ?? null, chosen: false, created_at: now() }; db().avatars.push(a); return a; }
  async toggleAvatar(id: string) { const a = db().avatars.find((x) => x.id === id); if (!a) throw new StoreError("Avatar introuvable."); this.scope(a.client_id); a.chosen = !a.chosen; return a; }
  async deleteAvatar(id: string) { this.agencyOnly(); db().avatars = db().avatars.filter((a) => a.id !== id); }

  // Brain client
  async brandDossier(clientId: string) { this.scope(clientId); return db().dossiers.find((d) => d.client_id === clientId) ?? null; }
  async saveBrandDossier(clientId: string, data: BrandDossierData) {
    this.scope(clientId);
    let d = db().dossiers.find((x) => x.client_id === clientId);
    if (!d) { d = { client_id: clientId, data, updated_at: now(), updated_by: this.session.user.id }; db().dossiers.push(d); }
    else Object.assign(d, { data, updated_at: now(), updated_by: this.session.user.id });
    return d;
  }
  async brainEntries(clientId: string) { this.agencyOnly(); return db().brainEntries.filter((e) => e.client_id === clientId).sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.created_at.localeCompare(b.created_at)); }
  async createBrainEntry(input: Parameters<DataStore["createBrainEntry"]>[0]) {
    this.agencyOnly();
    const e: BrainEntry = { id: uid("be"), client_id: input.client_id, section: input.section, kind: input.kind, title: input.title, content: input.content, source_url: input.source_url ?? null, origin: "manuel", import_id: null, position: null, created_at: now(), created_by: this.session.user.id };
    db().brainEntries.push(e); return e;
  }
  async updateBrainEntry(id: string, patch: Patch<BrainEntry>) { this.agencyOnly(); const e = db().brainEntries.find((x) => x.id === id); if (!e) throw new StoreError("Fiche introuvable."); Object.assign(e, patch); return e; }
  async deleteBrainEntry(id: string) { this.agencyOnly(); db().brainEntries = db().brainEntries.filter((e) => e.id !== id); }

  // Brain agence
  async knowledge() { this.agencyOnly(); return [...db().knowledge].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)); }
  async createKnowledge(input: Parameters<DataStore["createKnowledge"]>[0]) {
    this.agencyOnly();
    const k: Knowledge = { id: uid("k"), title: input.title, category: input.category, body: input.body, tags: input.tags ?? [], segment: input.segment ?? "tous", score: input.score ?? null, uses: 0, pinned: input.pinned ?? false, author_id: this.session.user.id, created_at: now(), updated_at: now() };
    db().knowledge.unshift(k); return k;
  }
  async updateKnowledge(id: string, patch: Patch<Knowledge>) { this.agencyOnly(); const k = db().knowledge.find((x) => x.id === id); if (!k) throw new StoreError("Fiche introuvable."); Object.assign(k, patch, { updated_at: now() }); return k; }
  async deleteKnowledge(id: string) { this.agencyOnly(); db().knowledge = db().knowledge.filter((k) => k.id !== id); }

  // Tâches
  async tasks(opts?: { clientId?: string; assigneeId?: string }) {
    this.agencyOnly();
    return db().tasks.filter((t) => (!opts?.clientId || t.client_id === opts.clientId) && (!opts?.assigneeId || t.assignee_id === opts.assigneeId)).sort((a, b) => a.position - b.position);
  }
  async createTask(input: Parameters<DataStore["createTask"]>[0]) {
    this.agencyOnly();
    const status = input.status ?? "a_faire";
    const t: Task = { id: uid("t"), title: input.title.trim(), description: input.description ?? null, status, priority: input.priority ?? "normale", assignee_id: input.assignee_id ?? null, client_id: input.client_id ?? null, brief_id: input.brief_id ?? null, livrable_id: input.livrable_id ?? null, due_date: input.due_date ?? null, position: db().tasks.filter((x) => x.status === status).length, labels: input.labels ?? [], created_by: this.session.user.id, created_at: now(), updated_at: now() };
    db().tasks.push(t); return t;
  }
  async updateTask(id: string, patch: Patch<Task>) {
    this.agencyOnly();
    const t = db().tasks.find((x) => x.id === id); if (!t) throw new StoreError("Tâche introuvable.");
    const done = patch.status === "termine" && t.status !== "termine";
    Object.assign(t, patch, { updated_at: now() });
    if (done) await this.log("task.done", `${t.title} terminée`, t.client_id, t.id);
    return t;
  }
  async moveTask(id: string, status: TaskStatus, position: number) {
    this.agencyOnly();
    const t = db().tasks.find((x) => x.id === id); if (!t) throw new StoreError("Tâche introuvable.");
    const done = status === "termine" && t.status !== "termine";
    const column = db().tasks.filter((x) => x.status === status && x.id !== id).sort((a, b) => a.position - b.position);
    column.splice(Math.max(0, Math.min(position, column.length)), 0, t);
    column.forEach((x, i) => { x.position = i; });
    t.status = status; t.updated_at = now();
    if (done) await this.log("task.done", `${t.title} terminée`, t.client_id, t.id);
    return t;
  }
  async deleteTask(id: string) { this.agencyOnly(); db().tasks = db().tasks.filter((t) => t.id !== id); }

  // Documents
  async documents(opts?: { clientId?: string | null; includeArchived?: boolean }) {
    let rows = this.isAgency ? db().documents : db().documents.filter((d) => d.client_id === this.myClient && d.shared_with_client);
    if (opts?.clientId !== undefined) rows = rows.filter((d) => d.client_id === opts.clientId);
    if (!opts?.includeArchived) rows = rows.filter((d) => !d.archived_at);
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async document(id: string) {
    const d = db().documents.find((x) => x.id === id); if (!d) return null;
    if (!this.isAgency && (d.client_id !== this.myClient || !d.shared_with_client || d.archived_at)) return null; return d;
  }
  async createDocument(input: Parameters<DataStore["createDocument"]>[0]) {
    this.agencyOnly();
    const d: Document = { id: uid("d"), title: input.title ?? "Sans titre", icon: input.icon ?? "📄", kind: input.kind ?? "doc", content: input.content ?? "", client_id: input.client_id ?? null, shared_with_client: input.shared_with_client ?? false, author_id: this.session.user.id, parent_id: input.parent_id ?? null, archived_at: null, created_at: now(), updated_at: now() };
    db().documents.unshift(d); return d;
  }
  async updateDocument(id: string, patch: Patch<Document>) {
    this.agencyOnly();
    const d = db().documents.find((x) => x.id === id); if (!d) throw new StoreError("Document introuvable.");
    const shared = patch.shared_with_client && !d.shared_with_client;
    Object.assign(d, patch, { updated_at: now() });
    if (shared && d.client_id) await this.log("doc.shared", `${d.title} partagé avec le client`, d.client_id, d.id);
    return d;
  }
  async archiveDocument(id: string, archived: boolean) { this.agencyOnly(); const d = db().documents.find((x) => x.id === id); if (!d) throw new StoreError("Document introuvable."); d.archived_at = archived ? now() : null; return d; }

  // Fichiers
  async files(opts?: { clientId?: string | null; folder?: string }) {
    let rows = this.isAgency ? db().files : db().files.filter((f) => f.client_id === this.myClient && f.shared_with_client);
    if (opts?.clientId !== undefined) rows = rows.filter((f) => f.client_id === opts.clientId);
    if (opts?.folder) rows = rows.filter((f) => f.folder === opts.folder);
    return rows.sort(byDateDesc);
  }
  async registerFile(input: Parameters<DataStore["registerFile"]>[0]) {
    if (!this.isAgency && (input.client_id !== this.myClient || input.folder !== "Dépôt client")) throw new StoreError("wrong_client");
    const f: FileAsset = { id: uid("f"), created_at: now(), uploaded_by: this.session.user.id, ...input, shared_with_client: this.isAgency ? input.shared_with_client : true };
    db().files.unshift(f);
    await this.log("file.uploaded", `${f.name} déposé`, f.client_id, f.id);
    return f;
  }
  async updateFile(id: string, patch: Patch<FileAsset>) { this.agencyOnly(); const f = db().files.find((x) => x.id === id); if (!f) throw new StoreError("Fichier introuvable."); Object.assign(f, patch); return f; }
  async deleteFile(id: string) { this.agencyOnly(); db().files = db().files.filter((f) => f.id !== id); }
  async fileUrl() { return null; }

  // Facturation
  async invoices(opts?: { clientId?: string }) {
    let rows = this.visible(db().invoices as Array<Invoice & { client_id: string }>, opts?.clientId);
    if (!this.isAgency) rows = rows.filter((i) => i.status !== "brouillon");
    return rows.sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  }
  async invoice(id: string) { const i = db().invoices.find((x) => x.id === id); if (!i) return null; this.scope(i.client_id); if (!this.isAgency && i.status === "brouillon") return null; return i; }
  async createInvoice(input: Parameters<DataStore["createInvoice"]>[0]) {
    this.agencyOnly();
    const seq = ++db().invoiceSeq; const prefix = input.type === "devis" ? "D" : input.type === "avoir" ? "A" : "F";
    const issue = input.issue_date ?? now().slice(0, 10);
    const due = input.due_date ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const i: Invoice = { id: uid("i"), number: `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`, type: input.type, client_id: input.client_id, status: input.status ?? "brouillon", issue_date: issue, due_date: due, lines: input.lines ?? [], notes: input.notes ?? null, paid_at: null, created_by: this.session.user.id, created_at: now(), updated_at: now() };
    db().invoices.unshift(i); return i;
  }
  async updateInvoice(id: string, patch: Patch<Invoice>) {
    this.agencyOnly();
    const i = db().invoices.find((x) => x.id === id); if (!i) throw new StoreError("Facture introuvable.");
    const sent = patch.status === "envoyee" && i.status === "brouillon"; const paid = patch.status === "payee" && i.status !== "payee";
    Object.assign(i, patch, { updated_at: now() });
    if (paid) i.paid_at = now();
    if (sent) await this.log("invoice.sent", `${i.number} envoyée`, i.client_id, i.id);
    if (paid) await this.log("invoice.paid", `${i.number} payée`, i.client_id, i.id);
    return i;
  }
  async deleteInvoice(id: string) { this.agencyOnly(); db().invoices = db().invoices.filter((i) => i.id !== id); }

  // Messages, activité, planning, métriques
  async messages(clientId: string, limit = 200) { this.scope(clientId); return db().messages.filter((m) => m.client_id === clientId).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-limit); }
  async sendMessage(clientId: string, body: string) {
    this.scope(clientId);
    const m: Message = { id: uid("m"), client_id: clientId, author_id: this.session.user.id, body: body.trim(), created_at: now() };
    db().messages.push(m);
    await this.log("message", `Nouveau message de ${this.session.profile.display_name}`, clientId, m.id);
    return m;
  }
  async shellCounts(): Promise<ShellCounts> {
    const today = new Date().toISOString().slice(0, 10);
    if (!this.isAgency) {
      const briefs = db().briefs.filter((b) => b.client_id === this.myClient && b.status === "attente_client" && b.kind === "video").length;
      const livrables = db().livrables.filter((l) => l.client_id === this.myClient && l.status === "attente_client").length;
      return { briefs: 0, livrables: 0, taches: 0, factures: 0, validations: briefs + livrables };
    }
    return {
      briefs: db().briefs.filter((b) => b.status === "attente_ibra").length,
      livrables: db().livrables.filter((l) => l.status === "en_controle" || l.status === "correction").length,
      taches: db().tasks.filter((t) => t.status !== "termine" && !!t.due_date && t.due_date <= today).length,
      factures: db().invoices.filter((i) => i.status === "en_retard").length,
      validations: 0,
    };
  }
  async activity(opts?: { clientId?: string; actorId?: string; limit?: number }) {
    let rows = this.visible(db().activity, opts?.clientId);
    if (opts?.actorId) rows = rows.filter((a) => a.actor_id === opts.actorId);
    return rows.sort(byDateDesc).slice(0, opts?.limit ?? 50);
  }
  async logActivity(input: Parameters<DataStore["logActivity"]>[0]) { await this.log(input.kind, input.summary, input.client_id ?? null, input.entity_id ?? null); }
  async events(opts?: { from?: string; to?: string; clientId?: string }) {
    let rows = this.isAgency ? db().events : db().events.filter((e) => e.client_id === this.myClient && e.kind !== "interne");
    if (opts?.clientId) rows = rows.filter((e) => e.client_id === opts.clientId);
    if (opts?.from) rows = rows.filter((e) => e.starts_at >= opts.from!);
    if (opts?.to) rows = rows.filter((e) => e.starts_at <= opts.to!);
    return rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  async createEvent(input: Parameters<DataStore["createEvent"]>[0]) { this.agencyOnly(); const e: CalendarEvent = { id: uid("e"), created_by: this.session.user.id, ...input }; db().events.push(e); return e; }
  async deleteEvent(id: string) { this.agencyOnly(); db().events = db().events.filter((e) => e.id !== id); }
  async metrics(opts?: { clientId?: string; from?: string; to?: string }) {
    let rows = this.visible(db().metrics, opts?.clientId);
    if (opts?.from) rows = rows.filter((m) => m.period_start >= opts.from!);
    if (opts?.to) rows = rows.filter((m) => m.period_start <= opts.to!);
    return rows.sort((a, b) => a.period_start.localeCompare(b.period_start));
  }
  async upsertMetric(input: Omit<Metric, "id">) {
    this.agencyOnly();
    const existing = db().metrics.find((m) => m.client_id === input.client_id && m.livrable_id === input.livrable_id && m.period_start === input.period_start);
    if (existing) { Object.assign(existing, input); return existing; }
    const m: Metric = { id: uid("mt"), ...input }; db().metrics.push(m); return m;
  }
}
