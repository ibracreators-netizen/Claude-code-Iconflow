"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { createContactAction } from "@/lib/actions/marketing-crm";
import { crmAction, isAdmin, systemDb } from "@/lib/marketing/crm-server";
import * as crm from "@/lib/marketing/crm";
import { contactFacets, contactPage, parseContactQuery } from "@/lib/marketing/contacts-server";
import type { Contact } from "@/lib/marketing/types";

const rev = () => { revalidatePath("/marketing", "layout"); };
const idList = (ids: unknown, max = 200) => [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))].slice(0, max);
const chunks = <X,>(list: X[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Page suivante de la liste (téléphone : « Charger plus »). `search` : les paramètres de l'adresse de la page. */
export async function moreContactsAction(search: string, offset: number) {
  return run(async () => {
    const c = await crmAction("marketing_contacts");
    const query = parseContactQuery(Object.fromEntries(new URLSearchParams(String(search ?? ""))));
    const tz = (await c.store.settings()).timezone;
    return contactPage(c, query, tz, { offset: Math.max(0, Math.min(Math.floor(Number(offset) || 0), 1_000_000)), limit: query.size });
  });
}

/** Étiquettes, sources et compteurs proposés par les filtres. */
export async function contactFacetsAction() {
  return run(async () => contactFacets(await crmAction("marketing_contacts")));
}

/** Ajoute une étiquette à plusieurs contacts (même règle que la modification d'une fiche : la chronologie de leurs prospects le note). */
export async function tagContactsAction(ids: string[], tag: string) {
  return run(async () => {
    const c = await crmAction("marketing_contacts");
    const [label] = crm.cleanTags([tag]);
    if (!label) throw new Error("Écris l'étiquette à ajouter.");
    const list = idList(ids);
    if (!list.length) throw new Error("Sélectionne au moins un contact.");
    let done = 0;
    for (const part of chunks(list, 8)) {
      await Promise.all(part.map(async (id) => {
        const cur = await c.db.get<Contact>("marketing_contacts", id);
        if (!cur || (cur.tags ?? []).includes(label)) return;
        await crm.updateContact(c.db, id, { tags: [...(cur.tags ?? []), label] });
        done++;
      }));
    }
    rev(); return { done, tag: label };
  });
}

/**
 * Supprime des contacts, définitivement. Réservé à l'administrateur, et seulement pour des fiches sans prospect :
 * un contact qui a une affaire garde son historique (supprimer d'abord le prospect).
 */
export async function deleteContactsAction(ids: string[]) {
  return run(async () => {
    const c = await crmAction("marketing_contacts");
    if (!isAdmin(c.session)) throw new Error("Supprimer un contact est réservé à l'administrateur.");
    const list = idList(ids);
    if (!list.length) throw new Error("Sélectionne au moins un contact.");
    const linked = new Set<string>();
    for (const part of chunks(list, 100))
      for (const p of await c.db.list<{ contact_id: string | null }>("marketing_prospects", { where: [["in", "contact_id", part]], columns: "contact_id" })) if (p.contact_id) linked.add(p.contact_id);
    if (linked.size) {
      throw new Error(list.length === 1
        ? "Ce contact a un prospect : supprime d'abord le prospect (page Prospects), puis le contact."
        : `${linked.size} contact${linked.size > 1 ? "s" : ""} sur ${list.length} ${linked.size > 1 ? "ont" : "a"} un prospect : retire-les de la sélection, ou supprime d'abord leurs prospects. Rien n'a été supprimé.`);
    }
    const sys = systemDb();
    for (const id of list) {
      await c.db.remove("marketing_contacts", id);
      // Lien avec l'import GoHighLevel retiré : si la fiche revient d'un import, elle sera recréée proprement.
      if (sys) await sys.removeWhere("marketing_external_refs", [["eq", "entity", "contact"], ["eq", "entity_id", id]]).catch(() => undefined);
    }
    rev(); return { done: list.length };
  });
}

/**
 * « Ajouter un contact » : prénom et nom assemblés, au moins un e-mail ou un téléphone.
 * Si une fiche existe déjà avec cet e-mail ou ce téléphone, elle est complétée (jamais de doublon) et `created` vaut false.
 */
export async function addContactAction(input: { firstName?: string; lastName?: string; email?: string; phone?: string; company?: string; tags?: string[]; source?: string }) {
  return run(async () => {
    const t = (v: unknown) => String(v ?? "").trim();
    const name = [t(input.firstName), t(input.lastName)].filter(Boolean).join(" ");
    const email = t(input.email), phone = t(input.phone);
    if (!email && !phone) throw new Error("Indique au moins un e-mail ou un téléphone.");
    if (email && !crm.normalizeEmail(email)) throw new Error("Cet e-mail n'est pas valide.");
    if (phone && phone.replace(/\D/g, "").length < 8) throw new Error("Ce numéro de téléphone est trop court.");
    const res = await createContactAction({ name: name || null, email: email || null, phone: phone || null, company: t(input.company) || null, tags: crm.cleanTags(input.tags ?? []), source: t(input.source) || undefined });
    if (!res.ok) throw new Error(res.error);
    return res.data;
  });
}
