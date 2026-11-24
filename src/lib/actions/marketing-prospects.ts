"use server";
import { run } from "@/lib/actions/result";
import { crmAction } from "@/lib/marketing/crm-server";
import { listStages } from "@/lib/marketing/crm";
import type { Contact, Prospect } from "@/lib/marketing/types";

/** Contact trouvé depuis la page « Ajouter un prospect », avec son affaire en cours s'il en a une. */
export interface ContactHit { id: string; name: string | null; email: string | null; phone: string | null; company: string | null; openDeal: { id: string; stage: string | null } | null }

/**
 * Cherche un contact par nom, email ou téléphone (8 au plus), sous les mêmes droits que la liste des prospects :
 * un setter ou un closer ne trouve que les siens. Le téléphone se cherche aussi sous sa forme normalisée
 * (« 06 12 34 » retrouve « +33 6 12 34 56 78 »).
 */
export async function searchContactsAction(q: string) {
  return run(async (): Promise<ContactHit[]> => {
    const c = await crmAction("marketing_prospects");
    const text = String(q ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 80);
    if (text.length < 2) return [];
    const columns = "id,name,email,phone,company,created_at";
    const digits = text.replace(/\D/g, "");
    const [byText, byPhone] = await Promise.all([
      c.db.list<Contact>("marketing_contacts", { where: [["search", ["name", "email", "phone", "company"], text]], order: ["created_at", "desc"], limit: 8, columns }),
      digits.length >= 4 && digits.length >= text.replace(/\s/g, "").length - 1
        ? c.db.list<Contact>("marketing_contacts", { where: [["search", ["phone_norm"], digits.startsWith("0") ? digits.slice(1) : digits]], order: ["created_at", "desc"], limit: 8, columns })
        : Promise.resolve([] as Contact[]),
    ]);
    const seen = new Set<string>();
    const hits = [...byText, ...byPhone].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, 8);
    if (!hits.length) return [];
    // L'affaire « en cours » (ni gagnée, ni perdue) : c'est elle qui sera complétée plutôt que doublée.
    const [deals, stages] = await Promise.all([
      c.db.list<Pick<Prospect, "id" | "contact_id" | "stage_id">>("marketing_prospects", { where: [["in", "contact_id", hits.map((h) => h.id)]], order: ["created_at", "desc"], columns: "id,contact_id,stage_id,created_at" }),
      listStages(c.db, { includeInactive: true }),
    ]);
    const byId = new Map(stages.map((s) => [s.id, s]));
    return hits.map((h) => {
      const open = deals.find((d) => d.contact_id === h.id && (!d.stage_id || byId.get(d.stage_id)?.kind === "ouvert"));
      return { id: h.id, name: h.name ?? null, email: h.email ?? null, phone: h.phone ?? null, company: h.company ?? null, openDeal: open ? { id: open.id, stage: open.stage_id ? byId.get(open.stage_id)?.name ?? null : null } : null };
    });
  });
}
