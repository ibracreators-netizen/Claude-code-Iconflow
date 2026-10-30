"use server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Invoice } from "@/lib/data/types";

const refresh = (id?: string) => { revalidatePath("/studio/factures"); revalidatePath("/app/factures"); if (id) revalidatePath(`/studio/factures/${id}`); };

export async function createInvoice(input: Pick<Invoice, "client_id" | "type"> & Partial<Pick<Invoice, "lines" | "notes" | "issue_date" | "due_date" | "status">>) {
  return run(async () => { const s = await getStore(); const r = await s.createInvoice(input); refresh(); return r; });
}
export async function updateInvoice(id: string, patch: Partial<Pick<Invoice, "lines" | "notes" | "issue_date" | "due_date" | "type" | "client_id">>) {
  return run(async () => { const s = await getStore(); const r = await s.updateInvoice(id, patch); refresh(id); return r; });
}
export async function setInvoiceStatus(id: string, status: Invoice["status"]) {
  return run(async () => { const s = await getStore(); const r = await s.updateInvoice(id, { status }); refresh(id); return r; });
}
export async function deleteInvoice(id: string) {
  return run(async () => { const s = await getStore(); await s.deleteInvoice(id); refresh(); });
}
