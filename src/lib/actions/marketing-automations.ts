"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions/result";
import { getStoreFor } from "@/lib/auth/session";
import { crmAction, isAdmin } from "@/lib/marketing/crm-server";
import { mergeAutomations, type AutomationSettings } from "@/lib/marketing/automations";
import { logEvent } from "@/lib/marketing/crm";
import type { Contact, Prospect } from "@/lib/marketing/types";

const rev = () => { revalidatePath("/marketing", "layout"); };

/** Enregistre les interrupteurs et les délais des six règles (valeurs bornées côté serveur). */
export async function saveAutomationsAction(input: AutomationSettings) {
  return run(async () => {
    const c = await crmAction("marketing_reglages");
    const clean = mergeAutomations(input);
    await c.db.saveSetting("automations", clean);
    rev(); return clean;
  });
}

/** Tâches posées dans Studio à la création d'un client depuis le CRM, dans cet ordre. Modifiables ensuite dans Studio › Tâches. */
const ONBOARDING_TASKS = ["Appel de lancement avec le client", "Récupérer les accès (compte publicitaire, site, visuels)", "Remplir le Brain du client", "Inviter le client sur son portail"];

interface Proposal { id: string; prospect_id: string; status: "en_attente" | "cree" | "ignoree"; client_id: string | null }
/**
 * Règle 6, dernière étape : l'administrateur valide (le client est créé dans Studio) ou écarte la proposition.
 * C'est le seul endroit où l'espace Marketing écrit dans Studio, et seulement sur ce clic.
 */
export async function decideClientProposalAction(id: string, decision: "creer" | "ignorer") {
  return run(async () => {
    const c = await crmAction("marketing_prospects");
    if (!isAdmin(c.session)) throw new Error("Créer un client dans Studio est réservé à l'administrateur.");
    const proposal = await c.db.get<Proposal>("marketing_client_proposals", id);
    if (!proposal) throw new Error("Proposition introuvable.");
    if (proposal.status !== "en_attente") throw new Error("Cette proposition a déjà été traitée.");
    const stamp = { decided_by: c.session.user.id, decided_at: new Date().toISOString() };
    if (decision === "ignorer") {
      await c.db.update("marketing_client_proposals", id, { status: "ignoree", ...stamp });
      await logEvent(c.db, proposal.prospect_id, "automatisation", { regle: "6. Signé", detail: "Création du client dans Studio écartée" });
      rev(); return { clientId: null as string | null, tasks: 0, brief: false };
    }
    const prospect = await c.db.get<Prospect>("marketing_prospects", proposal.prospect_id);
    if (!prospect) throw new Error("Le prospect n'existe plus.");
    const contact = prospect.contact_id ? await c.db.get<Contact>("marketing_contacts", prospect.contact_id) : null;
    const name = (contact?.company ?? contact?.name ?? prospect.name ?? "").trim();
    if (!name) throw new Error("Renseigne le nom ou l'entreprise du contact avant de créer le client.");
    const studio = await getStoreFor("clients");
    const client = await studio.createClient({ name, contact_email: contact?.email ?? prospect.email ?? undefined }).catch((e: unknown) => {
      if (/23505|duplicate key/i.test(String((e as { message?: string })?.message ?? e))) throw new Error(`Un client « ${name} » existe déjà dans Studio. Vérifie-le dans Studio, puis ignore cette proposition.`);
      throw e;
    });
    await c.db.update("marketing_client_proposals", id, { status: "cree", client_id: client.id, ...stamp });
    // Le client arrive prêt à démarrer : ses tâches d'onboarding et un premier brief vide. Best-effort : si l'une
    // de ces créations échoue, le client reste créé et l'app dit ce qui manque.
    let tasks = 0, brief = false;
    const due = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    for (const [i, title] of ONBOARDING_TASKS.entries()) {
      try { await studio.createTask({ title, client_id: client.id, labels: ["Onboarding"], due_date: due(2 + i * 2), assignee_id: c.session.user.id }); tasks++; } catch { /* suite */ }
    }
    try { await studio.createBrief({ client_id: client.id, month: new Date().toISOString().slice(0, 7), kind: "video", title: `Premier brief · ${client.name}` }); brief = true; } catch { /* suite */ }
    await logEvent(c.db, proposal.prospect_id, "automatisation", { regle: "6. Signé", detail: `Client « ${client.name} » créé dans Studio · ${tasks} tâche${tasks > 1 ? "s" : ""} d'onboarding${brief ? " · premier brief ouvert" : ""}` });
    rev(); revalidatePath("/studio", "layout");
    return { clientId: client.id as string | null, tasks, brief };
  });
}
