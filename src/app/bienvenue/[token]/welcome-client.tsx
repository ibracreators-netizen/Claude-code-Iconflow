"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, LogIn, Sparkles } from "lucide-react";
import { forgetOnboardingAction, openOnboardingAction, toggleWelcomeStepAction } from "@/lib/actions/marketing-onboarding";
import { useLocalPref } from "@/lib/hooks/use-local-pref";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { GONE, Neutral, PAUSED } from "./parts";

/** Style de l'espace Marketing, reposé après une navigation dans l'app (au chargement, le script du layout racine le pose déjà). */
export function MarketingLook() {
  React.useEffect(() => { document.documentElement.dataset.app = "marketing"; }, []);
  return null;
}

const FIELD = "h-14 w-full rounded-[12px] border bg-surface px-4 text-[17px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:ring-4";
const BIG_BUTTON = "inline-flex h-14 w-full items-center justify-center rounded-[14px] bg-accent px-4 text-[17px] font-semibold text-accent-fg shadow-[0_8px_20px_-8px_rgb(0_105_92/0.6)] transition active:scale-[0.99] disabled:opacity-60";

/**
 * Accueil du lien : la recrue tape l'e-mail que son responsable a enregistré pour elle. Un membre de l'équipe qui
 * n'est pas connecté à son compte sur cet appareil est invité à se connecter, puis revient ici.
 */
export function OpenForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [login, setLogin] = React.useState(false);
  const [closed, setClosed] = React.useState<"gone" | "paused" | null>(null);
  const [pending, start] = React.useTransition();
  const loginHref = `/login?next=${encodeURIComponent(`/bienvenue/${token}`)}`;
  const submit = () => {
    if (pending) return;
    if (!email.trim()) { setError("Tape ton e-mail."); setLogin(false); return; }
    setError(null); setLogin(false);
    start(async () => {
      const res = await openOnboardingAction(token, email.trim());
      if (res.ok) { router.refresh(); return; }
      if (res.closed) { setClosed(res.closed); return; }
      setError(res.error); setLogin(res.login === true);
    });
  };
  if (closed) return <Neutral {...(closed === "paused" ? PAUSED : GONE)} />;
  return (
    <section className="mt-6 lg:mt-10">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-2" aria-hidden><Sparkles className="size-7" strokeWidth={1.8} /></span>
      <h1 className="mt-5 text-[28px] font-semibold leading-tight tracking-[-0.01em] text-mk-strong">Bienvenue dans l&apos;équipe</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-mk-sub">Tape l&apos;e-mail que ton responsable a enregistré pour toi. Tu verras ton onboarding, tes SOPs et tes ressources.</p>
      <form className="mt-6 rounded-[16px] border border-mk-line bg-surface p-4 shadow-soft sm:p-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <label htmlFor="bv-email" className="block text-[16px] font-semibold text-mk-strong">Ton e-mail</label>
        <input id="bv-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={254}
          value={email} onChange={(e) => { setEmail(e.target.value); if (error) { setError(null); setLogin(false); } }} placeholder="prenom@exemple.fr" aria-invalid={error && !login ? true : undefined} aria-describedby={error ? "bv-email-error" : undefined}
          className={cn(FIELD, "mt-2", error && !login ? "border-mk-danger focus:ring-mk-danger/15" : "border-mk-input focus:border-accent focus:ring-accent/15")} />
        {error ? (
          <p id="bv-email-error" role="alert" className={cn("mt-3 rounded-[12px] border px-4 py-3 text-[15px] font-medium leading-snug",
            login ? "border-mk-line bg-mk-chip text-mk-strong" : "border-mk-danger/30 bg-[color-mix(in_oklab,var(--mk-danger)_8%,transparent)] text-mk-danger")}>{error}</p>
        ) : null}
        {login ? (
          <a href={loginHref} className={cn(BIG_BUTTON, "mt-4 gap-2")}><LogIn className="size-5" aria-hidden />Me connecter</a>
        ) : (
          <button type="submit" disabled={pending} className={cn(BIG_BUTTON, "mt-4")}>{pending ? "Vérification…" : "Ouvrir mon onboarding"}</button>
        )}
      </form>
      <p className="mt-4 text-center text-[14px] leading-relaxed text-mk-sub">Ton accès reste ouvert 30 jours sur cet appareil. Tu as un compte dans l&apos;app ? Connecte-toi d&apos;abord.</p>
    </section>
  );
}

