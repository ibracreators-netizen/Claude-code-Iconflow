import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Mesure de vitesse vue du serveur : combien de temps pour joindre la base de données ?
 * Chaque page fait plusieurs allers-retours vers la base ; si un seul prend 150 ms ou plus, la base est sans doute
 * dans une région éloignée du serveur et toute l'app paraît lente, quoi qu'on optimise dans le code.
 */
export interface SpeedReport { configured: boolean; samples: number[]; median: number | null; sessionMs: number | null; verdict: "rapide" | "correct" | "lent" | null; at: string }

export async function measureSpeed(): Promise<SpeedReport> {
  const at = new Date().toISOString();
  if (!isSupabaseConfigured()) return { configured: false, samples: [], median: null, sessionMs: null, verdict: null, at };
  const sb = await createClient();
  const t0 = performance.now();
  await sb.auth.getClaims().catch(() => null);
  const sessionMs = Math.round(performance.now() - t0);
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await sb.from("marketing_settings").select("key").limit(1);
    samples.push(Math.round(performance.now() - t));
  }
  // La première requête ouvre la connexion : on la montre, mais on juge sur les suivantes.
  const rest = samples.slice(1).sort((a, b) => a - b);
  const median = rest[Math.floor(rest.length / 2)];
  return { configured: true, samples, median, sessionMs, verdict: median < 60 ? "rapide" : median < 150 ? "correct" : "lent", at };
}
