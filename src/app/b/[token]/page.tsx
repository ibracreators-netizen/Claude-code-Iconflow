import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBrief } from "@/lib/data/public-brief";
import { BRIEF_KIND, type BriefConcept } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BriefContent } from "../../(portal)/app/_components/brief-content";

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
  const pages: Page[] = concepts.length ? concepts : [{ id: "contenu", title: brief.title, content: brief.content }];
  const multi = pages.length > 1;

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-7">
          <div className="flex items-center gap-2.5 text-[13px] text-muted">
            {client ? <><Avatar name={client.name} src={client.logo_url} size={24} square /><span className="font-medium text-fg-2">{client.name}</span><span className="text-muted-2">·</span></> : null}
            <span>Brief préparé par <span className="font-semibold text-accent-2">icon-flow</span></span>
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-[30px]">{brief.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <Badge tone="outline">{BRIEF_KIND[brief.kind]}</Badge>
            {multi ? <span>{pages.length} concepts</span> : null}
            <span>Version {brief.script_version}</span>
          </div>
        </header>

        {multi ? (
          <nav aria-label="Concepts" className="mb-6">
            <ol className="flex flex-wrap items-center gap-2">
              {pages.map((c, i) => (
                <li key={c.id}>
                  <a href={`#concept-${i + 1}`} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-fg-2 transition hover:border-border-strong hover:text-fg">
                    <span className="font-mono text-[11px] text-accent-2">{String(i + 1).padStart(2, "0")}</span><span className="max-w-[220px] truncate">{c.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="space-y-6">
          {pages.map((c, i) => (
            <section key={c.id} id={`concept-${i + 1}`} className="scroll-mt-6 space-y-4">
              {multi ? (
                <header className="flex items-center gap-3 pt-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[12px] font-semibold text-accent-fg" aria-hidden>{i + 1}</span>
                  <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold tracking-tight">{c.title}</h2>
                  <span className="shrink-0 text-[12px] tabular text-muted">Concept {i + 1} / {pages.length}</span>
                </header>
              ) : null}
              <BriefContent brief={{ ...brief, content: c.content }} />
            </section>
          ))}
        </div>

        <footer className="mt-12 flex items-center justify-between gap-3 border-t border-border pt-6 text-[12px] text-muted">
          <span>Partagé via Iconflow Studio</span>
          <a href="https://icon-flow.fr" className="font-medium text-fg-2 transition hover:text-accent-2" target="_blank" rel="noopener noreferrer">icon-flow.fr</a>
        </footer>
      </div>
    </main>
  );
}
