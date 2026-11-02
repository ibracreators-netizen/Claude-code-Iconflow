import type { AvailabilityWindow, MarketingSettings } from "./types";

/**
 * Calcul des créneaux de réservation. Les heures de disponibilité sont exprimées dans le fuseau configuré ;
 * chaque créneau est renvoyé en UTC. Le changement d'heure est géré en recalculant le décalage du fuseau
 * pour chaque instant (pas de décalage fixe). Fonctions pures, testables sans réseau.
 */

export interface Slot { start: string; end: string } // UTC ISO

const pad = (n: number) => String(n).padStart(2, "0");

/** Décalage (ms) du fuseau `tz` à l'instant `date` : utc = local - offset. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

/** Instant UTC d'une heure locale (fuseau `tz`), changement d'heure géré (double passe). */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let off = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off;
  // Deuxième passe : si on tombe sur une bascule DST, l'offset de l'instant corrigé peut différer.
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off) { off = off2; utc = guess - off; }
  return new Date(utc);
}

/** Parties calendaires d'un instant dans le fuseau `tz`. */
export function partsInZone(date: Date, tz: string): { y: number; mo: number; d: number; h: number; mi: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const wmap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour === "24" ? "0" : p.hour), mi: Number(p.minute), weekday: wmap[p.weekday] ?? 0 };
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

/**
 * Créneaux libres entre `fromUtc` et `fromUtc + days`, selon les réglages et les plages occupées (UTC).
 * Renvoie [] si la configuration est incomplète (aucune disponibilité présupposée).
 */
export function computeSlots(settings: MarketingSettings, fromUtc: Date, days: number, busy: Array<{ start: string; end: string }>): Slot[] {
  const { availability, slot_minutes, timezone, min_notice_hours } = settings;
  if (!slot_minutes || slot_minutes <= 0 || !availability.length) return [];
  const notAfter = new Date(fromUtc.getTime() + days * 86400000);
  const earliest = new Date(fromUtc.getTime() + Math.max(0, min_notice_hours) * 3600000);
  const busyRanges = busy.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const);
  const out: Slot[] = [];
  // On parcourt chaque jour calendaire du fuseau configuré.
  for (let i = 0; i <= days; i++) {
    const dayAnchor = new Date(fromUtc.getTime() + i * 86400000);
    const { y, mo, d, weekday } = partsInZone(dayAnchor, timezone);
    const windows = availability.filter((w: AvailabilityWindow) => w.weekday === weekday);
    for (const w of windows) {
      const startMin = toMin(w.start), endMin = toMin(w.end);
      for (let m = startMin; m + slot_minutes <= endMin; m += slot_minutes) {
        const s = zonedTimeToUtc(y, mo, d, Math.floor(m / 60), m % 60, timezone);
        const e = new Date(s.getTime() + slot_minutes * 60000);
        if (s < earliest || s >= notAfter) continue;
        const overlaps = busyRanges.some(([bs, be]) => s.getTime() < be && e.getTime() > bs);
        if (overlaps) continue;
        out.push({ start: s.toISOString(), end: e.toISOString() });
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Libellé lisible d'un créneau dans le fuseau configuré (ex. « lun. 10 nov. · 10:00 »). */
export function formatSlot(startIso: string, tz: string): string {
  const d = new Date(startIso);
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);
  const { h, mi } = partsInZone(d, tz);
  return `${date} · ${pad(h)}:${pad(mi)}`;
}

/** Date + heure d'un instant dans un fuseau (ex. « lun. 10 nov. 2026, 10:00 »). Pure, utilisable côté client. */
export function formatDateTimeInZone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
