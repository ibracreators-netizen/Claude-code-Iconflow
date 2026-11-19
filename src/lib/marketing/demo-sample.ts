/**
 * Données d'exemple pour les essais sur un ordinateur de développement, et seulement là : elles ne se chargent que si
 * MARKETING_DEMO_SAMPLE=1 est posé localement ET qu'aucune base n'est reliée. En ligne, l'espace lit la vraie base et
 * ce fichier n'est jamais utilisé. Les noms sont fictifs et chaque entreprise porte la mention « (exemple) ».
 */
import { DEFAULT_STAGES } from "./crm";
import type { Appointment, Contact, MarketingTask, Prospect, Stage, StageColor } from "./types";

const FIRST = ["Julie", "Karim", "Sophie", "Mehdi", "Claire", "Thomas", "Inès", "Lucas", "Amandine", "Yanis", "Nora", "Hugo", "Léa", "Samir", "Camille", "Maxime", "Sarah", "Nicolas", "Aïcha", "Romain", "Manon", "Bilal", "Chloé", "Antoine"];
const LAST = ["Martin", "Benali", "Durand", "Haddad", "Lefèvre", "Moreau", "Diallo", "Girard", "Rousseau", "Bernard", "Petit", "Fontaine", "Mercier", "Chevalier", "Lambert", "Faure"];
const SOURCES = ["FORM OPT-IN FUNNEL", "Formulaire site", "iClosed", "Import GHL", "Recommandation"];
const TAGS = ["webinar", "relancé", "chaud", "e-commerce", "beauté", "mode"];
const COLORS: StageColor[] = ["gris", "bleu", "violet", "jaune", "orange", "vert", "rouge"];

export function sampleMarketingData(now = new Date()) {
  let n = 0;
  const id = (p: string) => `${p}-ex${String(++n).padStart(3, "0")}`;
  const ago = (days: number, h = 10) => { const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const stages: Stage[] = DEFAULT_STAGES.map((s, i) => ({ ...s, id: id("st"), is_system: true, active: true, color: COLORS[i] }));
  const contacts: Contact[] = [], prospects: Prospect[] = [], tasks: MarketingTask[] = [], appointments: Appointment[] = [];
  // Répartition par étape : beaucoup de nouveaux leads, puis de moins en moins, comme un vrai pipeline.
  const perStage = [16, 7, 5, 4, 3, 4, 3];
  let k = 0;
  stages.forEach((stage, si) => {
    for (let j = 0; j < perStage[si]; j++, k++) {
      const first = FIRST[k % FIRST.length], last = LAST[(k * 7) % LAST.length], name = `${first} ${last}`;
      const created = ago((k * 3) % 40, 9 + (k % 8));
      const email = `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@exemple.fr";
      const phone = `+33 6 ${String(10 + (k * 13) % 89).padStart(2, "0")} ${String(10 + (k * 29) % 89).padStart(2, "0")} ${String(10 + (k * 31) % 89).padStart(2, "0")} ${String(10 + (k * 17) % 89).padStart(2, "0")}`;
      const contact: Contact = {
        id: id("ct"), name, email, phone, phone_norm: phone.replace(/\s/g, ""), company: k % 3 === 0 ? null : `${last} ${k % 2 ? "Studio" : "Shop"} (exemple)`,
        tags: k % 4 === 0 ? [] : [TAGS[k % TAGS.length], ...(k % 5 === 0 ? [TAGS[(k + 2) % TAGS.length]] : [])], source: SOURCES[k % SOURCES.length],
        last_activity_at: ago((k * 2) % 20), created_by: null, created_at: created, updated_at: created,
      };
      contacts.push(contact);
      const value = stage.kind === "gagne" ? 1500 + (k % 3) * 500 : stage.key === "proposition" ? 2000 : k % 4 === 0 ? 1500 : 0;
      const p: Prospect = {
        id: id("pr"), name, email, phone, source: contact.source, marque: contact.company, utm: null, site: null, landing_page: null, referrer: null,
        status: stage.legacy_status, opted_in_at: created, notes: k % 5 === 0 ? "Souhaite être rappelé en fin de journée." : null, besoin: null, budget: null,
        next_action_at: null, next_action_note: null, unsubscribed_at: null, created_by: null, created_at: created, updated_at: created,
        contact_id: contact.id, stage_id: stage.id, stage_changed_at: created, title: null, value: value || null,
        setter_id: null, closer_id: null, call_result: stage.key === "audit_effectue" ? "present" : null, outcome: stage.kind === "gagne" ? "signe" : null,
        signed_amount: stage.kind === "gagne" ? value : null, call_note: null,
      };
      prospects.push(p);
      if (stage.kind === "ouvert" && k % 3 === 0) {
        tasks.push({ id: id("tk"), prospect_id: p.id, contact_id: contact.id, kind: si === 0 ? "a_appeler" : "relance", title: si === 0 ? `Appeler ${first}` : `Relancer ${first}`, note: null,
          assignee_id: null, due_at: ago(k % 2 ? 0 : -1, 11 + (k % 5)), status: "ouverte", done_at: null, done_by: null, origin: "manuel", created_by: null, created_at: created, updated_at: created });
      }
      if (stage.key === "audit_reserve") {
        const start = new Date(now); start.setDate(start.getDate() + (j % 5)); start.setHours(10 + j, 0, 0, 0);
        const end = new Date(start.getTime() + 45 * 60_000);
        appointments.push({ id: id("rdv"), prospect_id: p.id, starts_at: start.toISOString(), ends_at: end.toISOString(), status: "confirme", meeting_url: null, created_by: null,
          created_at: created, updated_at: created, source: "manuel", contact_id: contact.id, setter_id: null, closer_id: null, result: "a_venir", title: `Audit — ${name}` });
      }
    }
  });
  return { stages, contacts, prospects, tasks, appointments };
}
