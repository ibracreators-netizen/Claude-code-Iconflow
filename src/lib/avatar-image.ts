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
