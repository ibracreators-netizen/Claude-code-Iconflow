import "server-only";
import type { Db } from "./db";
import { automationSettings, runTimedRules, sendsProspectEmails, type AutomationContext, type TimedSummary } from "./automations";
import { systemDb } from "./crm-server";
import { sendInternalAlert } from "./inbox";
import { teamForSystem } from "./team-system";
import type { Member } from "./types";

/** Contexte réel des automatisations : réglages, équipe, et l'envoi d'email interne (simulé sans service d'envoi). */
export async function automationContext(db: Db, members?: Member[]): Promise<AutomationContext> {
  return {
    settings: await automationSettings(db), members: members ?? await teamForSystem(),
    effects: {
      now: () => new Date(),
      notifyMember: async (member, subject, lines) => (member.email ? sendInternalAlert([member.email], `Iconflow Marketing : ${subject}`, lines, { key: `auto:${member.id}:${subject}:${new Date().toISOString().slice(0, 13)}` }) : { status: "aucun_destinataire" }),
    },
  };
}

/** Passage du planificateur : règles à délai (2 et 4). Dit aussi si la file d'emails doit avancer. */
export async function runAutomationsTick(): Promise<{ ran: boolean; summary: TimedSummary; outbox: boolean }> {
  const db = systemDb(), none = { ran: false, summary: { no_booking: 0, no_result: 0 }, outbox: false };
  if (!db) return none;
  const ctx = await automationContext(db);
  return { ran: true, summary: await runTimedRules(db, ctx), outbox: sendsProspectEmails(ctx.settings) };
}
