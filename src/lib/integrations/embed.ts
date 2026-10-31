import "server-only";
import { APP_URL } from "@/lib/supabase/env";
import { frameAllowed, type EmbedStatus } from "./dashboard-url";

/**
 * Le tableau de bord externe accepte-t-il d'être affiché dans un cadre de l'app ?
 * Lecture des seuls en-têtes de la page (le corps est abandonné), délai court : la page ne doit jamais attendre longtemps.
 * « unknown » (réseau indisponible, délai dépassé) affiche le cadre quand même, avec une aide en dessous.
 */
export async function embedCheck(url: string, appOrigin = APP_URL): Promise<EmbedStatus> {
  try {
    const res = await fetch(url, {
      method: "GET", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(3500),
      headers: { accept: "text/html,*/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; IconflowStudio/1.0; +https://icon-flow.fr)" },
    });
    res.body?.cancel().catch(() => undefined);
    return frameAllowed({ xFrameOptions: res.headers.get("x-frame-options"), csp: res.headers.get("content-security-policy") }, appOrigin);
  } catch {
    return "unknown";
  }
}
