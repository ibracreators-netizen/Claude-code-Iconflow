import { Users } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { AvatarGallery } from "./gallery";

export const metadata = { title: "Avatars" };

export default async function AvatarsPage() {
  const store = await requireClient();
  const avatars = await store.avatars(store.clientId);
  return (
    <div>
      <PageHeader eyebrow="Le casting" title="Avatars" description="Les visages qui incarnent votre marque. Choisissez ceux qui vous ressemblent — ceux que vous ne choisissez pas sont archivés 7 jours, puis supprimés (restaurables avant)." />
      {avatars.length ? <AvatarGallery avatars={avatars} /> : <div className="card"><EmptyState icon={Users} title="Aucun avatar proposé pour l'instant" description="L'équipe vous proposera bientôt une sélection de profils adaptés à vos personas." /></div>}
    </div>
  );
}
