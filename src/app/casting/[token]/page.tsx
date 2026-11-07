import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCasting } from "@/lib/data/public-casting";
import { CastingGallery } from "./casting-gallery";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const pub = await getPublicCasting(token);
  return pub?.client
    ? { title: `Casting · ${pub.client.name}`, robots: { index: false, follow: false } }
    : { title: "Casting" };
}

export default async function PublicCastingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pub = await getPublicCasting(token);
  if (!pub) notFound();
  const { client, avatars } = pub;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-5 py-10 sm:py-14">
      <header className="mb-6 flex items-center gap-3">
        {client?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.logo_url} alt="" width={40} height={40} className="size-10 rounded-lg object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-[13px] text-muted">{client?.name ?? "Casting"}</p>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Casting proposé</h1>
        </div>
        <span className="ml-auto text-[20px] font-semibold tracking-[-0.035em] text-fg">iconflow<span className="text-accent-2">.</span></span>
      </header>

      <p className="mb-6 text-[14px] text-muted">
        Les visages proposés pour incarner la marque. Choisissez ceux qui vous ressemblent — ceux que vous écartez sont retirés après 7 jours (restaurables avant).
      </p>

      <CastingGallery token={token} avatars={avatars} />

      <footer className="mt-10 border-t border-border pt-5 text-[12px] text-muted">Partagé via icon-flow.fr</footer>
    </main>
  );
}
