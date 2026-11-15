import type { Metadata } from "next";
import { requireMarketing } from "@/lib/marketing/session";
import { readBeat } from "@/lib/marketing/inbox";
import { schedulerState } from "@/lib/marketing/inbox-core";
import { isMailerConfigured } from "@/lib/email/mailer";
import { PageHeader } from "@/components/ui/misc";
import { ReglagesForm, type SchedulerInfo } from "./reglages-form";

export const metadata: Metadata = { title: "Réglages marketing" };

const when = (iso: string | null | undefined, tz: string) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso)) : "jamais");

export default async function ReglagesPage() {
  const store = await requireMarketing("marketing_reglages");
  const [settings, beat] = await Promise.all([store.settings(), readBeat()]);
  const state = schedulerState(beat);
  const last = when(beat?.last_run_at, settings.timezone);
  const scheduler: SchedulerInfo = state === "ok"
    ? { tone: "ok", verdict: `actif · dernier passage le ${last}`, note: beat?.ok === false && beat.detail ? `Dernier passage avec un souci : ${beat.detail}` : "Toutes les minutes : il transforme les leads reçus en prospects. Il n'envoie aucun email aux prospects." }
    : state === "jamais"
      ? { tone: "warn", verdict: "jamais exécuté", note: "La tâche planifiée n'est pas installée, ou elle n'arrive pas à joindre l'app. Les leads reçus attendent dans Réception." }
      : { tone: "warn", verdict: `${state === "arrete" ? "arrêté" : "en retard"} · dernier passage le ${last}`, note: "Les leads reçus restent en sécurité dans Réception mais ne deviennent plus des prospects tout seuls. Une alerte est envoyée aux adresses ci-dessus quand il est arrêté." };
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Réglages" description="Disponibilités, réservation en ligne, rappels, relances et alertes. Aucune valeur n'est active tant que tu ne l'as pas réglée." />
      <ReglagesForm initial={settings} scheduler={scheduler} mailer={isMailerConfigured()} />
    </>
  );
}
