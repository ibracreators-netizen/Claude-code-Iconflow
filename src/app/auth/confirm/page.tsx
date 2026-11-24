import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { safeNext } from "@/lib/auth/redirects";
import { isConfirmType, TOKEN_HASH_RE, type ConfirmType } from "@/lib/auth/confirm-link";
import { confirmEmailLink } from "./actions";
import { ConfirmButton } from "./confirm-button";

// Le jeton est dans l'adresse : jamais indexée, jamais transmise à un autre site.
export const metadata: Metadata = { title: "Rejoindre IconFlow", robots: { index: false, follow: false }, referrer: "no-referrer" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const COPY: Record<ConfirmType, { title: string; text: string; button: string }> = {
  invite: { title: "Rejoins l'équipe", text: "Tu as été invité sur IconFlow. Appuie sur le bouton pour accepter l'invitation, puis choisis ton mot de passe.", button: "Accepter l'invitation" },
  magiclink: { title: "Connexion", text: "Appuie sur le bouton pour te connecter à IconFlow.", button: "Me connecter" },
  recovery: { title: "Nouveau mot de passe", text: "Appuie sur le bouton pour continuer, puis choisis ton nouveau mot de passe.", button: "Continuer" },
};

/**
 * Lien d'invitation ou de connexion envoyé par l'app (src/lib/auth/confirm-link.ts). La page ne fait rien toute seule :
 * une messagerie qui ouvre le lien pour le contrôler ne consomme donc pas le jeton. Il n'est vérifié qu'au clic.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tokenHash = one(sp.token_hash), type = one(sp.type), next = safeNext(one(sp.next));
  const valid = !one(sp.erreur) && TOKEN_HASH_RE.test(tokenHash) && isConfirmType(type);
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-[400px] animate-rise">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/brand/iconflow-logo-96.png" alt="" width={36} height={36} className="rounded-lg bg-[#0b100c]" priority />
          <span className="text-lg font-semibold tracking-tight">iconflow<span className="text-accent-2">.</span></span>
        </div>
        {valid ? (
          <>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{COPY[type as ConfirmType].title}</h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{COPY[type as ConfirmType].text}</p>
            <form action={confirmEmailLink} className="mt-7">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <ConfirmButton label={COPY[type as ConfirmType].button} />
            </form>
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Ce lien n&apos;est plus valide</h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">Il a peut-être expiré ou déjà servi. Demande à la personne qui t&apos;a invité de te renvoyer l&apos;invitation, ou connecte-toi si tu as déjà un mot de passe.</p>
            <Link href="/login" className={buttonVariants({ variant: "primary", size: "lg", className: "mt-7 w-full" })}>Aller à la connexion</Link>
          </>
        )}
      </div>
    </main>
  );
}
