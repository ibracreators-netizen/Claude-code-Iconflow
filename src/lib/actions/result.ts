import { humanError } from "@/lib/data/store";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Enveloppe standard des server actions : jamais d'exception vers le client, toujours un message français. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (typeof err === "object" && err && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw err;
    return { ok: false, error: humanError(err) };
  }
}
