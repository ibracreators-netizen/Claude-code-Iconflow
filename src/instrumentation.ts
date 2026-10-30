import type { Instrumentation } from "next";

/**
 * Journal serveur des erreurs de rendu : une ligne lisible dans les logs de l'hébergeur (Vercel → Logs)
 * avec la route, le type de rendu et la référence (digest) affichée au visiteur, pour relier les deux.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as { digest?: string; message?: string; code?: string };
  console.error("[iconflow] erreur de rendu", JSON.stringify({
    digest: e.digest ?? null,
    code: e.code ?? null,
    message: (e.message ?? "").slice(0, 300),
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource ?? null,
  }));
};
