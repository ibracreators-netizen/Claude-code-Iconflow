/**
 * Erreurs d'infrastructure (base pas à jour, accès refusé, Supabase injoignable) :
 * classification côté serveur et explication côté client.
 *
 * En production, React masque le message d'une erreur levée pendant le rendu serveur
 * (« Minified React error #441 ») mais transmet sa propriété `digest` au navigateur.
 * On y glisse donc une étiquette courte et sans donnée sensible (« IF|table|tasks »)
 * pour que la page d'erreur puisse dire exactement quoi faire.
 */

export type InfraKind = "table" | "column" | "function" | "bucket" | "permission" | "policy" | "timeout" | "network";
export interface InfraInfo { kind: InfraKind; object: string | null; digest: string }

const PREFIX = "IF|";

/** Migration qui fournit chaque objet (table, fonction, bucket, colonne). */
const MIGRATION_OF: Record<string, string> = {
  // 0001 — schéma legacy
  clients: "0001", profiles: "0001", briefs: "0001", livrables: "0001", livrable_comments: "0001", validations: "0001", avatars: "0001",
  brand_dossiers: "0001", brain_entries: "0001", brain_imports: "0001", angles: "0001", deposits: "0001", api_tokens: "0001", agency_client_management: "0001",
  my_role: "0001", my_client_id: "0001", client_decide_script: "0001", agency_save_client_management: "0001",
  // 0002 — studio v2
  contacts: "0002", tasks: "0002", documents: "0002", files: "0002", invoices: "0002", messages: "0002", activity_log: "0002", calendar_events: "0002",
  metrics: "0002", knowledge: "0002", app_settings: "0002", transition_livrable: "0002", agency_transition_brief: "0002", next_invoice_number: "0002", studio: "0002",
  // 0003 — photos de profil
  "bucket:avatars": "0003",
  // 0004 — équipe & accès
  permissions: "0004", disabled_at: "0004", invited_by: "0004",
  // 0005 — droits en base
  my_has_module: "0005", my_is_full_access: "0005", my_permissions: "0005", protect_last_admin: "0005",
  // 0006 — produit : étapes libres, concepts, batchs, dossiers, intégrations
  pipeline_stages: "0006", brief_concepts: "0006", document_folders: "0006", integrations: "0006",
  agency_delete_client: "0006", agency_delete_stage: "0006", items: "0006", link: "0006", folder_id: "0006", dashboard_url: "0006",
  // 0007 — partage public des briefs
  public_token: "0007", published_at: "0007",
};

export const MIGRATION_FILES: Record<string, string> = {
  "0001": "0001_baseline.sql", "0002": "0002_studio_v2.sql", "0003": "0003_avatars.sql", "0004": "0004_team.sql", "0005": "0005_access_rls.sql", "0006": "0006_product.sql", "0007": "0007_brief_share.sql",
};

export function migrationFor(kind: InfraKind, object: string | null): string | null {
  if (!object) return null;
  if (kind === "bucket") return MIGRATION_OF[`bucket:${object}`] ?? MIGRATION_OF[object] ?? null;
  return MIGRATION_OF[object] ?? null;
}

const clean = (s: string) => s.replace(/^public\./, "").replace(/[^a-z0-9_]/gi, "").slice(0, 60);

/** Reconnaît une erreur d'infrastructure dans un code/message PostgREST, Postgres, Storage ou réseau. */
export function classifyInfra(code: string | undefined, message: string): InfraInfo | null {
  const m = message ?? "";
  let r: RegExpMatchArray | null;
  if ((r = m.match(/relation "?([a-z_.]+)"? does not exist/i)) || (r = m.match(/Could not find the table '([a-z_.]+)'/i)) || code === "PGRST205" || code === "42P01") {
    return info("table", r ? clean(r[1]) : null);
  }
  if ((r = m.match(/column "?([a-z_.]+)"? (?:of relation "?[a-z_.]+"? )?does not exist/i)) || (r = m.match(/Could not find the '([a-z_]+)' column/i)) || code === "42703" || code === "PGRST204") {
    return info("column", r ? clean(r[1].split(".").pop() ?? r[1]) : null);
  }
  if ((r = m.match(/function "?([a-z_.]+)"?\(/i)) && /does not exist/i.test(m) || (r = m.match(/Could not find the function "?([a-z_.]+)"?/i)) || code === "42883" || code === "PGRST202") {
    return info("function", r ? clean(r[1]) : null);
  }
  if (/bucket not found/i.test(m)) return info("bucket", /avatars/i.test(m) ? "avatars" : /studio/i.test(m) ? "studio" : null);
  if (code === "42P17" || /infinite recursion detected in policy/i.test(m)) return info("policy", (r = m.match(/for relation "?([a-z_]+)"?/i)) ? clean(r[1]) : null);
  if (code === "57014" || /statement timeout|canceling statement/i.test(m)) return info("timeout", null);
  if (code === "42501" || /permission denied|row-level security/i.test(m)) return info("permission", (r = m.match(/permission denied for (?:table|relation|function|schema|sequence) "?([a-z_]+)"?/i)) ? clean(r[1]) : null);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo|network|Failed to fetch|socket hang up|timed out/i.test(m)) return info("network", null);
  return null;
}

