/**
 * Cible de redirection après connexion : uniquement un chemin interne (« /studio/… »).
 * Refuse les URL absolues et les formes « //hôte » ou « /\hôte » que le navigateur résout vers un autre site.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(v)) return fallback;
  return v;
}
