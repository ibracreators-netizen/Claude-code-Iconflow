"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { getMarketingStoreFor } from "@/lib/marketing/session";
import { crmAction, type Crm } from "@/lib/marketing/crm-server";
import { runOutbox } from "@/lib/marketing/worker";
import { processInbox, sendTestLead } from "@/lib/marketing/inbox";
import { runBookingSync } from "@/lib/marketing/sources/run";
import { inviteSalesMember, resendSalesInvite, updateSalesMember } from "@/lib/marketing/team";
import { checkInviteInput, explainInviteError, type InviteOutcome, type InviteRole } from "@/lib/marketing/invite-errors";
import { APP_URL } from "@/lib/supabase/env";
import { setAgencyAdAccount, syncAgencyAds } from "@/lib/marketing/ads";
import { hasFullAccess, type SalesRole } from "@/lib/permissions";
import { disconnectGoogle, setGoogleCalendars, syncMyGoogle } from "@/lib/marketing/google/sync";
import type { Appointment, MarketingSettings, Prospect, ProspectStatus } from "@/lib/marketing/types";

const rev = () => { revalidatePath("/marketing", "layout"); };

export async function createProspect(input: { name?: string; email?: string; phone?: string; source?: string; notes?: string }) {
  return run(async () => {
    const store = await getMarketingStoreFor("marketing_prospects");
    const p = await store.createProspect({ name: input.name?.trim() || null, email: input.email?.trim() || null, phone: input.phone?.trim() || null, source: input.source?.trim() || "manuel", notes: input.notes?.trim() || null });
    rev(); return p;
  });
}
export async function updateProspect(id: string, patch: { name?: string | null; phone?: string | null; notes?: string | null; status?: ProspectStatus; besoin?: string | null; budget?: string | null; next_action_at?: string | null; next_action_note?: string | null }) {
  return run(async () => { const store = await getMarketingStoreFor("marketing_prospects"); const p = await store.updateProspect(id, patch); rev(); return p; });
}
/*
 * Rendez-vous depuis la fiche d'un prospect. Les fonctions de la base qui réservent et annulent ne vérifient que le
 * module Calendrier : c'est donc ici qu'on vérifie que le prospect ou le rendez-vous est visible par le membre
 * (sous RLS en production, dans le périmètre du commercial sans base). Un setter ou un closer ne touche qu'aux siens.
 */
const instant = (v: unknown): string => { const t = Date.parse(String(v ?? "")); if (!Number.isFinite(t)) throw new Error("Choisis une date et une heure."); return new Date(t).toISOString(); };
const meetingLink = (v: unknown): string | null => {
  const link = String(v ?? "").trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) throw new Error("Le lien visio doit commencer par https://");
  if (link.length > 400) throw new Error("Le lien visio est trop long.");
  return link || null;
};
async function visibleAppointment(c: Crm, id: string): Promise<Appointment> {
  const a = id ? await c.db.get<Appointment>("marketing_appointments", String(id)) : null;
  if (!a) throw new Error("Ce rendez-vous n'est plus accessible.");
  return a;
}
export async function bookAppointment(input: { prospect_id: string; starts_at: string; ends_at: string; meeting_url?: string | null }) {
  return run(async () => {
    const c = await crmAction("marketing_calendrier");
    const p = input.prospect_id ? await c.db.get<Prospect>("marketing_prospects", String(input.prospect_id)) : null;
    if (!p) throw new Error("prospect_not_found");
    const a = await c.store.book({ prospect_id: p.id, starts_at: instant(input.starts_at), ends_at: instant(input.ends_at), meeting_url: meetingLink(input.meeting_url) });
    rev(); return a;
  });
}
export async function cancelAppointment(id: string) {
  return run(async () => { const c = await crmAction("marketing_calendrier"); const a = await visibleAppointment(c, id); await c.store.cancelAppointment(a.id); rev(); });
}
export async function rescheduleAppointment(id: string, starts_at: string, ends_at: string) {
  return run(async () => {
    const c = await crmAction("marketing_calendrier");
    const cur = await visibleAppointment(c, id);
    // Vérifié avant d'annuler l'ancien : sinon il serait annulé sans que le nouveau puisse être pris.
    if (!(await c.db.get<Prospect>("marketing_prospects", cur.prospect_id))) throw new Error("prospect_not_found");
    const a = await c.store.reschedule(cur.id, instant(starts_at), instant(ends_at)); rev(); return a;
  });
}
export async function saveMarketingSettings(patch: Partial<MarketingSettings>) {
  return run(async () => { const store = await getMarketingStoreFor("marketing_reglages"); const s = await store.saveSettings(patch); rev(); return s; });
}
/** « Traiter la file maintenant » depuis la page Relances (DRY RUN par défaut). */
export async function processOutboxNow() {
  return run(async () => { await getMarketingStoreFor("marketing_relances"); const summary = await runOutbox({ limit: 50 }); rev(); return summary; });
}

/* ─── Réception des leads ─── */
/** « Traiter maintenant » : même traitement que le planificateur, à la demande. */
export async function processInboxNow() {
  return run(async () => { await getMarketingStoreFor("marketing_reception"); const sum = await processInbox({ limit: 100 }); if (!sum.ran) throw new Error(sum.reason ?? "Traitement impossible."); rev(); return sum; });
}
/** « Retraiter » une ligne : rejouable, ne crée jamais de doublon. Lève aussi l'attente d'une ligne « suspect » ou « erreur ». */
export async function reprocessInboxRow(id: string) {
  return run(async () => { await getMarketingStoreFor("marketing_reception"); const sum = await processInbox({ ids: [id], force: true }); if (!sum.ran) throw new Error(sum.reason ?? "Traitement impossible."); rev(); return sum; });
}
/** « Envoyer un lead de test » : suit tout le circuit, sans créer de prospect. */
export async function sendTestLeadAction() {
  return run(async () => { await getMarketingStoreFor("marketing_reception"); const res = await sendTestLead(); rev(); return res; });
}

