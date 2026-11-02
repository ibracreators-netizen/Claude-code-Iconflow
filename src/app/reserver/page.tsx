import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { publicBookingData } from "@/lib/marketing/public";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Réserver un échange · icon-flow", robots: { index: false, follow: false } };

export default async function ReserverPage() {
  const data = await publicBookingData();
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:py-20">
        <div className="mb-8 text-center">
          <div className="text-[24px] font-semibold tracking-[-0.035em] text-fg">iconflow<span className="text-accent-2">.</span></div>
          <h1 className="mt-5 text-[26px] font-semibold tracking-tight">Réservez un échange</h1>
          <p className="mt-2 text-[14.5px] text-muted">20 minutes pour voir si on peut vous aider. Sans engagement.</p>
        </div>
        <div className="card p-6">
          {data.enabled && data.slots.length ? (
            <BookingForm slots={data.slots} timezone={data.timezone} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CalendarClock className="size-8 text-muted" />
              <p className="text-[15px] font-medium">Aucun créneau disponible pour le moment</p>
              <p className="text-[13px] text-muted">{data.enabled ? "Revenez bientôt : de nouveaux créneaux seront ouverts." : "La réservation en ligne n'est pas ouverte actuellement."}</p>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-[11.5px] text-muted-2">icon-flow.fr</p>
      </div>
    </main>
  );
}
