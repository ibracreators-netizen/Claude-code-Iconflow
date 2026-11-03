import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { emptyIaBrandSettings, type IaBrandSettings } from "@/lib/data/types";
import { IaPlanClient } from "./ia-plan-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const store = await requireAgency("briefs");
  const p = await store.iaPlan(id);
  return { title: p ? `${p.title} · IA Process` : "Dossier IA" };
}

export default async function IaPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireAgency("briefs");
  const plan = await store.iaPlan(id);
  if (!plan) notFound();
  const [dossier, client] = await Promise.all([store.brandDossier(plan.client_id), store.client(plan.client_id)]);
  const brand = (((dossier?.data as Record<string, unknown> | undefined)?.ia) as IaBrandSettings | undefined) ?? emptyIaBrandSettings();

  return (
    <>
      <div className="mb-4 flex items-center gap-2 text-[12.5px] text-muted">
        <Link href="/studio/ia" className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowLeft />IA Process</Link>
        <span className="text-muted-2">/</span><span className="truncate font-medium text-fg-2">{plan.title}</span>
      </div>
      <IaPlanClient plan={plan} brand={brand} clientId={plan.client_id} clientName={client?.name ?? "Client"} />
    </>
  );
}
