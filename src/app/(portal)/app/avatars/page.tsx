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
      <PageHeader eyebrow="Le casting" title="Avatars" description="Les visages qui incarnent votre marque dans les créations. Retenez ceux qui vous ressemblent : l'équipe les privilégie pour les tournages." />
      {avatars.length ? <AvatarGallery avatars={avatars} /> : <div className="card"><EmptyState icon={Users} title="Aucun avatar proposé pour l'instant" description="L'équipe vous proposera bientôt une sélection de profils adaptés à vos personas." /></div>}
    </div>
  );
}
