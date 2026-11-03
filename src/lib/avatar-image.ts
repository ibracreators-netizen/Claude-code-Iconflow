/**
 * Image d'un avatar (casting). La colonne `avatars.preview_url` contient :
 *  - soit un lien HTTPS externe, affiché tel quel ;
 *  - soit le chemin d'un fichier du bucket privé « studio » (`clients/<client_id>/<dossier>/<fichier>`),
 *    signé au moment de l'affichage (1 h). Aucun lien public permanent n'est créé.
 * Pas de migration : la colonne existante sert aux deux cas, et les lectures (studio, espace client,
 * casting public) renvoient toujours dans `preview_url` une URL affichable.
 */

/** Dossier des Fichiers où l'on range les images d'avatars d'un client. */
export const AVATAR_FOLDER = "Avatars";

/** Formats d'image acceptés pour un avatar. */
export const AVATAR_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

/** Taille maximale d'une image d'avatar importée. */
export const AVATAR_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

/** Durée de validité du lien signé généré à l'affichage. */
export const AVATAR_SIGN_SECONDS = 60 * 60;

export const isAvatarImageMime = (mime: string | null | undefined) => !!mime && /^image\/(png|jpe?g|webp)$/i.test(mime);

/** Vrai si la valeur est un chemin du bucket « studio » (et non un lien HTTPS externe). */
export function isStoredImagePath(v: string | null | undefined): v is string {
  return !!v && !v.includes("..") && /^clients\/[^/]+\/[^/]+\/[^/]+$/.test(v);
}

/** Vrai si le chemin est rangé dans le dossier du client donné. */
export function isClientImagePath(clientId: string, v: string | null | undefined): v is string {
  return isStoredImagePath(v) && v.startsWith(`clients/${clientId}/`);
}

/** Le dossier « Avatars », quelle que soit la casse saisie à sa création. */
export const isAvatarFolder = (folder: string | null | undefined) => (folder ?? "").trim().toLowerCase() === AVATAR_FOLDER.toLowerCase();

/*
 * Champ « Avatar » d'un concept de brief vidéo (content.avatar) : même principe que le casting.
 * Chaque entrée est un lien HTTPS, ou le chemin d'une image de Fichiers › Avatars du client,
 * signé au moment de l'affichage (studio, espace client, lien public du brief).
 */

/** Chemins d'images des Fichiers cités dans le champ « Avatar » d'un concept. */
export function briefAvatarPaths(content: unknown): string[] {
  const list = content && typeof content === "object" ? (content as { avatar?: unknown }).avatar : null;
  return (Array.isArray(list) ? list : []).map(String).filter(isStoredImagePath);
}

/** Contenu où chaque chemin du champ « Avatar » devient son lien signé ; un chemin non signé est retiré (jamais affiché brut). */
export function withSignedBriefAvatars<T>(content: T, urls: Map<string, string>): T {
  if (!content || typeof content !== "object") return content;
  const c = content as Record<string, unknown>;
  if (!Array.isArray(c.avatar) || !c.avatar.some((x) => isStoredImagePath(String(x)))) return content;
  const avatar = c.avatar.map(String).flatMap((x) => (isStoredImagePath(x) ? (urls.has(x) ? [urls.get(x) as string] : []) : [x]));
  return { ...c, avatar } as T;
}
