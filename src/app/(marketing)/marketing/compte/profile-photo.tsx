import { MkInitials } from "@/components/marketing/ui";

/** Initiales lisibles : « Setter (essai) » donne « SE », pas « S( ». */
const cleanName = (name: string) => name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim() || name;

/** Photo de profil ronde, ou le rond d'initiales de LeadConnector quand il n'y en a pas. */
export function ProfilePhoto({ name, src, size }: { name: string; src?: string | null; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- photo du stockage (ou intégrée en démonstration) : pas d'optimisation d'image ici
  if (src) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full border border-mk-line object-cover" style={{ width: size, height: size }} />;
  return <MkInitials name={cleanName(name)} size={size} />;
}
