"use server";
import { crmAction } from "@/lib/marketing/crm-server";
import { measureSpeed, type SpeedReport } from "@/lib/marketing/speed";

/** Lance la mesure de vitesse (Réglages). Réservé à ceux qui ont accès aux réglages Marketing. */
export async function measureSpeedAction(): Promise<{ ok: true; report: SpeedReport } | { ok: false; error: string }> {
  try {
    await crmAction("marketing_reglages");
    return { ok: true, report: await measureSpeed() };
  } catch {
    return { ok: false, error: "Mesure impossible pour le moment." };
  }
}