/* ─── Outil de réservation ─── */
/** « Synchroniser maintenant » : même lecture que le planificateur, à la demande. Rejouable, sans doublon. */
export async function syncBookingsNow() {
  return run(async () => {
    await getMarketingStoreFor("marketing_reglages");
    const res = await runBookingSync({ force: true, budgetMs: 20_000, mode: "manuel" });
    if (!res.ran) throw new Error(res.reason === "ICLOSED_API_KEY manquante" ? "La variable ICLOSED_API_KEY n'est pas lue sur l'hébergeur." : res.reason ?? "Synchronisation impossible.");
    if (!res.ok) throw new Error(res.stats.errors[0] ?? "La synchronisation a échoué.");
    rev(); return { created: res.stats.created, updated: res.stats.updated, leads: res.stats.leads, tasks: res.stats.tasks, more: res.more };
  });
}

/* ─── Google Agenda (lecture seule) : chaque membre gère SON compte ─── */
export async function googleSetCalendars(selected: string[]) {
  return run(async () => { const store = await getMarketingStoreFor("marketing_calendrier"); await setGoogleCalendars(store.session.user.id, selected.slice(0, 50)); const res = await syncMyGoogle(store.session.user.id); rev(); return res; });
}
export async function googleSyncNow() {
  return run(async () => { const store = await getMarketingStoreFor("marketing_calendrier"); const res = await syncMyGoogle(store.session.user.id); if (!res.ok) throw new Error(res.error ?? "Lecture de Google impossible."); rev(); return res; });
}
export async function googleDisconnect() {
  return run(async () => { const store = await getMarketingStoreFor("marketing_calendrier"); await disconnectGoogle(store.session.user.id); rev(); });
}

/* ─── Équipe Marketing (administrateur uniquement) ─── */
async function adminOnly() {
  const store = await getMarketingStoreFor("marketing_reglages");
  if (!hasFullAccess(store.session.profile)) throw new Error("La gestion de l'équipe est réservée à l'administrateur.");
  return store;
}
const isRedirect = (e: unknown) => typeof e === "object" && !!e && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT");
/**
 * Invitation et renvoi : le résultat dit toujours ce qui s'est passé (e-mail envoyé, lien à transmettre, ou erreur expliquée
 * avec quoi faire), affiché dans la fenêtre plutôt qu'en notification. En démo, rien n'est créé ni généré.
 */
async function teamInvite(fn: (store: Awaited<ReturnType<typeof adminOnly>>) => Promise<InviteOutcome>, demo: { name: string; email: string; role?: unknown }): Promise<InviteOutcome> {
  try {
    const store = await adminOnly();
    if (store.demo) {
      const bad = demo.role === undefined ? null : checkInviteInput({ name: demo.name, email: demo.email, role: demo.role });
      return bad ? { status: "erreur", problem: bad } : { status: "demo", name: demo.name.trim(), email: demo.email.trim() };
    }
    const res = await fn(store);
    if (res.status !== "erreur") rev();
    return res;
  } catch (e) {
    if (isRedirect(e)) throw e;
    return { status: "erreur", problem: explainInviteError(e, { redirect: `${APP_URL}/auth/callback` }) };
  }
}
export async function inviteSalesMemberAction(input: { email: string; name: string; role: InviteRole; permissions?: string[] | null; reuse?: boolean }) {
  return run(() => teamInvite((store) => inviteSalesMember(store.session, input), { name: String(input?.name ?? ""), email: String(input?.email ?? ""), role: input?.role ?? null }));
}
export async function resendSalesInviteAction(id: string) {
  return run(() => teamInvite((store) => (id === store.session.user.id ? Promise.resolve<InviteOutcome>({ status: "erreur", problem: { code: "inconnu", title: "C'est ton propre compte.", help: "Rien à renvoyer : tu es déjà connecté." } }) : resendSalesInvite(store.session, String(id))), { name: "", email: "" }));
}
export async function updateSalesMemberAction(id: string, patch: { role?: SalesRole; disabled?: boolean; permissions?: string[] }) {
  return run(async () => { const store = await adminOnly(); if (store.demo) throw new Error("Mode démo : rien n'est enregistré. Relie la base pour gérer l'équipe."); if (id === store.session.user.id) throw new Error("Tu ne peux pas modifier ton propre compte ici."); await updateSalesMember(id, patch, store.session.user.id); rev(); });
}

/* ─── Publicité : compte Meta Ads de l'agence (administrateur uniquement) ─── */
export async function setAgencyAdAccountAction(integrationId: string | null) {
  return run(async () => { await adminOnly(); await setAgencyAdAccount(integrationId); if (integrationId) await syncAgencyAds({ force: true }); rev(); });
}
export async function syncAgencyAdsAction() {
  return run(async () => { await adminOnly(); const res = await syncAgencyAds({ force: true }); if (!res.ok) throw new Error(res.error ?? "Lecture de Meta impossible."); rev(); return res; });
}
