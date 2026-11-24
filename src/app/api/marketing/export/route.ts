import { NextResponse, type NextRequest } from "next/server";
import { crmAction, isAdmin } from "@/lib/marketing/crm-server";
import { listStages } from "@/lib/marketing/crm";
import type { Contact, Prospect } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

// Une cellule qui commence par = + - @ serait lue comme une formule par un tableur : on la neutralise.
const cell = (v: unknown) => { let s = v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
const csv = (head: string[], rows: unknown[][]) => "\uFEFF" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");

/** Export CSV des contacts ou des prospects. Réservé à l'administrateur (accès complet). */
export async function GET(req: NextRequest) {
  const what = req.nextUrl.searchParams.get("quoi") === "prospects" ? "prospects" : "contacts";
  let crm;
  try { crm = await crmAction(what === "prospects" ? "marketing_prospects" : "marketing_contacts"); }
  catch { return NextResponse.json({ ok: false, error: "Accès refusé." }, { status: 403 }); }
  if (!isAdmin(crm.session)) return NextResponse.json({ ok: false, error: "L'export est réservé à l'administrateur." }, { status: 403 });

  const contacts = await crm.db.list<Contact>("marketing_contacts", { order: ["created_at", "asc"] });
  let body: string;
  if (what === "contacts") {
    body = csv(["Nom", "Email", "Téléphone", "Entreprise", "Étiquettes", "Source", "Dernière activité", "Créé le"],
      contacts.map((c) => [c.name, c.email, c.phone, c.company, c.tags, c.source, c.last_activity_at, c.created_at]));
  } else {
    const [prospects, stages] = await Promise.all([crm.db.list<Prospect>("marketing_prospects", { order: ["created_at", "asc"] }), listStages(crm.db, { includeInactive: true })]);
    const byContact = new Map(contacts.map((c) => [c.id, c])), byStage = new Map(stages.map((s) => [s.id, s.name]));
    body = csv(["Nom", "Email", "Téléphone", "Entreprise", "Étape", "Valeur", "Montant signé HT", "Résultat d'appel", "Issue", "Source", "Page d'entrée", "Campagne", "Créé le"],
      prospects.map((p) => { const c = p.contact_id ? byContact.get(p.contact_id) : null; return [c?.name ?? p.name, c?.email ?? p.email, c?.phone ?? p.phone, c?.company ?? p.marque, p.stage_id ? byStage.get(p.stage_id) : "", p.value, p.signed_amount, p.call_result, p.outcome, p.source, p.landing_page, p.utm?.utm_campaign, p.created_at]; }));
  }
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="iconflow-${what}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
