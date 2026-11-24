import type { Instrumentation } from "next";

/**
 * Jamais un jeton de lien secret dans le journal : « /kpi/<jeton> » (saisie des KPI), « /b/<jeton> » (brief partagé),
 * « /ia/<jeton> » (plan IA), « /casting/<jeton> » et « /bienvenue/<jeton> » (lien d'onboarding) deviennent « …/[jeton] ».
 * Qui lit les journaux ne doit pas pouvoir rouvrir le lien de quelqu'un.
 */
export const redactSecretPaths = (s: string) => s.replace(/\/(kpi|b|ia|casting|bienvenue)\/[^/?#\s"'\\]+/g, "/$1/[jeton]").replace(/([?&](?:token_hash|token)=)[^&#\s"'\\]+/g, "$1[jeton]");

/**
 * Journal serveur des erreurs de rendu : une ligne lisible dans les logs de l'hébergeur (Vercel → Logs)
 * avec la route, le type de rendu et la référence (digest) affichée au visiteur, pour relier les deux.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as { digest?: string; message?: string; code?: string };
  console.error("[iconflow] erreur de rendu", JSON.stringify({
    digest: e.digest ?? null,
    code: e.code ?? null,
    message: redactSecretPaths((e.message ?? "").slice(0, 300)),
    path: redactSecretPaths(request.path),
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource ?? null,
  }));
};
