/** Helpers de lecture des searchParams (Next 16 : Promise). */
export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
export function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
export function monthParam(v: string | string[] | undefined) { const m = one(v); return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : currentMonth(); }
export function nameMap<T extends { id: string }>(rows: T[], pick: (r: T) => string) { return Object.fromEntries(rows.map((r) => [r.id, pick(r)])) as Record<string, string>; }
export const todayIso = () => new Date().toISOString().slice(0, 10);
