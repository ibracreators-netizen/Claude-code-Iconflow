import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { IA_STATUS } from "@/lib/data/types";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ClientChip } from "@/components/shared/client-chip";
import { nameMap } from "../_prod/params";
import { NewIaPlanDialog } from "./ia-list-client";

export const metadata: Metadata = { title: "IA Process" };

export default async function IaPage() {
  const store = await requireAgency("briefs");
  const [plans, clients] = await Promise.all([store.iaPlans(), store.clients()]);
  const clientName = nameMap(clients, (c) => c.name);
  const opts = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader eyebrow="Production" title="IA Process"
        description="Plans de production vidéo IA : parties, prompts Wan 3.0, générations Pletor, contrôle qualité et livraison."
        actions={<NewIaPlanDialog clients={opts} />} />

      {plans.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id} className="card flex flex-col p-4">
              <Link href={`/studio/ia/${p.id}`} className="block">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] font-semibold text-accent-2">{p.code}</span>
                  <Badge tone={p.status === "livre" ? "success" : p.status === "brouillon" ? "neutral" : "accent"}>{IA_STATUS[p.status]}</Badge>
                </div>
                <h3 className="mt-1 truncate text-[15px] font-semibold">{p.title}</h3>
                <p className="mt-0.5 text-[12.5px] text-muted">{p.data.parts.length} partie{p.data.parts.length > 1 ? "s" : ""}{p.public_token ? " · lien public actif" : ""}</p>
              </Link>
              <div className="mt-3"><ClientChip name={clientName[p.client_id] ?? "Client"} href={`/studio/clients/${p.client_id}`} /></div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card"><EmptyState icon={Sparkles} title="Aucun plan IA" description="Crée un plan de production vidéo IA pour un concept. Tu pourras le remplir à la main ou coller un bloc JSON."
          action={<NewIaPlanDialog clients={opts} />} /></div>
      )}
    </>
  );
}
