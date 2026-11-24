/**
 * Données d'exemple pour les essais sur un ordinateur de développement, et seulement là : elles ne se chargent que si
 * MARKETING_DEMO_SAMPLE=1 est posé localement ET qu'aucune base n'est reliée. En ligne, l'espace lit la vraie base et
 * ce fichier n'est jamais utilisé. Les noms sont fictifs et chaque entreprise porte la mention « (exemple) ».
 */
import { DEFAULT_STAGES } from "./crm";
import { newKpiToken, shiftDay, todayIn, type KpiPerson, type KpiPersonEntry } from "./kpi-links";
import type { Appointment, Contact, KpiEntry, MarketingTask, Prospect, Stage, StageColor } from "./types";

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
  // Liens de saisie des KPI : deux personnes autorisées d'exemple et quelques jours saisis (rien pour aujourd'hui).
  // Le closer d'exemple a un e-mail (fictif) : il sert à essayer le lien d'onboarding (/bienvenue/<jeton>) sans compte.
  const today = todayIn("Europe/Paris", now), at = (day: string, h: number) => `${day}T${String(h).padStart(2, "0")}:40:00.000Z`;
  const kpiPeople: KpiPerson[] = [
    { id: id("kp"), name: "Inès Diallo (exemple)", email: null, phone: null, role: "setter", token: newKpiToken(), active: true, created_by: null, created_at: ago(20), updated_at: ago(20), last_entry_at: null },
    { id: id("kp"), name: "Romain Girard (exemple)", email: "romain.girard@exemple.fr", phone: null, role: "closer", token: newKpiToken(), active: true, created_by: null, created_at: ago(30), updated_at: ago(30), last_entry_at: null },
  ];
  const kpiEntries: KpiPersonEntry[] = [];
  const setterDays: Array<[number, Record<string, number>, string | null]> = [[1, { appels: 42, decroches: 13, messages: 18, conversations: 7 }, "Bonne fin d'après-midi"], [2, { appels: 38, decroches: 9, messages: 22, conversations: 5 }, null], [4, { appels: 51, decroches: 15, messages: 12, conversations: 9 }, null], [5, { appels: 29, decroches: 8, messages: 25, conversations: 4 }, "Matinée sans réponse"]];
  for (const [back, metrics, note] of setterDays) {
    const day = shiftDay(today, -back), stamp = at(day, 17);
    kpiEntries.push({ id: id("ke"), person_id: kpiPeople[0].id, day, metrics, note, created_at: stamp, updated_at: stamp });
  }
  kpiPeople[0].last_entry_at = at(shiftDay(today, -setterDays[0][0]), 17);

  /*
   * Rapport des closers : jours d'exemple cohérents (show-up + no-show + annulés ≤ prévus ; non qualifiés + pitchs
   * ≤ show-up ; closes + en réflexion ≤ pitchs ; CA signé dès qu'il y a un close ; cash ≤ CA signé).
   * Colonnes : jours en arrière, prévus, show-up, no-show, annulés, non qualifiés, pitchs, closes, en réflexion,
   * cash, CA signé, relances, propositions, remarque.
   */
  type CloserDay = [number, number, number, number, number, number, number, number, number, number, number, number, number, string | null];
  const closerMetrics = ([, rdv_prevus, show_up, no_show, annules, non_qualifies, pitchs, closes, en_reflexion, cash, ca_signe, relances, propositions]: CloserDay) =>
    ({ rdv_prevus, show_up, no_show, annules, non_qualifies, pitchs, closes, en_reflexion, cash, ca_signe, relances, propositions });
  const linkCloserDays: CloserDay[] = [
    [1, 6, 4, 1, 1, 1, 3, 1, 1, 1500, 3000, 6, 2, null], [2, 5, 3, 1, 0, 1, 2, 1, 0, 2000, 2000, 3, 1, null], [3, 4, 3, 0, 1, 0, 3, 0, 2, 0, 0, 4, 1, null],
    [6, 7, 5, 1, 1, 2, 3, 2, 1, 2500, 5000, 8, 3, "Deux relances à refaire lundi"], [8, 5, 4, 1, 0, 1, 2, 1, 1, 1000, 2500, 2, 1, null], [9, 6, 4, 2, 0, 1, 3, 1, 1, 3000, 3000, 5, 2, null],
    [12, 4, 2, 1, 1, 1, 1, 0, 1, 0, 0, 3, 0, null], [13, 6, 5, 0, 1, 1, 4, 2, 1, 2000, 6000, 4, 2, null], [15, 5, 4, 1, 0, 2, 2, 1, 0, 1500, 2500, 2, 1, null],
    [16, 6, 3, 2, 1, 0, 3, 1, 2, 500, 3000, 6, 1, null], [20, 5, 4, 0, 1, 1, 3, 1, 1, 2500, 2500, 3, 2, null], [22, 4, 3, 1, 0, 1, 2, 0, 1, 0, 0, 4, 1, null],
    [26, 6, 4, 1, 1, 1, 3, 2, 0, 3000, 4500, 5, 2, null],
  ];
  for (const d of linkCloserDays) {
    const day = shiftDay(today, -d[0]), stamp = at(day, 18);
    kpiEntries.push({ id: id("ke"), person_id: kpiPeople[1].id, day, metrics: closerMetrics(d), note: d[13], created_at: stamp, updated_at: stamp });
  }
  kpiPeople[1].last_entry_at = at(shiftDay(today, -linkCloserDays[0][0]), 18);

  // Saisies des comptes d'essai (membres « Closer (essai) » et « Setter (essai) ») : le suivi quotidien des membres.
  const memberEntries: KpiEntry[] = [];
  const trialCloserDays: CloserDay[] = [
    [1, 5, 3, 1, 1, 1, 2, 1, 1, 2000, 2000, 3, 1, null], [2, 4, 3, 1, 0, 0, 3, 1, 1, 500, 2500, 2, 1, "Acompte de 500 €, le reste à la livraison"], [4, 6, 4, 1, 1, 2, 2, 0, 2, 0, 0, 4, 0, null],
    [5, 5, 4, 0, 1, 1, 3, 2, 0, 3000, 4000, 2, 2, null], [7, 4, 2, 2, 0, 1, 1, 0, 1, 0, 0, 3, 0, null], [9, 5, 3, 1, 1, 1, 2, 1, 0, 1500, 1500, 2, 1, null],
    [10, 6, 5, 1, 0, 1, 4, 1, 2, 1000, 3000, 5, 2, null], [14, 5, 4, 1, 0, 2, 2, 1, 1, 2500, 2500, 3, 1, null], [17, 4, 3, 0, 1, 1, 2, 0, 1, 0, 0, 2, 1, null],
    [19, 6, 4, 1, 1, 1, 3, 1, 1, 2000, 3000, 4, 1, null], [23, 5, 3, 1, 1, 0, 3, 2, 1, 4000, 5000, 3, 2, null], [27, 4, 3, 1, 0, 1, 2, 1, 0, 1500, 1500, 1, 1, null],
  ];
  // Le suivi d'un membre n'enregistre pas les cases à 0 (comme saveKpiEntryAction).
  const nonZero = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v > 0));
  for (const d of trialCloserDays) {
    const day = shiftDay(today, -d[0]), stamp = at(day, 19);
    memberEntries.push({ id: id("me"), profile_id: "demo-closer", day, metrics: nonZero(closerMetrics(d)), note: d[13], created_at: stamp, updated_at: stamp });
  }
  const trialSetterDays: Array<[number, Record<string, number>]> = [[1, { appels: 35, decroches: 11, messages: 20, conversations: 6 }], [2, { appels: 44, decroches: 14, messages: 16, conversations: 8 }], [3, { appels: 31, decroches: 9, messages: 24, conversations: 5 }], [6, { appels: 48, decroches: 16, messages: 10, conversations: 9 }], [8, { appels: 27, decroches: 7, messages: 19, conversations: 3 }], [10, { appels: 40, decroches: 12, messages: 15, conversations: 7 }], [13, { appels: 36, decroches: 10, messages: 21, conversations: 6 }]];
  for (const [back, metrics] of trialSetterDays) {
    const day = shiftDay(today, -back), stamp = at(day, 17);
    memberEntries.push({ id: id("me"), profile_id: "demo-setter", day, metrics, note: null, created_at: stamp, updated_at: stamp });
  }
  return { stages, contacts, prospects, tasks, appointments, kpiPeople, kpiEntries, memberEntries };
}