export interface StepView { id: string; title: string; description: string | null; href: string | null }
/** Ids d'étapes gardés sur l'appareil (texte JSON) : toute valeur illisible vaut « rien de coché ». */
const parseIds = (raw: string): string[] => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } };

/**
 * Étapes de l'onboarding, à cocher. Membre de l'équipe (« m ») : la progression est enregistrée sur son profil.
 * Personne d'un lien de saisie (« l ») : elle n'a pas de profil, la progression reste sur cet appareil.
 */
export function OnboardingSteps({ token, kind, storageKey, steps, done }: { token: string; kind: "m" | "l"; storageKey: string; steps: StepView[]; done: string[] }) {
  const router = useRouter();
  const [stored, setStored] = useLocalPref(storageKey, "[]");
  const [server, setServer] = React.useState(done);
  const [seen, setSeen] = React.useState(done);
  if (seen !== done) { setSeen(done); setServer(done); }
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const checked = new Set(kind === "m" ? server : parseIds(stored));
  const n = steps.filter((s) => checked.has(s.id)).length;

  const toggle = async (id: string, on: boolean) => {
    setError(null);
    if (kind === "l") {
      const next = new Set(parseIds(stored)); if (on) next.add(id); else next.delete(id);
      setStored(JSON.stringify([...next].filter((x) => steps.some((s) => s.id === x))));
      return;
    }
    const before = server;
    setServer((l) => (on ? [...l.filter((x) => x !== id), id] : l.filter((x) => x !== id)));
    setBusy(id);
    const res = await toggleWelcomeStepAction(token, id, on);
    setBusy(null);
    if (!res.ok) { setServer(before); setError(res.error); if (res.expired) router.refresh(); }
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold text-mk-strong">Ta progression</span>
        <span className="text-[14px] text-mk-sub tabular-nums">{n} étape{n > 1 ? "s" : ""} sur {steps.length}</span>
      </div>
      <Progress value={steps.length ? Math.round((n / steps.length) * 100) : 0} className="h-2" />
      {kind === "l" ? <p className="mt-2 text-[13px] text-mk-sub">Ta progression est enregistrée sur cet appareil.</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-[12px] border border-mk-danger/30 bg-[color-mix(in_oklab,var(--mk-danger)_8%,transparent)] px-4 py-3 text-[14px] font-medium text-mk-danger">{error}</p> : null}
      <ol className="mt-4 overflow-hidden rounded-[12px] border border-mk-line">
        {steps.map((s, i) => {
          const on = checked.has(s.id);
          return (
            <li key={s.id} className="border-b border-mk-line last:border-b-0">
              <div className="flex items-start gap-3 px-3.5 py-3.5 sm:px-4">
                {/* Zone de 44 px autour du rond de 28 px ; toucher le titre (son libellé) coche aussi l'étape. */}
                <button id={`bv-step-btn-${s.id}`} type="button" role="checkbox" aria-checked={on} aria-labelledby={`bv-step-${s.id}`} disabled={busy === s.id} onClick={() => void toggle(s.id, !on)}
                  className="group -m-2 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-accent/25 disabled:opacity-60">
                  <span className={cn("flex size-7 items-center justify-center rounded-full border-2 transition group-active:scale-95", on ? "border-accent bg-accent text-accent-fg" : "border-mk-input bg-surface text-transparent group-hover:border-accent/70")}>
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <label id={`bv-step-${s.id}`} htmlFor={`bv-step-btn-${s.id}`} className={cn("block cursor-pointer select-none text-[16px] leading-snug", on ? "text-mk-sub line-through" : "font-semibold text-mk-strong")}>{i + 1}. {s.title}</label>
                  {s.description ? <p className="mt-0.5 text-[14px] leading-snug text-mk-sub">{s.description}</p> : null}
                  {s.href ? <Link href={s.href} className="mt-1.5 inline-flex min-h-9 items-center gap-0.5 text-[15px] font-semibold text-accent-2 hover:underline">Ouvrir le document<ChevronRight className="size-4" aria-hidden /></Link> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** « Ce n'est pas moi » : efface l'accès ouvert sur cet appareil et revient au formulaire. */
export function NotMe() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <p className="mt-8 text-center text-[15px] text-mk-sub">
      <button type="button" disabled={pending} onClick={() => start(async () => { await forgetOnboardingAction(); router.refresh(); })}
        className="inline-flex min-h-11 items-center px-2 font-semibold text-accent-2 underline-offset-2 hover:underline disabled:opacity-60">
        {pending ? "Un instant…" : "Ce n'est pas moi"}
      </button>
    </p>
  );
}
