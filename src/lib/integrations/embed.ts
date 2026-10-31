import "server-only";
import { APP_URL } from "@/lib/supabase/env";
import { frameAllowed, nextHop, type EmbedStatus } from "./dashboard-url";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";

/** Délai total de la vérification (toutes redirections comprises) : la page ne doit jamais attendre longtemps. */
const CHECK_BUDGET_MS = 3500;
const MAX_HOPS = 4;

/**
 * Le tableau de bord externe accepte-t-il d'être affiché dans un cadre de l'app ?
 * Lecture des seuls en-têtes de la page (le corps est abandonné). Les redirections sont suivies à la main : une
 * redirection vers un autre hôte (page de connexion Google, SSO…) ne renseigne pas sur le tableau de bord lui-même —
 * le visiteur connecté dans son navigateur le verra peut-être très bien — et vaut donc « unknown », jamais « refused ».
 * « unknown » (réseau indisponible, délai dépassé, redirection externe, hôte interne) affiche le cadre quand même, avec une aide.
 *
 * Le réseau passe par safeFetch : l'IP est validée et épinglée (aucune seconde résolution DNS), et toute cible interne
 * (localhost, IP privée, lien-local, métadonnées cloud) est refusée — pas de SSRF depuis cette vérification serveur.
 */
export async function embedCheck(url: string, appOrigin = APP_URL): Promise<EmbedStatus> {
  const deadline = Date.now() + CHECK_BUDGET_MS;
  try {
    let current = url;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const res = await safeFetch(current, {
        method: "GET", maxBytes: 0, timeoutMs: Math.max(50, deadline - Date.now()),
        headers: { accept: "text/html,*/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; IconflowStudio/1.0; +https://icon-flow.fr)" },
      });
      const step = nextHop(current, res.status, res.location);
      if (step.kind === "foreign") return "unknown";
      if (step.kind === "follow") { current = step.url; continue; }
      return frameAllowed({ xFrameOptions: res.headers["x-frame-options"] ?? null, csp: res.headers["content-security-policy"] ?? null }, appOrigin);
    }
    return "unknown";
  } catch (e) {
    // Hôte interne, délai, réseau : on n'en révèle rien et on affiche le cadre avec une aide.
    void (e instanceof SafeFetchError);
    return "unknown";
  }
}
