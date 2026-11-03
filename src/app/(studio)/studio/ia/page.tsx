import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import type { IaConcept } from "@/lib/data/types";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ClientChip } from "@/components/shared/client-chip";
import { nameMap } from "../_prod/params";
import { NewIaPlanDialog } from "./ia-list-client";

export const metadata: Metadata = { title: "IA Process" };

function dossierBadge(concepts: IaConcept[]): { tone: "neutral" | "accent" | "success"; label: string } {
  if (!concepts.length) return { tone: "neutral", label: "Vide" };
  const livre = concepts.filter((c) => c.status === "livre").length;
  if (livre === concepts.length) return { tone: "success", label: "Livré" };
  const active = concepts.some((c) => c.status === "en_generation" || c.status === "prompts_valides");
  return active ? { tone: "accent", label: "En cours" } : { tone: "neutral", label: "Brouillon" };
}

export default async function IaPage() {
  const store = await requireAgency("briefs");
  const [plans, clients] = await Promise.all([store.iaPlans(), store.clients()]);
  const clientName = nameMap(clients, (c) => c.name);
  const opts = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader eyebrow="Production" title="IA Process"
        description="Dossiers de production vidéo IA. Un dossier contient autant de concepts qu'on veut — parties, prompts, générations Pletor, contrôle qualité — et se partage en ligne."
        actions={<NewIaPlanDialog clients={opts} />} />

      {plans.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            const concepts = p.data.concepts;
            const b = dossierBadge(concepts);
            return (
              <li key={p.id} className="card flex flex-col p-4">
                <Link href={`/studio/ia/${p.id}`} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-2"><Sparkles className="size-3.5" />Dossier</span>
                    <Badge tone={b.tone}>{b.label}</Badge>
                  </div>
                  <h3 className="mt-1 truncate text-[15px] font-semibold">{p.title}</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">{concepts.length} concept{concepts.length > 1 ? "s" : ""}{p.public_token ? " · lien public actif" : ""}</p>
                </Link>
                <div className="mt-3"><ClientChip name={clientName[p.client_id] ?? "Client"} href={`/studio/clients/${p.client_id}`} /></div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card"><EmptyState icon={Sparkles} title="Aucun dossier IA" description="Crée un dossier de production vidéo IA pour un client. Tu y ajouteras autant de concepts que tu veux, à la main ou en collant un bloc JSON."
          action={<NewIaPlanDialog clients={opts} />} /></div>
      )}
    </>
  );
}
