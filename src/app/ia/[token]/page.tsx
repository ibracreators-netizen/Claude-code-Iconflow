import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicIaPlan } from "@/lib/data/public-ia";
import { PublicIaReader } from "./public-ia-reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const pub = await getPublicIaPlan(token);
  return pub ? { title: `${pub.plan.title} · ${pub.client?.name ?? "icon-flow"}`, robots: { index: false, follow: false } } : { title: "Dossier IA" };
}

export default async function PublicIaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pub = await getPublicIaPlan(token);
  if (!pub) notFound();
  return <PublicIaReader title={pub.plan.title} client={pub.client ? { name: pub.client.name, logo: pub.client.logo_url } : null} concepts={pub.plan.data.concepts} />;
}
