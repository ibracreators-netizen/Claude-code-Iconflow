import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { GoogleAccountView } from "@/lib/marketing/google/sync";
import { cn } from "@/lib/utils";
import { BTN_LIGHT, Code, Panel, Pill, type Tone } from "../kit";

export interface GoogleInfo {
  /** Google est configuré sur l'hébergeur (clés et base reliée). */
  ready: boolean;
  /** Projet de démonstration : pas de base, pas de connexion possible. */
  demo: boolean;
  /** Le compte Google du membre connecté (jamais le jeton). */
  account: GoogleAccountView;
  lastSync: string | null;
  /** Administrateur : les variables attendues, « lue » ou « manquante » seulement. */
  env: Array<{ name: string; read: boolean }> | null;
  /** Le membre peut ouvrir le Calendrier (c'est là qu'il relie son agenda). */
  canOpen: boolean;
}

/** Google Agenda : chacun relie son propre agenda dans Calendrier. Ici, l'état de ma connexion et le chemin pour la faire. */
export function GoogleCard({ info }: { info: GoogleInfo }) {
  const { account } = info;
  const [state, tone]: [string, Tone] = !info.ready ? [info.demo ? "demande une base reliée" : "pas encore configuré", "warn"]
    : !account.connected ? ["ton agenda n'est pas relié", "neutral"]
    : account.status === "invalide" ? ["à reconnecter", "warn"]
    : ["ton agenda est relié", "success"];
  return (
    <Panel title={<>Google Agenda<Pill tone={tone}>{state}</Pill></>}
      description="Chaque membre relie son propre agenda Google, une seule fois, dans Calendrier. Lecture seule : l'app affiche tes rendez-vous Google à côté des siens, elle n'écrit jamais dans Google."
      action={info.canOpen ? <Link href="/marketing/calendrier" className={cn(buttonVariants({ variant: "outline", size: "sm" }), BTN_LIGHT)}>{account.connected ? "Ouvrir le Calendrier" : "Relier mon agenda"}</Link> : null}>
      {info.demo ? null : account.connected ? (
        <p className="text-[14px] text-mk-text">
          Compte : <b className="font-semibold text-mk-strong">{account.email ?? "compte Google"}</b> · Dernière lecture : <b className="font-semibold text-mk-strong">{info.lastSync ?? "jamais"}</b>
          {account.lastError ? <span className="mt-0.5 block text-[13px] text-mk-warn">{account.lastError}</span> : null}
        </p>
      ) : !info.ready && info.env ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {info.env.map((v) => (
            <li key={v.name} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-mk-line p-3.5"><Code>{v.name}</Code><Pill tone={v.read ? "success" : "warn"}>{v.read ? "lue" : "manquante"}</Pill></li>
          ))}
        </ul>
      ) : !info.ready ? (
        <p className="text-[14px] text-mk-sub">Google n&apos;est pas encore configuré sur l&apos;hébergeur : demande à l&apos;administrateur.</p>
      ) : null}
    </Panel>
  );
}
