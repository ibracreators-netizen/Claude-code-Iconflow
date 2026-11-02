import "server-only";
import type { DataStore } from "@/lib/data/store";
import type { BriefKind } from "@/lib/data/types";
import { APP_URL } from "@/lib/supabase/env";

/** Déclaration des outils exposés à Claude (tools/list). */
export const MCP_TOOLS = [
  {
    name: "lister_clients",
    description:
      "Liste les espaces clients de l'agence (id, nom, secteur). À appeler d'abord pour retrouver l'identifiant du bon client avant de créer un brief.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "lister_briefs",
    description:
      "Liste les briefs existants, éventuellement filtrés par client et par mois (YYYY-MM). Utile pour éviter les doublons avant d'en créer un.",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Filtrer sur un espace client (id)." },
        mois: { type: "string", description: "Filtrer sur un mois au format YYYY-MM." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "creer_brief",
    description:
      "Crée un brief dans l'espace d'un client. Le brief naît en « rédaction » (brouillon agence, invisible du client tant qu'il n'est pas proposé). Fournir soit client_id, soit client (nom). Les concepts sont optionnels : chacun devient une page du brief.",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Id de l'espace client (recommandé, via lister_clients)." },
        client: { type: "string", description: "Nom du client si tu n'as pas l'id (correspondance exacte, insensible à la casse)." },
        titre: { type: "string", description: "Titre du brief (ex. « 03 · Routine du soir »)." },
        type: { type: "string", enum: ["video", "statique"], description: "Type de brief." },
        mois: { type: "string", description: "Mois cible au format YYYY-MM." },
        concepts: {
          type: "array",
          description: "Pages du brief. Pour un brief vidéo : concept, hooks[], corps, ctas[], acting. Pour un statique : reference, angle, overlay. « texte » alimente le champ principal si tu ne détailles pas.",
          items: {
            type: "object",
            properties: {
              titre: { type: "string" },
              texte: { type: "string", description: "Contenu principal libre (concept vidéo ou angle statique)." },
              concept: { type: "string" },
              hooks: { type: "array", items: { type: "string" } },
              corps: { type: "string" },
              ctas: { type: "array", items: { type: "string" } },
              acting: { type: "string" },
              reference: { type: "string" },
              angle: { type: "string" },
              overlay: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      },
      required: ["titre", "type", "mois"],
      additionalProperties: false,
    },
  },
] as const;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strArr = (v: unknown): string[] => (Array.isArray(v) && v.some((s) => typeof s === "string" && s.trim()) ? v.filter((s): s is string => typeof s === "string") : [""]);

interface ConceptInput {
  titre?: string; texte?: string; concept?: string; hooks?: string[]; corps?: string; ctas?: string[];
  acting?: string; reference?: string; angle?: string; overlay?: string;
}

/** Construit le contenu d'un concept selon le type de brief (même forme que l'éditeur du studio). */
function conceptContent(kind: BriefKind, c: ConceptInput): Record<string, unknown> {
  if (kind === "video") {
    return {
      concept: str(c.concept || c.texte),
      transcription: { hooks: strArr(c.hooks), corps: str(c.corps), ctas: strArr(c.ctas) },
      acting: str(c.acting),
    };
  }
  return { reference: str(c.reference), angle: str(c.angle || c.texte), overlay: str(c.overlay) };
}

function checkMonth(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(v)) throw new Error("mois invalide : attendu YYYY-MM.");
  return v.slice(0, 7);
}

/** Exécute un outil et renvoie une valeur sérialisable (objet ou texte). */
export async function callTool(store: DataStore, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "lister_clients": {
      const clients = await store.clients();
      return clients.map((c) => ({ id: c.id, nom: c.name, secteur: c.sector, statut: c.status }));
    }
    case "lister_briefs": {
      const clientId = typeof args.client_id === "string" ? args.client_id : undefined;
      const month = args.mois ? checkMonth(args.mois) : undefined;
      const briefs = await store.briefs({ clientId, month });
      return briefs.map((b) => ({ id: b.id, titre: b.title, type: b.kind, statut: b.status, mois: b.month.slice(0, 7), client_id: b.client_id }));
    }
    case "creer_brief": {
      const title = str(args.titre).trim();
      if (!title) throw new Error("titre requis.");
      const kind = args.type === "video" || args.type === "statique" ? (args.type as BriefKind) : null;
      if (!kind) throw new Error('type requis : "video" ou "statique".');
      const month = checkMonth(args.mois);

      // Résolution du client : id direct, ou correspondance exacte par nom.
      let clientId = typeof args.client_id === "string" ? args.client_id.trim() : "";
      const clients = await store.clients();
      if (!clientId && typeof args.client === "string" && args.client.trim()) {
        const wanted = args.client.trim().toLowerCase();
        const matches = clients.filter((c) => c.name.toLowerCase() === wanted);
        if (matches.length === 0) throw new Error(`Aucun client nommé « ${args.client} ». Utilise lister_clients pour le bon nom ou l'id.`);
        if (matches.length > 1) throw new Error(`Plusieurs clients nommés « ${args.client} » : précise client_id.`);
        clientId = matches[0].id;
      }
      if (!clientId) throw new Error("Fournis client_id ou client (nom).");
      if (!clients.some((c) => c.id === clientId)) throw new Error("client_id inconnu.");

      const brief = await store.createBrief({ client_id: clientId, month, kind, title });
      const concepts = Array.isArray(args.concepts) ? (args.concepts as ConceptInput[]) : [];
      if (concepts.length) {
        const existing = await store.concepts(brief.id); // createBrief crée déjà « Concept 1 »
        for (let i = 0; i < concepts.length; i++) {
          const c = concepts[i] ?? {};
          const ctitle = str(c.titre).trim() || `Concept ${i + 1}`;
          const content = conceptContent(kind, c);
          if (i === 0 && existing[0]) await store.updateConcept(existing[0].id, { title: ctitle, content });
          else await store.createConcept(brief.id, { title: ctitle, content });
        }
      }
      const clientName = clients.find((c) => c.id === clientId)?.name ?? clientId;
      return {
        ok: true,
        id: brief.id,
        titre: brief.title,
        client: clientName,
        type: kind,
        mois: month,
        statut: "redaction (brouillon agence)",
        concepts: concepts.length || 1,
        url: `${APP_URL}/studio/briefs/${brief.id}`,
        message: `Brief « ${brief.title} » créé dans l'espace ${clientName}, en rédaction. Ouvre-le dans le studio pour le relire puis le proposer au client.`,
      };
    }
    default:
      throw new Error(`Outil inconnu : ${name}`);
  }
}
