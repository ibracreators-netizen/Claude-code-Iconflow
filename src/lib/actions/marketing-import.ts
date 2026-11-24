"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { crmAction, isAdmin, members } from "@/lib/marketing/crm-server";
import { importContacts, importOpportunities, type OpportunityMapping, type Rejected } from "@/lib/marketing/import-ghl";
import type { GhlContactRow, GhlOpportunityRow } from "@/lib/marketing/ghl";

export type ImportKind = "ghl_contacts" | "ghl_opportunites";
interface ImportRow { id: string; total: number; created: number; merged: number; rejected: number; report: { rejected?: Rejected[]; mapping?: OpportunityMapping } }

async function admin() {
  const crm = await crmAction("marketing_reglages");
  if (!isAdmin(crm.session)) throw new Error("L'import est réservé à l'administrateur.");
  return crm;
}

export async function startGhlImport(kind: ImportKind, filename: string, total: number, mapping?: OpportunityMapping) {
  return run(async () => {
    const crm = await admin();
    const row = await crm.db.insert<ImportRow>("marketing_imports", { kind, filename: filename.slice(0, 200), total, report: { rejected: [], mapping: mapping ?? null }, created_by: crm.session.user.id });
    return { id: row.id };
  });
}

/** Un lot de lignes (200 au plus). Le fichier est lu dans le navigateur et envoyé par lots : pas de limite de taille. */
export async function importGhlBatch(importId: string, kind: ImportKind, rows: Array<GhlContactRow | GhlOpportunityRow>, mapping?: OpportunityMapping) {
  return run(async () => {
    const crm = await admin();
    if (!Array.isArray(rows) || rows.length > 200) throw new Error("Lot invalide.");
    const res = kind === "ghl_contacts"
      ? await importContacts(crm.db, rows as GhlContactRow[])
      : await importOpportunities(crm.db, rows as GhlOpportunityRow[], mapping ?? { stages: {}, owners: {} }, await members());
    const cur = await crm.db.get<ImportRow>("marketing_imports", importId);
    if (cur) {
      const kept = [...(cur.report?.rejected ?? []), ...res.rejected].slice(0, 1000);
      await crm.db.update("marketing_imports", importId, { created: cur.created + res.created, merged: cur.merged + res.merged, rejected: cur.rejected + res.rejected.length, report: { ...cur.report, rejected: kept } });
    }
    return res;
  });
}

export async function finishGhlImport(importId: string) {
  return run(async () => { const crm = await admin(); await crm.db.update("marketing_imports", importId, { status: "termine" }); revalidatePath("/marketing", "layout"); });
}
