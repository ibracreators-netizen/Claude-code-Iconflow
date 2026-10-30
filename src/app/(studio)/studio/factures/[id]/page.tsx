import { notFound } from "next/navigation";
import { requireAgency } from "@/lib/auth/session";
import { InvoiceEditor } from "./editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const store = await requireAgency(); const inv = await store.invoice(id);
  return { title: inv ? inv.number : "Facture" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireAgency();
  const invoice = await store.invoice(id);
  if (!invoice) notFound();
  const client = await store.client(invoice.client_id);
  return <InvoiceEditor key={`${invoice.id}-${invoice.updated_at}`} invoice={invoice} client={client} />;
}
