import "server-only";
import { createClient } from "./server";
import { isSupabaseConfigured } from "./env";
import { classifyInfra, MIGRATION_FILES } from "@/lib/infra-errors";

export interface SetupCheck { id: string; label: string; ok: boolean | null; detail: string | null; required: boolean }

/**
 * État de l'installation : une sonde légère par migration, plus les variables optionnelles.
 * Toutes les sondes passent par la session de l'utilisateur connecté (RLS), donc un tableau vide
 * est un succès ; seule une erreur « objet absent » signale une migration manquante.
 */
export async function setupChecks(): Promise<SetupCheck[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = await createClient();
  const probe = async (id: string, label: string, run: () => PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<SetupCheck> => {
    try {
      const { error } = await run();
      if (!error) return { id, label, ok: true, detail: null, required: true };
      const infra = classifyInfra((error as { code?: string }).code, error.message);
      // Un refus RLS n'est pas une migration manquante : l'objet existe.
      if (infra?.kind === "permission" || !infra) return { id, label, ok: true, detail: null, required: true };
      return { id, label, ok: false, detail: error.message.slice(0, 160), required: true };
    } catch (e) {
      return { id, label, ok: null, detail: String((e as Error)?.message ?? e).slice(0, 160), required: true };
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => sb.from(name) as any;
  const V2_TABLES = ["contacts", "tasks", "documents", "files", "invoices", "messages", "activity_log", "calendar_events", "metrics", "knowledge"];
  const probeAll = async (id: string, label: string, tables: string[]): Promise<SetupCheck> => {
    const results = await Promise.all(tables.map((name) => probe(name, name, () => t(name).select("id").limit(1))));
    const missing = results.filter((r) => r.ok === false).map((r) => r.id);
    const unknown = results.filter((r) => r.ok === null);
    if (missing.length) return { id, label, ok: false, detail: `Table${missing.length > 1 ? "s" : ""} absente${missing.length > 1 ? "s" : ""} : ${missing.join(", ")}`, required: true };
    if (unknown.length) return { id, label, ok: null, detail: unknown[0].detail, required: true };
    return { id, label, ok: true, detail: null, required: true };
  };
  const [m1, m2, m3, m4, m5] = await Promise.all([
    probe("0001", `Schéma de base (${MIGRATION_FILES["0001"]})`, () => t("clients").select("id").limit(1)),
    probeAll("0002", `Studio v2 : contacts, tâches, documents, fichiers, factures, messagerie, journal, planning, performance, Brain agence (${MIGRATION_FILES["0002"]})`, V2_TABLES),
    probe("0003", `Photos de profil : bucket « avatars » (${MIGRATION_FILES["0003"]})`, () => sb.storage.from("avatars").list("", { limit: 1 })),
    probe("0004", `Équipe & accès : droits par membre (${MIGRATION_FILES["0004"]})`, () => t("profiles").select("permissions,disabled_at").limit(1)),
    probe("0005", `Droits appliqués par la base (${MIGRATION_FILES["0005"]})`, () => sb.rpc("my_has_module", { p_module: "dashboard" })),
  ]);
  const service: SetupCheck = { id: "service", label: "Clé service (invitations, renvoi de liens)", ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY, detail: process.env.SUPABASE_SERVICE_ROLE_KEY ? null : "SUPABASE_SERVICE_ROLE_KEY absente sur l'hébergeur : les invitations depuis le studio sont désactivées.", required: false };
  const url: SetupCheck = { id: "url", label: "URL publique de l'app (liens des emails)", ok: !!process.env.NEXT_PUBLIC_APP_URL, detail: process.env.NEXT_PUBLIC_APP_URL ?? "NEXT_PUBLIC_APP_URL absente : les liens des emails pointeront vers http://localhost:3000.", required: false };
  return [m1, m2, m3, m4, m5, service, url];
}

/** Vrai si une erreur vient de l'infrastructure (base pas à jour, accès refusé, réseau) et mérite l'écran d'installation. */
export function isInfraError(e: unknown): e is Error & { digest: string } {
  return typeof e === "object" && e !== null && typeof (e as { digest?: unknown }).digest === "string" && (e as { digest: string }).digest.startsWith("IF|");
}
