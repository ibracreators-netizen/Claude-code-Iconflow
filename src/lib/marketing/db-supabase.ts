import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbError, type Db, type Filter, type ListOpts } from "./db";

const PAGE = 1000;
const like = (v: string) => v.replace(/[\\%_]/g, "\\$&");
// Dans un filtre « or », la virgule et les parenthèses séparent les conditions : on les retire du terme cherché.
const term = (v: string) => v.replace(/[%_,()\\*]/g, " ").trim();

/** Accès Supabase. Avec le client de session, la RLS s'applique ; avec la clé service (planificateur, sources), non. */
export class SupabaseDb implements Db {
  constructor(private sb: SupabaseClient, public readonly actor: string | null) {}

  private apply<Q>(query: Q, where: Filter[] = []): Q {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = query as any;
    for (const f of where) {
      switch (f[0]) {
        case "eq": q = f[2] == null ? q.is(f[1], null) : q.eq(f[1], f[2]); break;
        case "neq": q = q.neq(f[1], f[2]); break;
        case "in": q = q.in(f[1], f[2]); break;
        case "gte": q = q.gte(f[1], f[2]); break;
        case "gt": q = q.gt(f[1], f[2]); break;
        case "lte": q = q.lte(f[1], f[2]); break;
        case "lt": q = q.lt(f[1], f[2]); break;
        case "null": q = q.is(f[1], null); break;
        case "notnull": q = q.not(f[1], "is", null); break;
        case "ieq": q = q.ilike(f[1], like(f[2])); break;
        case "has": q = q.contains(f[1], [f[2]]); break;
        case "search": { const t = term(f[2]); if (t) q = q.or(f[1].map((c) => `${c}.ilike.%${t}%`).join(",")); break; }
      }
    }
    return q as Q;
  }

  async list<T>(table: string, opts: ListOpts = {}): Promise<T[]> {
    const out: T[] = [];
    const max = opts.limit ?? 20_000;
    // PostgREST rend 1 000 lignes au plus par appel : on pagine pour ne jamais tronquer en silence.
    for (let from = 0; from < max; from += PAGE) {
      let q = this.apply(this.sb.from(table).select("*"), opts.where);
      q = q.order(opts.order?.[0] ?? "created_at", { ascending: (opts.order?.[1] ?? "desc") === "asc" });
      const { data, error } = await q.range(from, Math.min(from + PAGE, max) - 1);
      if (error) throw new DbError(error.message, error.code);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }
  async get<T>(table: string, id: string): Promise<T | null> {
    const { data, error } = await this.sb.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw new DbError(error.message, error.code);
    return (data as T) ?? null;
  }
  async insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.from(table).insert(row).select("*").single();
    if (error || !data) throw new DbError(error?.message ?? "écriture impossible", error?.code);
    return data as T;
  }
  async update<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.from(table).update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw new DbError(error.message, error.code);
    if (!data) throw new DbError("not_found");
    return data as T;
  }
  async remove(table: string, id: string): Promise<void> {
    const { error } = await this.sb.from(table).delete().eq("id", id);
    if (error) throw new DbError(error.message, error.code);
  }
  async setting<T>(key: string): Promise<T | null> {
    const { data, error } = await this.sb.from("marketing_settings").select("value").eq("key", key).maybeSingle();
    if (error) throw new DbError(error.message, error.code);
    return (data?.value as T) ?? null;
  }
  async saveSetting(key: string, value: unknown): Promise<void> {
    const { error } = await this.sb.from("marketing_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new DbError(error.message, error.code);
  }
}
