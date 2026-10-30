"use client";
import { useActionState, useState } from "react";
import { Building2, KeyRound, Mail, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { enterDemo, signInWithMagicLink, signInWithPassword, type AuthState } from "@/lib/actions/auth";

export function LoginForm({ configured, next }: { configured: boolean; next?: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwdState, pwdAction, pwdPending] = useActionState<AuthState, FormData>(signInWithPassword, null);
  const [magicState, magicAction, magicPending] = useActionState<AuthState, FormData>(signInWithMagicLink, null);

  return (
    <div className="mt-7 space-y-6">
      {configured ? (
        <>
          <div className="inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1">
            {[["password", "Mot de passe", KeyRound], ["magic", "Lien magique", Mail]].map(([k, label, Icon]) => {
              const I = Icon as typeof KeyRound;
              return (
                <button key={k as string} type="button" onClick={() => setMode(k as "password" | "magic")} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition ${mode === k ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg"}`}>
                  <I className="size-3.5" />{label as string}
                </button>
              );
            })}
          </div>
          {mode === "password" ? (
            <form action={pwdAction} className="space-y-4">
              <input type="hidden" name="next" value={next ?? "/"} />
              <Field label="Email"><Input name="email" type="email" autoComplete="username" placeholder="nom@entreprise.fr" required /></Field>
              <Field label="Mot de passe"><Input name="password" type="password" autoComplete="current-password" required /></Field>
              {pwdState?.error ? <p className="text-[13px] text-danger" role="alert">{pwdState.error}</p> : null}
              <Button type="submit" size="lg" className="w-full" loading={pwdPending}>Se connecter</Button>
            </form>
          ) : (
            <form action={magicAction} className="space-y-4">
              <input type="hidden" name="next" value={next ?? "/"} />
              <Field label="Email" hint="Tu recevras un lien de connexion valable 1 heure."><Input name="email" type="email" autoComplete="username" placeholder="nom@entreprise.fr" required /></Field>
              {magicState?.error ? <p className="text-[13px] text-danger" role="alert">{magicState.error}</p> : null}
              {magicState?.sent ? <p className="rounded-md bg-accent-soft px-3 py-2 text-[13px] text-accent-2" role="status">Lien envoyé. Vérifie ta boîte mail (et les spams).</p> : null}
              <Button type="submit" size="lg" className="w-full" loading={magicPending}>Recevoir le lien</Button>
            </form>
          )}
          <p className="text-[12.5px] text-muted">Les accès sont gérés par l&apos;agence. Un compte client est rattaché à son espace par Iconflow.</p>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-border-strong bg-surface-2/60 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><Sparkles className="size-4 text-accent-2" />Mode démo</div>
            <p className="mt-1 text-[13px] text-muted">Supabase n&apos;est pas encore configuré. Explore l&apos;interface avec des données fictives (réinitialisées au redémarrage).</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={enterDemo.bind(null, "agency", next)}>
              <Button type="submit" size="lg" className="w-full"><Building2 />Espace agence</Button>
            </form>
            <form action={enterDemo.bind(null, "client", next)}>
              <Button type="submit" size="lg" variant="secondary" className="w-full"><UserRound />Espace client</Button>
            </form>
          </div>
          <p className="text-[12px] text-muted-2">Pour connecter la vraie base : renseigne <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> et <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (voir docs/SETUP.md).</p>
        </div>
      )}
    </div>
  );
}