function info(kind: InfraKind, object: string | null): InfraInfo {
  return { kind, object, digest: `${PREFIX}${kind}|${object ?? ""}` };
}

export function parseInfraDigest(digest: string | undefined | null): InfraInfo | null {
  if (!digest || !digest.startsWith(PREFIX)) return null;
  const [, kind, object] = digest.split("|");
  if (!kind) return null;
  return { kind: kind as InfraKind, object: object || null, digest };
}

export interface InfraExplanation { title: string; description: string; steps: string[]; migration: string | null }

/** Explication en français, prête à afficher, d'une erreur d'infrastructure. */
export function explainInfra(i: InfraInfo): InfraExplanation {
  const migration = migrationFor(i.kind, i.object);
  const file = migration ? MIGRATION_FILES[migration] : null;
  const run = file ? `Dans Supabase → SQL Editor, exécute supabase/migrations/${file} (puis les migrations suivantes dans l'ordre), et recharge la page.` : "Exécute les migrations supabase/migrations/0002 → 0006 dans l'ordre (Supabase → SQL Editor), puis recharge la page.";
  const cache = "Si tu viens d'exécuter la migration : Supabase recharge son cache de schéma en quelques secondes, attends dix secondes et recharge.";
  switch (i.kind) {
    case "table":
      return { title: "La base de données n'est pas à jour", description: i.object ? `La table « ${i.object} » n'existe pas encore dans ton projet Supabase.` : "Une table attendue n'existe pas encore dans ton projet Supabase.", steps: [run, "Colle le fichier entier, sans rien sélectionner dans l'éditeur, puis Run : une erreur n'importe où dans le fichier annule tout le fichier.", cache], migration };
    case "column":
      return { title: "La base de données n'est pas à jour", description: i.object ? `La colonne « ${i.object} » manque dans ton projet Supabase.` : "Une colonne attendue manque dans ton projet Supabase.", steps: [run, cache], migration };
    case "function":
      return { title: "La base de données n'est pas à jour", description: i.object ? `La fonction « ${i.object} » n'existe pas dans ton projet Supabase.` : "Une fonction attendue n'existe pas dans ton projet Supabase.", steps: [run, cache], migration };
    case "bucket":
      return { title: "Stockage non initialisé", description: i.object ? `Le bucket Storage « ${i.object} » n'existe pas.` : "Un bucket Storage attendu n'existe pas.", steps: [run], migration };
    case "permission":
      return { title: "Accès refusé par la base", description: i.object ? `Postgres a refusé l'accès à « ${i.object} » (droit de table ou d'exécution manquant).` : "Postgres a refusé l'opération (droit manquant ou politique).", steps: [
        i.object ? `Dans Supabase → SQL Editor : grant select, insert, update, delete on public.${i.object} to authenticated; (pour une fonction : grant execute on function public.${i.object} to authenticated, anon;).` : "Si tu viens d'exécuter une migration, vérifie qu'elle est allée jusqu'au bout sans erreur et relance-la : elle est rejouable.",
        "En lecture, les politiques RLS filtrent sans jamais refuser : cette erreur vient d'un droit de table ou d'exécution, pas des droits par membre.",
      ], migration: i.object && /^(my_|protect_|handle_|transition_|agency_|client_|next_)/.test(i.object) ? migrationFor("function", i.object) : null };
    case "policy":
      return { title: "Politique de sécurité en boucle", description: i.object ? `Une politique RLS de la table « ${i.object} » se référence elle-même.` : "Une politique RLS se référence elle-même.", steps: ["Relance supabase/migrations/0005_access_rls.sql dans Supabase → SQL Editor : il recrée les politiques et les fonctions attendues.", cache], migration: "0005" };
    case "timeout":
      return { title: "La base met trop de temps à répondre", description: "Une requête a dépassé le délai autorisé par Supabase.", steps: ["Recharge la page. Si cela persiste, le projet Supabase est peut-être en train de se réveiller ou surchargé (Dashboard → Reports)."], migration: null };
    case "network":
      return { title: "Supabase est injoignable", description: "Le serveur n'a pas pu joindre la base de ton projet Supabase.", steps: ["Supabase → page du projet : s'il est marqué « Paused », clique « Restore » et attends la fin.", "Vercel → Settings → Environment Variables : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent exister pour l'environnement de ce déploiement (Production et Preview) ; une variable ajoutée après le build demande un redéploiement."], migration: null };
  }
}
