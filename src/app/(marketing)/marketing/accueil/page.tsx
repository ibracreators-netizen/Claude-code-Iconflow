import type { Metadata } from "next";
import { CalendarCheck, CalendarDays, CirclePlus, ClipboardCheck, ClipboardPen, Contact, CreditCard, Euro, ListPlus, Plus, UserPlus, UserRound, type LucideIcon } from "lucide-react";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import { firstName, homeTiles, type HomeTile, type HomeTileKey } from "@/lib/marketing/home-server";
import { appsFor, DEFAULT_PINNED } from "@/lib/marketing/apps";
import { euro } from "@/lib/marketing/ui";
import { canAccess, type ModuleKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { MkCard, MkRoundGrid, MkRoundLink, MkTile, type MkTone } from "@/components/marketing/ui";
import { PinnedApps, RefreshButton } from "./accueil-client";

export const metadata: Metadata = { title: "Accueil" };

const TODAY = "Aujourd'hui", MONTH = "Les 30 derniers jours";
const VIEW: Record<HomeTileKey, { period: string; title: string; icon: LucideIcon; tone: MkTone; href: string }> = {
  taches: { period: TODAY, title: "Tâches", icon: ClipboardCheck, tone: "success", href: "/marketing/taches" },
  pipeline: { period: MONTH, title: "Valeur du pipeline", icon: Euro, tone: "success", href: "/marketing/crm" },
  prospects: { period: MONTH, title: "Nouveaux prospects", icon: UserRound, tone: "teal", href: "/marketing/crm" },
  rdv: { period: TODAY, title: "Rendez-vous", icon: CalendarDays, tone: "warn", href: "/marketing/calendrier" },
  contacts: { period: MONTH, title: "Nouveaux contacts", icon: Contact, tone: "link", href: "/marketing/contacts" },
  leads: { period: MONTH, title: "Nouveaux leads", icon: UserPlus, tone: "teal", href: "/marketing/acquisition" },
  rdvPris: { period: MONTH, title: "Rendez-vous pris", icon: CalendarCheck, tone: "warn", href: "/marketing/acquisition" },
};

function Tile({ tile }: { tile: HomeTile }) {
  const v = VIEW[tile.key];
  if (tile.key === "taches") {
    // Rien à faire aujourd'hui : « Tout est à jour », et la tuile mène à l'ajout d'une tâche.
    if (tile.value === 0) return (
      <MkTile href="/marketing/taches?nouveau=1" period={v.period} title={v.title} icon={v.icon} tone="success" footer={<>
        <span className="block text-[16px] font-medium leading-snug text-mk-success">Tout est à jour</span>
        <span className="mt-1 flex items-center gap-1 text-[14px] font-medium text-mk-link"><Plus className="size-4" strokeWidth={2.2} />Ajoutez une tâche</span>
      </>} />
    );
    return (
      <MkTile href={v.href} period={v.period} title={v.title} icon={v.icon} tone={tile.late ? "warn" : "success"} value={tile.value}
        footer={<span className={cn("mt-1.5 block text-[13px] font-medium", tile.late ? "text-mk-warn" : "text-mk-sub")}>{tile.late ? `à faire, dont ${tile.late} en retard` : "à faire"}</span>} />
    );
  }
  if (tile.key === "pipeline") {
    const money = euro.format(tile.value);
    // Un grand montant passe sur une ligne, même sur un petit téléphone.
    return <MkTile href={v.href} period={v.period} title={v.title} icon={v.icon} tone={v.tone} value={<span className={money.length > 9 ? "text-[20px]" : money.length > 6 ? "text-[24px] sm:text-[28px]" : undefined}>{money}</span>} />;
  }
  return <MkTile href={v.href} period={v.period} title={v.title} icon={v.icon} tone={v.tone} value={tile.value} />;
}

/**
 * Accueil de l'espace Marketing, comme celui de l'application LeadConnector : les chiffres du jour et du mois,
 * les applications épinglées (choisies sur cet appareil) et les gestes les plus fréquents.
 */
export default async function AccueilPage() {
  const crm = await crmPage("marketing_espace");
  const { profile, user } = crm.session;
  const can = (m: ModuleKey) => canAccess(profile, m);
  const settings = await crm.store.settings().catch(() => null);
  const tiles = await homeTiles(crm, can, settings?.timezone ?? "Europe/Paris");
  const first = firstName(profile.display_name, user.email);

  const quick: Array<{ href: string; icon: LucideIcon; label: string }> = [
    ...(can("marketing_prospects") ? [{ href: "/marketing/crm/nouveau", icon: CirclePlus, label: "Ajouter un prospect" }] : []),
    ...(can("marketing_contacts") ? [{ href: "/marketing/contacts/nouveau", icon: UserPlus, label: "Ajouter un contact" }] : []),
    ...(can("marketing_taches") ? [{ href: "/marketing/taches?nouveau=1", icon: ListPlus, label: "Ajouter une tâche" }] : []),
    ...(can("marketing_classement") ? [{ href: "/marketing/paiements?onglet=kpi", icon: ClipboardPen, label: "Saisir mes KPI" }] : []),
    ...(can("marketing_prospects") ? [{ href: "/marketing/paiements", icon: CreditCard, label: "Liens de paiement" }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 lg:space-y-5">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-[20px] font-semibold text-mk-strong">Bienvenue{first ? `, ${first}` : ""}</h1>
        <RefreshButton />
      </div>
      {tiles.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{tiles.map((t) => <Tile key={t.key} tile={t} />)}</div>
      ) : null}
      <PinnedApps apps={appsFor(can, isAdmin(crm.session))} defaults={DEFAULT_PINNED} />
      {quick.length ? (
        <MkCard title="Actions rapides">
          <MkRoundGrid>{quick.map((q) => <MkRoundLink key={q.href} href={q.href} icon={q.icon} label={q.label} />)}</MkRoundGrid>
        </MkCard>
      ) : null}
    </div>
  );
}
