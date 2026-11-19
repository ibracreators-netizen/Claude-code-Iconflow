"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, salesRole } from "@/lib/marketing/crm-server";
import { zonedTimeToUtc } from "@/lib/marketing/slots";
import type { Contact, Prospect } from "@/lib/marketing/types";
import { isDay } from "./dates";

/* Calendrier : trouver le prospect d'un nouveau rendez-vous, puis le réserver. Annuler ou déplacer se fait depuis la fiche du prospect. */

const rev = () => { revalidatePath("/marketing", "layout"); };

export interface BookingHit { id: string; name: string; sub: string | null }

/** Prospects proposés dans « Nouveau rendez-vous » : recherche sur le nom, l'email, le téléphone. Sans texte : les plus récents. */
export async function searchBookingProspectsAction(q: string) {
  return run(async (): Promise<BookingHit[]> => {
    const c = await crmAction("marketing_calendrier");
    const text = String(q ?? "").trim().slice(0, 80);
    const [direct, people] = await Promise.all([
      c.db.list<Prospect>("marketing_prospects", { where: text ? [["search", ["name", "email", "phone", "title"], text]] : [], order: ["created_at", "desc"], limit: 12 }),
      text ? c.db.list<Contact>("marketing_contacts", { where: [["search", ["name", "email", "phone", "company"], text]], limit: 12 }).catch(() => [] as Contact[]) : Promise.resolve([] as Contact[]),
    ]);
    const viaContact = people.length ? await c.db.list<Prospect>("marketing_prospects", { where: [["in", "contact_id", people.map((p) => p.id)]], order: ["created_at", "desc"], limit: 12 }) : [];
    const prospects = [...new Map([...direct, ...viaContact].map((p) => [p.id, p])).values()].slice(0, 12);
    const missing = [...new Set(prospects.map((p) => p.contact_id).filter((id): id is string => !!id && !people.some((x) => x.id === id)))];
    const extra = missing.length ? await c.db.list<Contact>("marketing_contacts", { where: [["in", "id", missing]], limit: missing.length }).catch(() => [] as Contact[]) : [];
    const contacts = new Map([...people, ...extra].map((x) => [x.id, x]));
    return prospects.map((p) => {
      const ct = p.contact_id ? contacts.get(p.contact_id) : undefined;
      return { id: p.id, name: ct?.name ?? p.name ?? ct?.email ?? p.email ?? "Prospect", sub: [ct?.email ?? p.email, ct?.phone ?? p.phone].filter(Boolean).join(" · ") || null };
    });
  });
}

/**
 * Réserve un rendez-vous à une date et une heure du fuseau des réglages (pas celui du navigateur).
 * Le prospect doit être visible par le membre : un setter ou un closer ne réserve que pour les siens.
 * Le chevauchement avec un autre rendez-vous pris dans l'app est refusé par la base.
 */
export async function bookFromCalendarAction(input: { prospect_id: string; day: string; time: string; minutes: number; meeting_url?: string | null }) {
  return run(async () => {
    const c = await crmAction("marketing_calendrier");
    const day = String(input.day ?? ""), time = String(input.time ?? "");
    const hm = /^(\d{2}):(\d{2})$/.exec(time);
    if (!isDay(day) || !hm || Number(hm[1]) > 23 || Number(hm[2]) > 59) throw new Error("Choisis une date et une heure.");
    const minutes = Math.round(Number(input.minutes));
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 480) throw new Error("La durée doit aller de 5 minutes à 8 heures.");
    const link = String(input.meeting_url ?? "").trim();
    if (link && !/^https?:\/\/\S+$/i.test(link)) throw new Error("Le lien visio doit commencer par https://");
    if (link.length > 400) throw new Error("Le lien visio est trop long.");
    const p = input.prospect_id ? await c.db.get<Prospect>("marketing_prospects", String(input.prospect_id)) : null;
    if (!p) throw new Error("prospect_not_found");

    const tz = (await c.store.settings()).timezone;
    const [y, mo, d] = day.split("-").map(Number);
    const start = zonedTimeToUtc(y, mo, d, Number(hm[1]), Number(hm[2]), tz), end = new Date(start.getTime() + minutes * 60_000);
    const appt = await c.store.book({ prospect_id: p.id, starts_at: start.toISOString(), ends_at: end.toISOString(), meeting_url: link || null });

    // Le rendez-vous reprend le contact et les responsables du prospect (un setter ou un closer qui réserve en devient responsable s'il n'y en a pas).
    const role = salesRole(c.session), me = c.session.user.id;
    const patch: Record<string, string> = {};
    if (p.contact_id) patch.contact_id = p.contact_id;
    const setter = p.setter_id ?? (role === "setter" ? me : null), closer = p.closer_id ?? (role === "closer" ? me : null);
    if (setter) patch.setter_id = setter;
    if (closer) patch.closer_id = closer;
    if (Object.keys(patch).length) await c.db.update("marketing_appointments", appt.id, patch).catch((e) => console.error("[calendrier] rendez-vous non complété", e instanceof Error ? e.message : e));
    rev();
    return { day, members: [setter, closer].filter((x): x is string => !!x) };
  });
}
