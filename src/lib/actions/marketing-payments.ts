"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, type Crm } from "@/lib/marketing/crm-server";
import {
  canEditPayments, MAX_ITEMS, parseDocuments, parseLinks, paymentLinkInput, PAYMENT_LINKS_KEY, salesDocumentInput, SALES_DOCUMENTS_KEY, validate,
  type PaymentLink, type PaymentLinkInput, type SalesDocument, type SalesDocumentInput,
} from "@/lib/marketing/payments";

/*
 * Page Paiements : liens de paiement et documents de vente, rangés dans deux réglages JSON (marketing_settings).
 * Dans l'application, ils suivent les droits de la page : on les lit et on les modifie seulement avec
 * « Prospects et paiements » ; l'écriture demande en plus d'être un membre de l'agence avec « Réglages marketing »
 * (la base exige la même chose pour écrire un réglage). Les commerciaux voient et copient.
 * Attention : la base, elle, laisse encore lire marketing_settings à tout compte qui a un module Marketing
 * (media buyer compris). N'y range pas un lien de contrat ouvert à quiconque a le lien, tant que la lecture
 * de ces deux clés n'est pas réservée à « Prospects et paiements » par une migration.
 */

const rev = () => { revalidatePath("/marketing/paiements"); };
const newId = () => globalThis.crypto.randomUUID();

async function editor(): Promise<Crm> {
  const c = await crmAction("marketing_prospects");
  if (!canEditPayments(c.session.profile)) throw new Error("Les liens de paiement et les documents sont gérés par l'administrateur. Tu peux les ouvrir et les copier.");
  return c;
}

/* ─── Liens de paiement ─── */

/** Crée un lien (sans `id`) ou modifie celui qui porte cet `id`. */
export async function savePaymentLinkAction(input: PaymentLinkInput) {
  return run(async () => {
    const c = await editor();
    const v = validate(paymentLinkInput, input);
    const list = parseLinks(await c.db.setting(PAYMENT_LINKS_KEY)), now = new Date().toISOString();
    let saved: PaymentLink;
    if (v.id) {
      const cur = list.find((l) => l.id === v.id);
      if (!cur) throw new Error("Ce lien n'existe plus. Actualise la page.");
      saved = { ...cur, name: v.name, url: v.url, price: v.price, note: v.note, active: v.active, updated_at: now };
      list.splice(list.indexOf(cur), 1, saved);
    } else {
      if (list.length >= MAX_ITEMS) throw new Error(`Tu as déjà ${MAX_ITEMS} liens : supprime ceux qui ne servent plus.`);
      saved = { id: newId(), name: v.name, url: v.url, price: v.price, currency: "EUR", active: v.active, note: v.note, created_at: now, created_by: c.session.user.id, updated_at: now };
      list.unshift(saved);
    }
    await c.db.saveSetting(PAYMENT_LINKS_KEY, list);
    rev(); return saved;
  });
}

export async function setPaymentLinkActiveAction(id: string, active: boolean) {
  return run(async () => {
    const c = await editor();
    const list = parseLinks(await c.db.setting(PAYMENT_LINKS_KEY)), cur = list.find((l) => l.id === id);
    if (!cur) throw new Error("Ce lien n'existe plus. Actualise la page.");
    cur.active = active === true; cur.updated_at = new Date().toISOString();
    await c.db.saveSetting(PAYMENT_LINKS_KEY, list);
    rev(); return cur;
  });
}

export async function deletePaymentLinkAction(id: string) {
  return run(async () => {
    const c = await editor();
    const list = parseLinks(await c.db.setting(PAYMENT_LINKS_KEY)), next = list.filter((l) => l.id !== id);
    if (next.length === list.length) throw new Error("Ce lien a déjà été supprimé.");
    await c.db.saveSetting(PAYMENT_LINKS_KEY, next);
    rev();
  });
}

/* ─── Documents et contrats ─── */

export async function saveSalesDocumentAction(input: SalesDocumentInput) {
  return run(async () => {
    const c = await editor();
    const v = validate(salesDocumentInput, input);
    const list = parseDocuments(await c.db.setting(SALES_DOCUMENTS_KEY)), now = new Date().toISOString();
    let saved: SalesDocument;
    if (v.id) {
      const cur = list.find((d) => d.id === v.id);
      if (!cur) throw new Error("Ce document n'existe plus. Actualise la page.");
      saved = { ...cur, name: v.name, kind: v.kind, url: v.url, note: v.note, updated_at: now };
      list.splice(list.indexOf(cur), 1, saved);
    } else {
      if (list.length >= MAX_ITEMS) throw new Error(`Tu as déjà ${MAX_ITEMS} documents : supprime ceux qui ne servent plus.`);
      saved = { id: newId(), name: v.name, kind: v.kind, url: v.url, note: v.note, created_at: now, created_by: c.session.user.id, updated_at: now };
      list.unshift(saved);
    }
    await c.db.saveSetting(SALES_DOCUMENTS_KEY, list);
    rev(); return saved;
  });
}

export async function deleteSalesDocumentAction(id: string) {
  return run(async () => {
    const c = await editor();
    const list = parseDocuments(await c.db.setting(SALES_DOCUMENTS_KEY)), next = list.filter((d) => d.id !== id);
    if (next.length === list.length) throw new Error("Ce document a déjà été supprimé.");
    await c.db.saveSetting(SALES_DOCUMENTS_KEY, next);
    rev();
  });
}
