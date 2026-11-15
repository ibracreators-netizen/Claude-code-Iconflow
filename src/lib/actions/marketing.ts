"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { getMarketingStoreFor } from "@/lib/marketing/session";
import { runOutbox } from "@/lib/marketing/worker";
import { processInbox, sendTestLead } from "@/lib/marketing/inbox";
import { runBookingSync } from "@/lib/marketing/sources/run";
import { disconnectGoogle, setGoogleCalendars, syncMyGoogle } from "@/lib/marketing/google/sync";
import type { MarketingSettings, ProspectStatus } from "@/lib/marketing/types";

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
export async function bookAppointment(input: { prospect_id: string; starts_at: string; ends_at: string; meeting_url?: string | null }) {
  return run(async () => { const store = await getMarketingStoreFor("marketing_calendrier"); const a = await store.book(input); rev(); return a; });
}
export async function cancelAppointment(id: string) {
  return run(async () => { const store = await getMarketingStoreFor("marketing_calendrier"); await store.cancelAppointment(id); rev(); });
}
export async function rescheduleAppointment(id: string, starts_at: string, ends_at: string) {
  return run(async () => { const store = await getMarketingStoreFor("marketing_calendrier"); const a = await store.reschedule(id, starts_at, ends_at); rev(); return a; });
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
