import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBrief } from "@/lib/data/public-brief";
import { BRIEF_KIND, type BriefConcept } from "@/lib/data/types";
import { BriefContent } from "../../(portal)/app/_components/brief-content";
import { PublicBriefReader } from "./public-reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const pub = await getPublicBrief(token);
  // Page publique partageable : on autorise l'aperçu (titre, pas d'indexation).
  return pub ? { title: `${pub.brief.title} · ${pub.client?.name ?? "icon-flow"}`, robots: { index: false, follow: false } } : { title: "Brief" };
}

export default async function PublicBriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pub = await getPublicBrief(token);
  if (!pub) notFound();
  const { brief, concepts, client } = pub;
  type Page = Pick<BriefConcept, "id" | "title" | "content">;
  // Les concepts sont la référence ; un brief sans concept (données antérieures) affiche son contenu historique.
  const pages: Page[] = concepts.length ? concepts : [{ id: "contenu", title: brief.title, content: brief.content }];

  // Chaque concept est rendu côté serveur, puis affiché dans le volet (sélection côté client, sans rechargement).
  const panels = pages.map((c) => <BriefContent key={c.id} brief={{ ...brief, content: c.content }} />);

  return (
    <PublicBriefReader
      title={brief.title}
      kindLabel={BRIEF_KIND[brief.kind]}
      scriptVersion={brief.script_version}
      client={client ? { name: client.name, logo: client.logo_url } : null}
      items={pages.map((c) => ({ id: c.id, title: c.title }))}
      panels={panels}
    />
  );
}
