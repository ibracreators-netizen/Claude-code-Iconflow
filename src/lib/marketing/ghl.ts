/**
 * Lecture des exports CSV de GoHighLevel (contacts et opportunités). Fonctions pures, utilisables
 * dans le navigateur (aperçu avant import) comme sur le serveur. Aucune dépendance.
 *
 * Les intitulés de colonnes varient selon la langue et la version de GHL : chaque champ accepte
 * plusieurs intitulés, comparés sans tenir compte de la casse, des accents ni de la ponctuation.
 */

/** Lit un CSV (virgule, point-virgule ou tabulation ; guillemets doublés ; retours à la ligne dans une cellule). */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? src.length : src.search(/\r?\n/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = count(";") > count(",") && count(";") >= count("\t") ? ";" : count("\t") > count(",") ? "\t" : ",";
  const table: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim() !== "")) table.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell); if (row.some((v) => v.trim() !== "")) table.push(row);
  const headers = (table.shift() ?? []).map((h) => h.trim());
  return { headers, rows: table.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Champs attendus et intitulés acceptés. Le premier intitulé est celui de l'export GHL en anglais. */
export const CONTACT_COLUMNS = {
  external_id: ["Contact Id", "Contact ID", "Id", "Identifiant du contact"],
  first_name: ["First Name", "Prénom", "Prenom"],
  last_name: ["Last Name", "Nom de famille", "Nom"],
  name: ["Name", "Full Name", "Contact Name", "Nom complet"],
  email: ["Email", "E-mail", "Adresse e-mail", "Courriel"],
  phone: ["Phone", "Phone Number", "Téléphone", "Telephone", "Mobile"],
  company: ["Business Name", "Company Name", "Company", "Entreprise", "Société", "Nom de l'entreprise"],
  tags: ["Tags", "Étiquettes", "Etiquettes"],
  source: ["Source", "Lead Source", "Contact Source"],
  created: ["Created", "Created At", "Created on", "Date Created", "Date Added", "Créé le", "Date de création"],
} as const;
export const OPPORTUNITY_COLUMNS = {
  external_id: ["Opportunity ID", "Opportunity Id", "Id", "Identifiant de l'opportunité"],
  title: ["Opportunity Name", "Name", "Nom de l'opportunité", "Opportunité"],
  contact_external_id: ["Contact ID", "Contact Id", "Identifiant du contact"],
  contact_name: ["Contact Name", "Full Name", "Nom du contact", "Contact"],
  email: ["Email", "E-mail", "Contact Email", "Adresse e-mail"],
  phone: ["Phone", "Contact Phone", "Téléphone", "Telephone"],
  pipeline: ["Pipeline", "Pipeline Name"],
  stage: ["Stage", "Pipeline Stage", "Stage Name", "Étape", "Etape"],
  status: ["Status", "Statut"],
  value: ["Lead Value", "Opportunity Value", "Value", "Monetary Value", "Valeur", "Montant"],
  source: ["Source", "Opportunity Source", "Lead Source"],
  assigned: ["Assigned", "Assigned To", "Owner", "Responsable", "Assigné à", "Attribué à"],
  created: ["Created on", "Created", "Created At", "Date Created", "Créé le", "Date de création"],
  tags: ["Tags", "Étiquettes", "Etiquettes"],
  notes: ["Notes", "Note"],
  lost_reason: ["Lost Reason Name", "Lost Reason", "Raison de la perte"],
} as const;

type Columns = Record<string, readonly string[]>;
/** Associe chaque champ attendu à la colonne du fichier qui lui correspond (ou null). */
export function mapColumns<C extends Columns>(headers: string[], columns: C): Record<keyof C, string | null> {
  const index = new Map(headers.map((h) => [norm(h), h]));
  return Object.fromEntries(Object.entries(columns).map(([field, names]) => [field, names.map((n) => index.get(norm(n))).find(Boolean) ?? null])) as Record<keyof C, string | null>;
}

/** Date d'un export GHL → ISO. Accepte ISO, « 2024-03-15 14:23:00 », « 15/03/2024 », « Mar 15 2024 02:23 PM ». null si illisible. */
export function parseDate(v: string | undefined | null): string | null {
  const s = (v ?? "").trim(); if (!s) return null;
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (fr) { const [, d, m, y, hh = "12", mm = "00"] = fr; const day = Number(d), month = Number(m); if (month > 12 && day <= 12) return new Date(Date.UTC(Number(y), day - 1, month, Number(hh), Number(mm))).toISOString(); if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(Date.UTC(Number(y), month - 1, day, Number(hh), Number(mm))).toISOString(); return null; }
  const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(" ", "T") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? "" : "Z") : s);
  if (Number.isNaN(t)) return null;
  const year = new Date(t).getUTCFullYear();
  return year < 2000 || year > 2100 ? null : new Date(t).toISOString();
}
const splitTags = (v: string | undefined) => [...new Set((v ?? "").split(/[,;|]/).map((t) => t.trim()).filter(Boolean))];
const money = (v: string | undefined): number | null => { const s = (v ?? "").replace(/[^0-9.,-]/g, ""); if (!s) return null; const n = Number(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };

export interface GhlContactRow { line: number; external_id: string | null; name: string | null; email: string | null; phone: string | null; company: string | null; tags: string[]; source: string | null; created_at: string | null }
export interface GhlOpportunityRow { line: number; external_id: string | null; title: string | null; contact_external_id: string | null; contact_name: string | null; email: string | null; phone: string | null; pipeline: string | null; stage: string | null; status: string | null; value: number | null; source: string | null; assigned: string | null; created_at: string | null; tags: string[]; notes: string | null }

const pick = (row: Record<string, string>, col: string | null) => { const v = col ? row[col] : ""; return v && v.trim() ? v.trim() : null; };

export function readContacts(csv: { headers: string[]; rows: Record<string, string>[] }): { columns: Record<keyof typeof CONTACT_COLUMNS, string | null>; rows: GhlContactRow[] } {
  const c = mapColumns(csv.headers, CONTACT_COLUMNS);
  return { columns: c, rows: csv.rows.map((r, i) => ({
    line: i + 2, external_id: pick(r, c.external_id),
    name: pick(r, c.name) ?? ([pick(r, c.first_name), pick(r, c.last_name)].filter(Boolean).join(" ") || null),
    email: pick(r, c.email)?.toLowerCase() ?? null, phone: pick(r, c.phone), company: pick(r, c.company),
    tags: splitTags(pick(r, c.tags) ?? undefined), source: pick(r, c.source), created_at: parseDate(pick(r, c.created)),
  })) };
}
export function readOpportunities(csv: { headers: string[]; rows: Record<string, string>[] }): { columns: Record<keyof typeof OPPORTUNITY_COLUMNS, string | null>; rows: GhlOpportunityRow[] } {
  const c = mapColumns(csv.headers, OPPORTUNITY_COLUMNS);
  return { columns: c, rows: csv.rows.map((r, i) => {
    const notes = [pick(r, c.notes), pick(r, c.lost_reason) ? `Raison de la perte : ${pick(r, c.lost_reason)}` : null].filter(Boolean).join("\n") || null;
    return {
      line: i + 2, external_id: pick(r, c.external_id), title: pick(r, c.title), contact_external_id: pick(r, c.contact_external_id), contact_name: pick(r, c.contact_name),
      email: pick(r, c.email)?.toLowerCase() ?? null, phone: pick(r, c.phone), pipeline: pick(r, c.pipeline), stage: pick(r, c.stage), status: pick(r, c.status)?.toLowerCase() ?? null,
      value: money(pick(r, c.value) ?? undefined), source: pick(r, c.source), assigned: pick(r, c.assigned), created_at: parseDate(pick(r, c.created)), tags: splitTags(pick(r, c.tags) ?? undefined), notes,
    };
  }) };
}

/** Étape de l'app la plus proche d'un intitulé d'étape GHL (proposition, modifiable avant l'import). */
export function suggestStage(ghlStage: string, stages: Array<{ key: string; name: string }>): string | null {
  const s = norm(ghlStage);
  const exact = stages.find((st) => norm(st.name) === s); if (exact) return exact.key;
  const rules: Array<[RegExp, string]> = [
    [/gagn|won|sign|client|closed won|vendu/, "gagne"], [/perdu|lost|abandon|no show definit|disqual/, "perdu"],
    [/proposition|proposal|devis|offre|contrat/, "proposition"], [/follow|suivi|relance|reflexion|nurtur/, "followup"],
    [/effectu|done|tenu|completed|show|present|call fait/, "audit_effectue"], [/reserv|booked|book|rdv|appointment|scheduled|audit|call|appel/, "audit_reserve"],
    [/nouveau|new|lead|opt|inbound|entrant/, "nouveau_lead"],
  ];
  const hit = rules.find(([re]) => re.test(s));
  return hit && stages.some((st) => st.key === hit[1]) ? hit[1] : null;
}
