import { notFound } from "next/navigation";
import { requireAgency } from "@/lib/auth/session";
import { DocumentEditor } from "./editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const store = await requireAgency("documents"); const doc = await store.document(id);
  return { title: doc ? `${doc.icon} ${doc.title}` : "Document" };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await requireAgency("documents");
  const doc = await store.document(id);
  if (!doc) notFound();
  const [clients, profiles] = await Promise.all([store.clients({ includeArchived: true }), store.profiles()]);
  const author = profiles.find((p) => p.id === doc.author_id)?.display_name ?? null;
  return <DocumentEditor key={doc.id} doc={doc} clients={clients.map((c) => ({ id: c.id, name: c.name }))} authorName={author} />;
}
