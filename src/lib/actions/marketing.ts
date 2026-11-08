"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { getMarketingStoreFor } from "@/lib/marketing/session";
import { runOutbox } from "@/lib/marketing/worker";
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
