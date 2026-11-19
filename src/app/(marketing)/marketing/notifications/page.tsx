import type { Metadata } from "next";
import { CalendarClock, ChevronRight, ClipboardCheck, Flag, Inbox, ListTodo, ServerOff, type LucideIcon } from "lucide-react";
import { memberCrm, noticesFor, type NoticeKind } from "@/lib/marketing/home-server";
import { cn } from "@/lib/utils";
import { MkEmpty, MkRow } from "@/components/marketing/ui";

export const metadata: Metadata = { title: "Notifications" };

const DANGER = "bg-[color-mix(in_oklab,var(--mk-danger)_14%,transparent)] text-mk-danger";
const LINK = "bg-[color-mix(in_oklab,var(--mk-link)_14%,transparent)] text-mk-link";
const KIND: Record<NoticeKind, { icon: LucideIcon; tone: string }> = {
  planificateur: { icon: ServerOff, tone: DANGER },
  reception: { icon: Inbox, tone: DANGER },
  tache: { icon: ClipboardCheck, tone: "bg-mk-warn-soft text-mk-warn" },
  rdv: { icon: CalendarClock, tone: LINK },
  rdv_plus: { icon: CalendarClock, tone: LINK },
  actions: { icon: Flag, tone: "bg-mk-teal-soft text-mk-teal" },
  taches: { icon: ListTodo, tone: "bg-mk-teal-soft text-mk-teal" },
};

/**
 * Notifications (la cloche du cadre) : ce qui demande une action, comme la liste de LeadConnector.
 * Ouverte à tout membre de l'espace ; chaque ligne n'apparaît qu'avec le droit à la page où elle mène.
 */
export default async function NotificationsPage() {
  const m = await memberCrm();
  const tz = (await m.store.settings().catch(() => null))?.timezone ?? "Europe/Paris";
  const items = await noticesFor(m, tz);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <section aria-labelledby="mk-notifs" className="-mx-4 lg:mx-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:shadow-soft">
        <div className="lg:flex lg:items-center lg:gap-2 lg:border-b lg:border-mk-line lg:px-5 lg:py-4">
          <h1 id="mk-notifs" className="sr-only lg:not-sr-only lg:text-[17px] lg:font-semibold lg:text-mk-strong">Notifications</h1>
          {items.length ? <span className="hidden rounded-full bg-mk-chip px-2 py-0.5 text-[12px] font-semibold text-mk-text tabular lg:inline">{items.length}</span> : null}
        </div>
        {items.length ? (
          <ul>
            {items.map((n) => {
              const k = KIND[n.kind];
              return (
                <MkRow key={n.key} href={n.href} className="lg:pl-5 lg:pr-4"
                  leading={<span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", k.tone)}><k.icon className="size-5" strokeWidth={1.8} /></span>}
                  title={n.title} subtitle={n.subtitle} meta={n.when ?? undefined}
                  trailing={n.href ? <ChevronRight className="size-5 shrink-0 text-mk-icon" strokeWidth={1.8} /> : undefined} />
              );
            })}
          </ul>
        ) : (
          <div className="px-4 lg:p-5"><MkEmpty>Rien à signaler.</MkEmpty></div>
        )}
      </section>
    </div>
  );
}
