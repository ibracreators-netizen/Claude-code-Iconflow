import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Check, UserRound } from "lucide-react";
import { getPublicCasting } from "@/lib/data/public-casting";

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
  const anyChosen = avatars.some((a) => a.chosen);

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
        Les visages proposés pour incarner la marque.{anyChosen ? " Ceux marqués « retenu » ont déjà été validés." : ""}
      </p>

      {avatars.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {avatars.map((a) => (
            <li key={a.id} className={`card overflow-hidden ${a.chosen ? "ring-1 ring-accent/50" : ""}`}>
              <div className="relative aspect-[4/5] bg-surface-2">
                {a.preview_url ? (
                  <Image src={a.preview_url} alt={`Portrait de ${a.name}`} fill unoptimized sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted"><UserRound className="size-8" /></div>
                )}
                {a.chosen ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg shadow"><Check className="size-3" />Retenu</span>
                ) : null}
              </div>
              <div className="p-3"><p className="truncate text-[13.5px] font-medium">{a.name}</p></div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card p-10 text-center text-[14px] text-muted">Aucun avatar pour l&apos;instant.</div>
      )}

      <footer className="mt-10 border-t border-border pt-5 text-[12px] text-muted">Partagé via icon-flow.fr</footer>
    </main>
  );
}
