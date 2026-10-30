"use client";
import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";

/**
 * Lit les jetons du fragment (#access_token=…&refresh_token=…&type=invite|magiclink|recovery),
 * ouvre la session dans le navigateur (cookies lus ensuite par le serveur) puis redirige :
 * un invité ou une récupération passe par /bienvenue pour choisir un mot de passe.
 */
export function FinishClient({ next }: { next: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // hors du corps synchrone de l'effet
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const type = params.get("type");
      if (params.get("error") || !access_token || !refresh_token) { if (!cancelled) setFailed(true); return; }
      const { error } = await createClient().auth.setSession({ access_token, refresh_token });
      if (cancelled) return;
      if (error) { setFailed(true); return; }
      window.history.replaceState(null, "", window.location.pathname); // les jetons ne restent pas dans l'historique
      const target = type === "invite" || type === "recovery" ? `/bienvenue?next=${encodeURIComponent(next)}` : next;
      window.location.assign(target);
    })();
    return () => { cancelled = true; };
  }, [next]);

  if (failed) {
    return (
      <div className="w-full max-w-[380px] space-y-4 text-center animate-rise">
        <h1 className="text-[22px] font-semibold tracking-tight">Ce lien n&apos;est plus valide</h1>
        <p className="text-[14px] text-muted">Il a peut-être expiré ou déjà servi. Demande un nouveau lien de connexion.</p>
        <Link href="/login" className={buttonVariants({ variant: "primary", size: "lg", className: "w-full" })}>Retour à la connexion</Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 text-[14px] text-muted animate-rise" role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" />Connexion en cours…
    </div>
  );
}
