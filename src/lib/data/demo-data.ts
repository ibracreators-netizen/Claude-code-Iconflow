/**
 * Jeu de données de démonstration (fictif) — permet d'explorer l'interface complète
 * sans backend. Généré de façon déterministe. Jamais utilisé quand Supabase est configuré.
 */
import type {
  Activity, Avatar, BrainEntry, BrandDossier, Brief, CalendarEvent, Client, ClientManagement, Contact, Document,
  FileAsset, Invoice, Knowledge, Livrable, LivrableComment, Message, Metric, Profile, Task, Validation,
} from "./types";

const ago = (days: number, h = 10) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const inDays = (days: number, h = 10) => ago(-days, h);
const day = (days: number) => ago(days).slice(0, 10);
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const shiftMonth = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

// PRNG déterministe
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));

export const DEMO_IDS = {
  ibra: "00000000-0000-4000-8000-000000000001",
  sarah: "00000000-0000-4000-8000-000000000002",
  mehdi: "00000000-0000-4000-8000-000000000003",
  clientUser: "00000000-0000-4000-8000-000000000010",
  lashea: "10000000-0000-4000-8000-000000000001",
  nova: "10000000-0000-4000-8000-000000000002",
  mendo: "10000000-0000-4000-8000-000000000003",
  lea: "10000000-0000-4000-8000-000000000004",
  bloom: "10000000-0000-4000-8000-000000000005",
  vexa: "10000000-0000-4000-8000-000000000006",
};

export const demoProfiles: Profile[] = [
  { id: DEMO_IDS.ibra, role: "agency", client_id: null, display_name: "Ibra", email: "ibracreators@gmail.com", avatar_url: null, title: "Fondateur · Direction créative", permissions: null, disabled_at: null, invited_by: null, created_at: ago(400) },
  { id: DEMO_IDS.sarah, role: "agency", client_id: null, display_name: "Sarah Keita", email: "sarah@icon-flow.fr", avatar_url: null, title: "Head of Scripts", permissions: ["dashboard", "inbox", "clients", "pipeline", "messages", "briefs", "livrables", "taches", "planning", "performance", "brain", "documents", "fichiers", "parametres"], disabled_at: null, invited_by: DEMO_IDS.ibra, created_at: ago(300) },
  { id: DEMO_IDS.mehdi, role: "agency", client_id: null, display_name: "Mehdi Rahal", email: "mehdi@icon-flow.fr", avatar_url: null, title: "Monteur senior", permissions: ["dashboard", "inbox", "livrables", "taches", "planning", "fichiers", "documents", "parametres"], disabled_at: null, invited_by: DEMO_IDS.ibra, created_at: ago(250) },
  { id: DEMO_IDS.clientUser, role: "client", client_id: DEMO_IDS.lashea, display_name: "Camille Dorval", email: "camille@lashea.fr", avatar_url: null, title: "Fondatrice Lashéa", permissions: null, disabled_at: null, invited_by: DEMO_IDS.ibra, created_at: ago(120) },
];

const mkClient = (c: Partial<Client> & Pick<Client, "id" | "name" | "slug">): Client => ({
  status: "active", current_step: 4, sector: null, contact_email: null, created_at: ago(200), website: null, logo_url: null,
  segment: "ecommerce", monthly_budget: 0, retainer: 0, performance_fee_pct: 0, health: "bon", tags: [], city: null,
  owner_id: DEMO_IDS.ibra, archived_at: null, updated_at: ago(2), ...c,
});

export const demoClients: Client[] = [
  mkClient({ id: DEMO_IDS.lashea, name: "Lashéa", slug: "lashea", sector: "Cosmétique · extensions de cils", contact_email: "camille@lashea.fr", website: "https://lashea.fr", segment: "ecommerce", monthly_budget: 18000, retainer: 2500, performance_fee_pct: 8, health: "excellent", tags: ["beauté", "scaling", "meta"], city: "Paris", created_at: ago(180), current_step: 5 }),
  mkClient({ id: DEMO_IDS.nova, name: "NovaSkin", slug: "novaskin", sector: "Skincare DTC", contact_email: "ops@novaskin.co", website: "https://novaskin.co", segment: "ecommerce", monthly_budget: 32000, retainer: 3500, performance_fee_pct: 6, health: "bon", tags: ["skincare", "tiktok", "ugc"], city: "Lyon", created_at: ago(140), owner_id: DEMO_IDS.sarah }),
  mkClient({ id: DEMO_IDS.mendo, name: "Atelier Mendo", slug: "atelier-mendo", sector: "Mobilier design", contact_email: "hello@ateliermendo.fr", website: "https://ateliermendo.fr", segment: "ecommerce", monthly_budget: 9000, retainer: 1800, performance_fee_pct: 10, health: "attention", tags: ["déco", "panier élevé"], city: "Bordeaux", created_at: ago(95), status: "active" }),
  mkClient({ id: DEMO_IDS.lea, name: "Léa Fit Academy", slug: "lea-fit-academy", sector: "Coaching sportif en ligne", contact_email: "lea@leafit.fr", website: "https://leafit.fr", segment: "coach", monthly_budget: 12000, retainer: 2000, performance_fee_pct: 12, health: "bon", tags: ["infoproduit", "webinaire"], city: "Marseille", created_at: ago(60), status: "onboarding", current_step: 2 }),
  mkClient({ id: DEMO_IDS.bloom, name: "Bloom Formation", slug: "bloom-formation", sector: "Formation e-commerce", contact_email: "contact@bloom-formation.com", website: "https://bloom-formation.com", segment: "infopreneur", monthly_budget: 25000, retainer: 3000, performance_fee_pct: 10, health: "risque", tags: ["high ticket", "VSL"], city: "Lille", created_at: ago(220), status: "paused" }),
  mkClient({ id: DEMO_IDS.vexa, name: "Vexa Watches", slug: "vexa-watches", sector: "Horlogerie", contact_email: "team@vexa.watch", segment: "ecommerce", monthly_budget: 6000, retainer: 1500, performance_fee_pct: 8, health: "bon", tags: [], city: "Genève", created_at: ago(300), status: "archived", archived_at: ago(30) }),
];

export const demoManagement: ClientManagement[] = [
  { client_id: DEMO_IDS.lashea, stage: "in_progress", notes: "Scaling en cours. Objectif CPA < 28 €. Tournage mensuel le 2e mardi.", revision: 7, updated_at: ago(3), updated_by: DEMO_IDS.ibra },
  { client_id: DEMO_IDS.nova, stage: "in_progress", notes: "Priorité TikTok Q4. Attendre le nouveau packaging avant le shoot studio.", revision: 4, updated_at: ago(6), updated_by: DEMO_IDS.sarah },
  { client_id: DEMO_IDS.mendo, stage: "in_progress", notes: "ROAS en baisse depuis 3 semaines. Tester angle 'investissement 20 ans'.", revision: 3, updated_at: ago(1), updated_by: DEMO_IDS.ibra },
  { client_id: DEMO_IDS.lea, stage: "onboarding", notes: "Brain à compléter : personas et objections. Accès Meta reçu.", revision: 2, updated_at: ago(2), updated_by: DEMO_IDS.ibra },
  { client_id: DEMO_IDS.bloom, stage: "completed", notes: "Pause budget jusqu'à janvier. Relance prévue le 10/01.", revision: 9, updated_at: ago(20), updated_by: DEMO_IDS.ibra },
];

export const demoContacts: Contact[] = [
  { id: "c-1", client_id: DEMO_IDS.lashea, full_name: "Camille Dorval", email: "camille@lashea.fr", phone: "+33 6 12 34 56 78", job_title: "Fondatrice", is_primary: true, created_at: ago(180) },
  { id: "c-2", client_id: DEMO_IDS.lashea, full_name: "Thomas Reyes", email: "thomas@lashea.fr", phone: null, job_title: "Growth", is_primary: false, created_at: ago(90) },
  { id: "c-3", client_id: DEMO_IDS.nova, full_name: "Inès Marchand", email: "ines@novaskin.co", phone: "+33 7 55 10 20 30", job_title: "CMO", is_primary: true, created_at: ago(140) },
  { id: "c-4", client_id: DEMO_IDS.mendo, full_name: "Julien Mendo", email: "julien@ateliermendo.fr", phone: null, job_title: "Fondateur", is_primary: true, created_at: ago(95) },
  { id: "c-5", client_id: DEMO_IDS.lea, full_name: "Léa Fontaine", email: "lea@leafit.fr", phone: "+33 6 98 76 54 32", job_title: "Coach · fondatrice", is_primary: true, created_at: ago(60) },
  { id: "c-6", client_id: DEMO_IDS.bloom, full_name: "Karim Belaïd", email: "karim@bloom-formation.com", phone: null, job_title: "CEO", is_primary: true, created_at: ago(220) },
];

const videoContent = (concept: string, hooks: string[], corps: string, ctas: string[], acting: string, angle: string, framework = "PAS") =>
  ({ concept, transcription: { hooks, corps, ctas }, acting, angle, framework });

const mkBrief = (b: Partial<Brief> & Pick<Brief, "id" | "client_id" | "title" | "kind" | "status">): Brief => ({
  month: thisMonth(), content: {}, source: "agence", validated_by: null, validated_at: null, created_at: ago(10),
  script_version: 1, submitted_content: null, position: null, assignee_id: DEMO_IDS.sarah, due_date: null, updated_at: ago(1), ...b,
});

export const demoBriefs: Brief[] = [
  mkBrief({ id: "b-01", client_id: DEMO_IDS.lashea, title: "01 · Le secret des cils qui tiennent 6 semaines", kind: "video", status: "attente_client", position: 1, created_at: ago(9), due_date: day(-3),
    content: videoContent("Démonstration produit face caméra, ton confidence entre amies.", ["Tu remets des faux cils tous les matins ? Arrête.", "Personne ne t'a dit ça sur les extensions de cils…"], "J'ai testé toutes les colles du marché. Soit ça décolle au bout de 3 jours, soit ça irrite. Jusqu'à ce que je tombe sur Lashéa : une pose à la maison, 6 semaines de tenue, zéro irritation. Je te montre exactement comment je fais en 90 secondes.", ["Lien en bio, livraison 48h.", "Commande ton kit avant dimanche : -20%."], "Plan serré miroir, lumière naturelle, rythme rapide. Démo réelle, pas de voix off.", "Gain de temps + preuve sociale", "PAS") }),
  mkBrief({ id: "b-02", client_id: DEMO_IDS.lashea, title: "02 · Réaction esthéticienne", kind: "video", status: "attente_ibra", position: 2, created_at: ago(7),
    content: videoContent("Une pro réagit à la pose maison Lashéa.", ["Une esthéticienne réagit à un kit à 39 €."], "Honnêtement je pensais démonter ce produit. La colle est médicale, les faisceaux sont pré-séparés… ça se tient. Ce que je ferais différemment : …", ["Teste et dis-moi en commentaire."], "Split screen réaction + démo.", "Autorité / preuve", "BAB") }),
  mkBrief({ id: "b-03", client_id: DEMO_IDS.lashea, title: "03 · Avant/Après 30 jours", kind: "video", status: "redaction", position: 3, created_at: ago(2),
    content: videoContent("Journal vidéo sur 30 jours.", ["J'ai porté les mêmes extensions 30 jours. Voilà ce qui s'est passé."], "", ["Lien en bio."], "", "Transformation", "BAB") }),
  mkBrief({ id: "b-04", client_id: DEMO_IDS.lashea, title: "Statique · Offre Black Friday", kind: "statique", status: "attente_ibra", position: 1, created_at: ago(4),
    content: { reference: "Carrousel 4 slides, fond crème, typographie serif.", angle: "Urgence + bénéfice principal", overlay: "6 semaines de tenue. 39 €. Jusqu'à dimanche." } }),
  mkBrief({ id: "b-05", client_id: DEMO_IDS.lashea, title: "01 · Routine du matin (octobre)", kind: "video", status: "valide", month: shiftMonth(-1), position: 1, created_at: ago(40), validated_by: DEMO_IDS.clientUser, validated_at: ago(32),
    content: videoContent("GRWM (get ready with me) naturel.", ["Ma routine de 4 minutes quand je suis en retard."], "…", ["Code MATIN10."], "Caméra posée, voix naturelle.", "Routine / identification", "AIDA") }),
  mkBrief({ id: "b-06", client_id: DEMO_IDS.nova, title: "01 · Le dermatologue qui a changé d'avis", kind: "video", status: "attente_client", position: 1, created_at: ago(6), assignee_id: DEMO_IDS.ibra,
    content: videoContent("Témoignage expert.", ["Je suis dermato et j'ai déconseillé ce sérum pendant 2 ans."], "Jusqu'à ce que je lise l'étude de 2025 sur le niacinamide encapsulé…", ["Lien en description."], "Blouse blanche, cabinet, plan fixe.", "Autorité", "PAS") }),
  mkBrief({ id: "b-07", client_id: DEMO_IDS.nova, title: "02 · 3 erreurs skincare après 30 ans", kind: "video", status: "redaction", position: 2, created_at: ago(1),
    content: videoContent("Listicle éducatif.", ["3 erreurs que tu fais avec ta crème de nuit."], "", ["Sérum NovaSkin, lien en bio."], "", "Éducation", "4U") }),
  mkBrief({ id: "b-08", client_id: DEMO_IDS.mendo, title: "01 · La table qui dure 20 ans", kind: "video", status: "attente_ibra", position: 1, created_at: ago(3),
    content: videoContent("Atelier, artisan, bois massif.", ["Pourquoi ta table Ikea te coûte plus cher qu'une table à 1 200 €."], "Calcul : 3 tables à 400 € en 20 ans vs une à 1 200 € garantie à vie…", ["Configure la tienne."], "Plans atelier, mains, sciure.", "Investissement / coût réel", "PAS") }),
  mkBrief({ id: "b-09", client_id: DEMO_IDS.lea, title: "01 · Le programme en 12 min/jour", kind: "video", status: "redaction", position: 1, created_at: ago(1), assignee_id: DEMO_IDS.sarah,
    content: videoContent("Face cam coach.", ["Tu n'as pas besoin d'1h de sport. 12 minutes suffisent, si tu fais ça."], "", ["Webinaire gratuit jeudi."], "", "Objection temps", "AIDA") }),
  mkBrief({ id: "b-10", client_id: DEMO_IDS.bloom, title: "01 · De 0 à 10k€/mois (VSL courte)", kind: "video", status: "valide", month: shiftMonth(-2), position: 1, created_at: ago(70), validated_by: DEMO_IDS.ibra, validated_at: ago(60),
    content: videoContent("VSL 2 min.", ["Il y a 18 mois je vendais des bougies sur Vinted."], "…", ["Réserve ton appel."], "", "Storytelling résultat", "BAB") }),
];

const mkLiv = (l: Partial<Livrable> & Pick<Livrable, "id" | "client_id" | "title" | "kind" | "status">): Livrable => ({
  month: thisMonth(), file_url: "https://f.io/demo-review", duration_sec: 32, created_at: ago(5), brief_id: null, thumbnail_url: null, storage_path: null, updated_at: ago(1), ...l,
});

export const demoLivrables: Livrable[] = [
  mkLiv({ id: "l-01", client_id: DEMO_IDS.lashea, title: "Cils 6 semaines · V1 (9:16)", kind: "video", status: "attente_client", brief_id: "b-01", duration_sec: 41, created_at: ago(2) }),
  mkLiv({ id: "l-02", client_id: DEMO_IDS.lashea, title: "Rushs tournage 12/10", kind: "rush", status: "valide", duration_sec: null, created_at: ago(14) }),
  mkLiv({ id: "l-03", client_id: DEMO_IDS.lashea, title: "Routine du matin · Final", kind: "video", status: "valide", month: shiftMonth(-1), brief_id: "b-05", duration_sec: 28, created_at: ago(30) }),
  mkLiv({ id: "l-04", client_id: DEMO_IDS.lashea, title: "Statique BF · 4 formats", kind: "static", status: "en_controle", duration_sec: null, created_at: ago(1) }),
  mkLiv({ id: "l-05", client_id: DEMO_IDS.nova, title: "Dermato · V2 sous-titrée", kind: "video", status: "correction", brief_id: "b-06", duration_sec: 55, created_at: ago(4) }),
  mkLiv({ id: "l-06", client_id: DEMO_IDS.nova, title: "UGC Inès · 3 hooks", kind: "video", status: "en_controle", duration_sec: 24, created_at: ago(1) }),
  mkLiv({ id: "l-07", client_id: DEMO_IDS.mendo, title: "Atelier · teaser 15s", kind: "video", status: "valide", month: shiftMonth(-1), duration_sec: 15, created_at: ago(35) }),
  mkLiv({ id: "l-08", client_id: DEMO_IDS.bloom, title: "VSL courte · Final", kind: "video", status: "valide", month: shiftMonth(-2), brief_id: "b-10", duration_sec: 118, created_at: ago(58) }),
];

export const demoComments: LivrableComment[] = [
  { id: "lc-1", livrable_id: "l-05", author: DEMO_IDS.clientUser, body: "Le logo apparaît trop tard, peut-on le mettre dès la 2e seconde ?", created_at: ago(3) },
  { id: "lc-2", livrable_id: "l-05", author: DEMO_IDS.mehdi, body: "Bien noté, V3 en cours avec logo à 1,5 s et sous-titres jaunes.", created_at: ago(2) },
  { id: "lc-3", livrable_id: "l-01", author: DEMO_IDS.ibra, body: "Version contrôlée : hook 2 retenu, rythme OK. À toi Camille.", created_at: ago(2, 15) },
];

export const demoValidations: Validation[] = [
  { id: "v-1", client_id: DEMO_IDS.lashea, item_kind: "script", brief_id: "b-05", item_ref: "script-v1", decision: "valide", comment: null, decided_by: DEMO_IDS.ibra, created_at: ago(36) },
  { id: "v-2", client_id: DEMO_IDS.lashea, item_kind: "script", brief_id: "b-05", item_ref: "script-v1", decision: "valide", comment: "Parfait, go.", decided_by: DEMO_IDS.clientUser, created_at: ago(32) },
  { id: "v-3", client_id: DEMO_IDS.lashea, item_kind: "script", brief_id: "b-01", item_ref: "script-v1", decision: "valide", comment: null, decided_by: DEMO_IDS.ibra, created_at: ago(4) },
  { id: "v-4", client_id: DEMO_IDS.lashea, item_kind: "rushs", brief_id: null, item_ref: "l-02", decision: "valide", comment: null, decided_by: DEMO_IDS.clientUser, created_at: ago(12) },
  { id: "v-5", client_id: DEMO_IDS.nova, item_kind: "crea", brief_id: null, item_ref: "l-05", decision: "correction", comment: "Logo trop tard.", decided_by: DEMO_IDS.clientUser, created_at: ago(3) },
  { id: "v-6", client_id: DEMO_IDS.nova, item_kind: "script", brief_id: "b-06", item_ref: "script-v1", decision: "valide", comment: null, decided_by: DEMO_IDS.ibra, created_at: ago(5) },
];

export const demoAvatars: Avatar[] = [
  { id: "a-1", client_id: DEMO_IDS.lashea, name: "Camille (fondatrice)", preview_url: null, chosen: true, created_at: ago(100) },
  { id: "a-2", client_id: DEMO_IDS.lashea, name: "Maya · UGC 25-34", preview_url: null, chosen: true, created_at: ago(90) },
  { id: "a-3", client_id: DEMO_IDS.lashea, name: "Esthéticienne Nadia", preview_url: null, chosen: false, created_at: ago(60) },
  { id: "a-4", client_id: DEMO_IDS.nova, name: "Dr. Lemaire", preview_url: null, chosen: true, created_at: ago(80) },
  { id: "a-5", client_id: DEMO_IDS.nova, name: "Inès · UGC", preview_url: null, chosen: false, created_at: ago(50) },
  { id: "a-6", client_id: DEMO_IDS.mendo, name: "Julien (artisan)", preview_url: null, chosen: true, created_at: ago(70) },
];

export const demoDossiers: BrandDossier[] = [
  { client_id: DEMO_IDS.lashea, updated_at: ago(8), updated_by: DEMO_IDS.ibra, data: {
    promesse: "Des extensions de cils salon à la maison, 6 semaines de tenue, en 15 minutes.",
    personas: [
      { nom: "Camille, 29 ans, cadre pressée", resume: "Veut un regard soigné sans rendez-vous. Sensible au temps gagné et à la tenue." },
      { nom: "Maya, 23 ans, étudiante", resume: "Budget serré, achète sur TikTok, veut un résultat visible et des avis." },
    ],
    ton: "Complice, direct, sans jargon beauté. On parle résultats et temps gagné.",
    concurrents: ["Lilly Lashes", "Kiss Falscara", "Instituts à 90 €/pose"],
  } },
  { client_id: DEMO_IDS.nova, updated_at: ago(15), updated_by: DEMO_IDS.sarah, data: {
    promesse: "Un sérum formulé avec des dermatologues, efficace en 14 jours, prouvé par étude.",
    personas: [{ nom: "Inès, 34 ans", resume: "Peau mixte, premiers signes de l'âge, méfiante des promesses marketing." }],
    ton: "Scientifique, rassurant, preuve avant émotion.",
    concurrents: ["Typology", "The Ordinary", "Caudalie"],
  } },
  { client_id: DEMO_IDS.mendo, updated_at: ago(20), updated_by: DEMO_IDS.ibra, data: {
    promesse: "Du mobilier massif fabriqué en France, garanti à vie.",
    personas: [{ nom: "Couple 35-50 ans, propriétaires", resume: "Panier élevé, décision longue, recherche la durabilité." }],
    ton: "Artisanal, sobre, fier.",
    concurrents: ["Tikamoon", "Maisons du Monde", "La Redoute Intérieurs"],
  } },
];

export const demoBrainEntries: BrainEntry[] = [
  { id: "be-1", client_id: DEMO_IDS.lashea, section: "Produits & prix", kind: "fait", title: "Kit découverte", content: "Kit 39 € : 120 faisceaux, colle médicale 5 ml, pince. Tenue annoncée 6 semaines.", source_url: "https://lashea.fr/produits/kit", origin: "import", import_id: null, position: 1, created_at: ago(30), created_by: DEMO_IDS.ibra },
  { id: "be-2", client_id: DEMO_IDS.lashea, section: "Produits & prix", kind: "allegation", title: "Sans irritation", content: "Le site affirme « 0 irritation sur 500 testeuses ». Pas d'étude indépendante fournie.", source_url: "https://lashea.fr", origin: "import", import_id: null, position: 2, created_at: ago(30), created_by: DEMO_IDS.ibra },
  { id: "be-3", client_id: DEMO_IDS.lashea, section: "Produits & prix", kind: "conflit", title: "Deux durées de tenue", content: "Page produit : 6 semaines. FAQ : 4 à 6 semaines. À trancher avant les scripts.", source_url: "https://lashea.fr/faq", origin: "import", import_id: null, position: 3, created_at: ago(30), created_by: DEMO_IDS.ibra },
  { id: "be-4", client_id: DEMO_IDS.lashea, section: "Connaissances", kind: "manque", title: "Composition de la colle", content: "Aucune composition détaillée. Demander la fiche technique.", source_url: null, origin: "manuel", import_id: null, position: 1, created_at: ago(25), created_by: DEMO_IDS.sarah },
  { id: "be-5", client_id: DEMO_IDS.lashea, section: "Identité", kind: "note", title: "Histoire fondatrice", content: "Camille a créé Lashéa après 3 ans de poses en institut à 90 €. Angle 'j'en avais marre de payer' très fort.", source_url: null, origin: "manuel", import_id: null, position: 1, created_at: ago(20), created_by: DEMO_IDS.ibra },
  { id: "be-6", client_id: DEMO_IDS.lashea, section: "Directives", kind: "note", title: "Interdits", content: "Ne jamais montrer de colle sur la paupière. Pas de comparaison nominative avec les instituts.", source_url: null, origin: "manuel", import_id: null, position: 1, created_at: ago(20), created_by: DEMO_IDS.ibra },
  { id: "be-7", client_id: DEMO_IDS.nova, section: "Connaissances", kind: "fait", title: "Étude clinique", content: "Étude 2025 sur 60 participantes : -23 % de rides fines à J14 (niacinamide encapsulé 5 %).", source_url: "https://novaskin.co/etude", origin: "import", import_id: null, position: 1, created_at: ago(40), created_by: DEMO_IDS.sarah },
  { id: "be-8", client_id: DEMO_IDS.nova, section: "Directives", kind: "note", title: "Claims autorisés", content: "OK : 'testé dermatologiquement', 'résultats visibles en 14 jours'. Interdit : 'anti-âge miracle'.", source_url: null, origin: "manuel", import_id: null, position: 1, created_at: ago(38), created_by: DEMO_IDS.sarah },
  { id: "be-9", client_id: DEMO_IDS.mendo, section: "Produits & prix", kind: "fait", title: "Gamme", content: "Tables 1 200–3 400 €, chêne et noyer, délai 6 semaines, garantie à vie structure.", source_url: "https://ateliermendo.fr", origin: "import", import_id: null, position: 1, created_at: ago(50), created_by: DEMO_IDS.ibra },
];

const mkK = (k: Partial<Knowledge> & Pick<Knowledge, "id" | "title" | "category" | "body">): Knowledge => ({
  tags: [], segment: "tous", score: null, uses: 0, pinned: false, author_id: DEMO_IDS.ibra, created_at: ago(60), updated_at: ago(10), ...k,
});

export const demoKnowledge: Knowledge[] = [
  mkK({ id: "k-1", title: "Angle « coût réel sur 10 ans »", category: "angle", body: "Reframer le prix en coût total de possession. Fonctionne sur les paniers > 300 €. Hook type : « Pourquoi [produit pas cher] te coûte plus cher que [produit premium] ».", tags: ["panier élevé", "reframe prix"], segment: "ecommerce", score: 86, uses: 14, pinned: true }),
  mkK({ id: "k-2", title: "Angle « l'expert qui a changé d'avis »", category: "angle", body: "Un professionnel sceptique devient convaincu. Crédibilité + curiosité. Nécessite un vrai expert ou un acteur crédible + disclaimer.", tags: ["autorité", "UGC"], score: 91, uses: 22, pinned: true }),
  mkK({ id: "k-3", title: "Hook : « Personne ne t'a dit ça sur… »", category: "hook", body: "Hook rate moyen 38 % sur 11 créatives. Marche mieux en face cam, 1re personne, sans musique les 2 premières secondes.", tags: ["curiosité"], score: 78, uses: 11 }),
  mkK({ id: "k-4", title: "Hook : « J'ai testé X pendant 30 jours »", category: "hook", body: "Format journal. Hook rate 41 %. Prévoir 3 moments de preuve (J1, J15, J30).", tags: ["transformation"], score: 83, uses: 9 }),
  mkK({ id: "k-5", title: "Framework PAS", category: "framework", body: "Problème → Agitation → Solution. 1 phrase de problème, 2-3 phrases d'agitation concrète, solution avec preuve. Idéal 30-45 s.", tags: ["script"], pinned: true }),
  mkK({ id: "k-6", title: "Framework BAB", category: "framework", body: "Before → After → Bridge. Décrire l'avant (douleur), l'après (résultat), puis le pont (produit). Parfait pour les témoignages.", tags: ["script"] }),
  mkK({ id: "k-7", title: "Framework AIDA", category: "framework", body: "Attention → Intérêt → Désir → Action. Pour les formats > 45 s et les VSL courtes.", tags: ["script", "VSL"] }),
  mkK({ id: "k-8", title: "SOP · Onboarding client (J0 → J14)", category: "sop", body: "J0 contrat signé → J1 accès Meta + Brain intake → J3 appel stratégie 45 min → J5 angles validés → J8 scripts v1 → J10 contrôle Ibra → J12 validation client → J14 tournage.", tags: ["process"], pinned: true }),
  mkK({ id: "k-9", title: "SOP · Contrôle Ibra d'un script", category: "sop", body: "1) Hook en < 3 s ? 2) Un seul angle ? 3) Preuve concrète ? 4) CTA unique ? 5) Conforme aux directives du Brain ? Si 5/5 → attente client.", tags: ["process", "qualité"] }),
  mkK({ id: "k-10", title: "Swipe · UGC skincare (Typology)", category: "swipe", body: "Structure : hook objection → démonstration texture → résultat J14 → CTA code promo. À adapter sans copier.", tags: ["skincare"], segment: "ecommerce" }),
  mkK({ id: "k-11", title: "Insight · 2 premières secondes sans musique", category: "insight", body: "Sur 40 créatives Meta testées : +6 pts de hook rate quand la voix démarre avant la musique.", tags: ["data"], score: 72 }),
  mkK({ id: "k-12", title: "Objection · « C'est trop cher »", category: "objection", body: "Réponses : coût par usage, comparaison alternative, garantie. Ne jamais répondre par une remise en premier.", tags: ["vente"] }),
  mkK({ id: "k-13", title: "Prompt · 10 hooks à partir d'un angle", category: "prompt", body: "Tu es copywriter performance. Angle : {{angle}}. Persona : {{persona}}. Génère 10 hooks < 12 mots, 1re personne, sans point d'exclamation, variés (question, chiffre, contradiction, confession).", tags: ["IA"] }),
  mkK({ id: "k-14", title: "Prompt · Script PAS 40 s", category: "prompt", body: "À partir du hook {{hook}} et du Brain {{brain}}, écris un script PAS de 40 s max, oral, phrases courtes, 1 CTA.", tags: ["IA", "script"] }),
];

const mkTask = (t: Partial<Task> & Pick<Task, "id" | "title" | "status">): Task => ({
  description: null, priority: "normale", assignee_id: DEMO_IDS.ibra, client_id: null, brief_id: null, livrable_id: null,
  due_date: null, position: 0, labels: [], created_by: DEMO_IDS.ibra, created_at: ago(5), updated_at: ago(1), ...t,
});

export const demoTasks: Task[] = [
  mkTask({ id: "t-1", title: "Contrôle Ibra · script Réaction esthéticienne", status: "a_faire", priority: "haute", client_id: DEMO_IDS.lashea, brief_id: "b-02", due_date: day(-1), position: 0, labels: ["script"] }),
  mkTask({ id: "t-2", title: "Relancer Camille pour validation V1", status: "a_faire", priority: "urgente", client_id: DEMO_IDS.lashea, livrable_id: "l-01", due_date: day(0), position: 1, labels: ["client"] }),
  mkTask({ id: "t-3", title: "Montage V3 Dermato (logo à 1,5 s)", status: "en_cours", priority: "haute", assignee_id: DEMO_IDS.mehdi, client_id: DEMO_IDS.nova, livrable_id: "l-05", due_date: day(-2), position: 0, labels: ["montage"] }),
  mkTask({ id: "t-4", title: "Écrire script 03 Avant/Après 30 jours", status: "en_cours", assignee_id: DEMO_IDS.sarah, client_id: DEMO_IDS.lashea, brief_id: "b-03", due_date: day(-3), position: 1, labels: ["script"] }),
  mkTask({ id: "t-5", title: "Brain Léa Fit : personas + objections", status: "en_cours", priority: "haute", client_id: DEMO_IDS.lea, due_date: day(-4), position: 2, labels: ["onboarding"] }),
  mkTask({ id: "t-6", title: "Préparer rapport mensuel NovaSkin", status: "revue", assignee_id: DEMO_IDS.sarah, client_id: DEMO_IDS.nova, due_date: day(-1), position: 0, labels: ["reporting"] }),
  mkTask({ id: "t-7", title: "Facture octobre Lashéa", status: "termine", client_id: DEMO_IDS.lashea, position: 0, labels: ["admin"], updated_at: ago(3) }),
  mkTask({ id: "t-8", title: "Tournage studio Mendo · réserver le 14", status: "a_faire", client_id: DEMO_IDS.mendo, due_date: day(-6), position: 2, labels: ["tournage"] }),
  mkTask({ id: "t-9", title: "Tester angle « investissement 20 ans » (3 hooks)", status: "a_faire", priority: "haute", assignee_id: DEMO_IDS.sarah, client_id: DEMO_IDS.mendo, position: 3, labels: ["test"] }),
  mkTask({ id: "t-10", title: "Mettre à jour la SOP onboarding", status: "a_faire", priority: "basse", position: 4, labels: ["interne"] }),
  mkTask({ id: "t-11", title: "Sous-titres UGC Inès", status: "termine", assignee_id: DEMO_IDS.mehdi, client_id: DEMO_IDS.nova, livrable_id: "l-06", position: 1, labels: ["montage"], updated_at: ago(1) }),
];

export const demoDocuments: Document[] = [
  { id: "d-1", title: "Stratégie Q4 · Lashéa", icon: "🎯", kind: "strategie", client_id: DEMO_IDS.lashea, shared_with_client: true, author_id: DEMO_IDS.ibra, parent_id: null, archived_at: null, created_at: ago(20), updated_at: ago(2),
    content: "<h1>Stratégie Q4 · Lashéa</h1><p><strong>Objectif :</strong> passer de 18 k€ à 30 k€ de budget mensuel avec un CPA stable sous 28 €.</p><h2>Angles prioritaires</h2><ul><li>Gain de temps + preuve sociale (hook rate 38 %)</li><li>Autorité esthéticienne</li><li>Transformation 30 jours</li></ul><h2>Calendrier</h2><p>Tournage le 2e mardi du mois, 6 créatives livrées avant le 20, test 7 jours, scaling des winners.</p><blockquote>On ne scale que ce qui a un hook rate > 30 % et un CPA < 32 € sur 3 jours.</blockquote>" },
  { id: "d-2", title: "Compte-rendu · appel du 21/10", icon: "📞", kind: "compte_rendu", client_id: DEMO_IDS.lashea, shared_with_client: true, author_id: DEMO_IDS.ibra, parent_id: null, archived_at: null, created_at: ago(9), updated_at: ago(9),
    content: "<h1>Appel Lashéa · 21 octobre</h1><p>Présents : Camille, Thomas, Ibra, Sarah.</p><h2>Décisions</h2><ol><li>Black Friday : offre -20 % du 24 au 30/11.</li><li>Nouveau packaging disponible le 10/11 → shoot statique après.</li><li>Camille tourne 2 UGC face cam par mois.</li></ol><h2>Actions</h2><ul><li>Sarah : scripts BF avant le 5/11</li><li>Thomas : accès catalogue Meta</li></ul>" },
  { id: "d-3", title: "Brief tournage · 12 novembre", icon: "🎬", kind: "brief", client_id: DEMO_IDS.lashea, shared_with_client: false, author_id: DEMO_IDS.sarah, parent_id: null, archived_at: null, created_at: ago(5), updated_at: ago(1),
    content: "<h1>Brief tournage · 12/11</h1><p>Lieu : appartement Camille, lumière naturelle 10h-13h.</p><h2>Plans</h2><ul><li>Démo pose complète (3 prises)</li><li>Réaction miroir</li><li>B-roll kit + packaging</li></ul><h2>Matériel</h2><p>iPhone 15 Pro, micro cravate, réflecteur.</p>" },
  { id: "d-4", title: "Playbook agence · Process créatif", icon: "📘", kind: "sop", client_id: null, shared_with_client: false, author_id: DEMO_IDS.ibra, parent_id: null, archived_at: null, created_at: ago(90), updated_at: ago(12),
    content: "<h1>Process créatif icon-flow</h1><h2>1. Audit & stratégie</h2><p>Marché, concurrents, angles psychologiques. Livrable : document Stratégie partagé.</p><h2>2. Script</h2><p>Frameworks AIDA, PAS, BAB. Contrôle Ibra obligatoire avant le client.</p><h2>3. Production</h2><p>Tournage natif 9:16, sous-titres, 3 hooks par concept.</p><h2>4. Itération</h2><p>Hook rate, CTR, CPA, ROAS. On coupe à J3, on scale à J7.</p>" },
  { id: "d-5", title: "Template · Compte-rendu d'appel", icon: "🧩", kind: "template", client_id: null, shared_with_client: false, author_id: DEMO_IDS.ibra, parent_id: null, archived_at: null, created_at: ago(80), updated_at: ago(80),
    content: "<h1>Appel {{client}} · {{date}}</h1><p>Présents :</p><h2>Décisions</h2><ol><li></li></ol><h2>Actions</h2><ul><li></li></ul><h2>Prochain point</h2><p></p>" },
  { id: "d-6", title: "Stratégie lancement · NovaSkin TikTok", icon: "🎯", kind: "strategie", client_id: DEMO_IDS.nova, shared_with_client: true, author_id: DEMO_IDS.sarah, parent_id: null, archived_at: null, created_at: ago(30), updated_at: ago(6),
    content: "<h1>NovaSkin · TikTok Q4</h1><p>Budget test 8 k€ sur 3 semaines, 12 créatives UGC, 3 avatars.</p><h2>KPIs</h2><ul><li>Hook rate > 35 %</li><li>CPA < 24 €</li></ul>" },
  { id: "d-7", title: "Onboarding · Léa Fit Academy", icon: "🚀", kind: "doc", client_id: DEMO_IDS.lea, shared_with_client: true, author_id: DEMO_IDS.ibra, parent_id: null, archived_at: null, created_at: ago(10), updated_at: ago(2),
    content: "<h1>Bienvenue Léa 👋</h1><p>Voici les étapes des 14 prochains jours.</p><ol><li>Accès Meta ✅</li><li>Brain : personas et objections (en cours)</li><li>Appel stratégie jeudi 10h</li><li>Premiers scripts J+8</li></ol>" },
  { id: "d-8", title: "Grille tarifaire 2026", icon: "💶", kind: "doc", client_id: null, shared_with_client: false, author_id: DEMO_IDS.ibra, parent_id: null, archived_at: null, created_at: ago(100), updated_at: ago(40),
    content: "<h1>Grille 2026</h1><ul><li>Retainer Starter : 1 500 € / 4 créatives</li><li>Retainer Scale : 2 500 € / 8 créatives</li><li>Retainer Performance : 3 500 € / 12 créatives + 6-12 % des résultats</li></ul>" },
];

const mkFile = (f: Partial<FileAsset> & Pick<FileAsset, "id" | "name" | "folder">): FileAsset => ({
  path: `clients/${f.client_id ?? "agence"}/${f.folder}/${f.name}`, mime: "video/mp4", size: 1024 * 1024 * between(8, 240),
  client_id: null, livrable_id: null, shared_with_client: false, uploaded_by: DEMO_IDS.mehdi, created_at: ago(between(1, 40)), ...f,
});

export const demoFiles: FileAsset[] = [
  mkFile({ id: "f-1", name: "lashea-cils6sem-v1-9x16.mp4", folder: "Exports", client_id: DEMO_IDS.lashea, livrable_id: "l-01", shared_with_client: true }),
  mkFile({ id: "f-2", name: "lashea-cils6sem-v1-1x1.mp4", folder: "Exports", client_id: DEMO_IDS.lashea, livrable_id: "l-01", shared_with_client: true }),
  mkFile({ id: "f-3", name: "rushs-12-10-cam-A.mov", folder: "Rushs", client_id: DEMO_IDS.lashea, mime: "video/quicktime", size: 1024 * 1024 * 1890 }),
  mkFile({ id: "f-4", name: "rushs-12-10-cam-B.mov", folder: "Rushs", client_id: DEMO_IDS.lashea, mime: "video/quicktime", size: 1024 * 1024 * 1620 }),
  mkFile({ id: "f-5", name: "lashea-logo.svg", folder: "Brand kit", client_id: DEMO_IDS.lashea, mime: "image/svg+xml", size: 24000, shared_with_client: true }),
  mkFile({ id: "f-6", name: "lashea-charte.pdf", folder: "Brand kit", client_id: DEMO_IDS.lashea, mime: "application/pdf", size: 3_400_000, shared_with_client: true }),
  mkFile({ id: "f-7", name: "contrat-lashea-2026.pdf", folder: "Contrats", client_id: DEMO_IDS.lashea, mime: "application/pdf", size: 420_000, uploaded_by: DEMO_IDS.ibra }),
  mkFile({ id: "f-8", name: "novaskin-dermato-v2-sub.mp4", folder: "Exports", client_id: DEMO_IDS.nova, livrable_id: "l-05", shared_with_client: true }),
  mkFile({ id: "f-9", name: "novaskin-etude-clinique.pdf", folder: "Dépôt client", client_id: DEMO_IDS.nova, mime: "application/pdf", size: 1_900_000, shared_with_client: true, uploaded_by: DEMO_IDS.clientUser }),
  mkFile({ id: "f-10", name: "mendo-atelier-teaser.mp4", folder: "Exports", client_id: DEMO_IDS.mendo, livrable_id: "l-07", shared_with_client: true }),
  mkFile({ id: "f-11", name: "packshots-tables-2026.zip", folder: "Dépôt client", client_id: DEMO_IDS.mendo, mime: "application/zip", size: 1024 * 1024 * 740, uploaded_by: DEMO_IDS.clientUser }),
  mkFile({ id: "f-12", name: "iconflow-presentation-agence.pdf", folder: "Commercial", client_id: null, mime: "application/pdf", size: 8_200_000, uploaded_by: DEMO_IDS.ibra }),
  mkFile({ id: "f-13", name: "musiques-libres-pack-03.zip", folder: "Ressources", client_id: null, mime: "application/zip", size: 1024 * 1024 * 310 }),
];

export const demoInvoices: Invoice[] = [
  { id: "i-1", number: "F-2026-0041", type: "facture", client_id: DEMO_IDS.lashea, status: "payee", issue_date: day(35), due_date: day(5), paid_at: ago(8), notes: null, created_by: DEMO_IDS.ibra, created_at: ago(35), updated_at: ago(8),
    lines: [{ id: "il-1", label: "Retainer Scale · octobre", qty: 1, unit_price: 2500, vat_pct: 20 }, { id: "il-2", label: "Commission performance (8 % · 14 200 € de CA attribué)", qty: 1, unit_price: 1136, vat_pct: 20 }] },
  { id: "i-2", number: "F-2026-0042", type: "facture", client_id: DEMO_IDS.lashea, status: "envoyee", issue_date: day(3), due_date: day(-27), paid_at: null, notes: "Paiement par virement. Merci.", created_by: DEMO_IDS.ibra, created_at: ago(3), updated_at: ago(3),
    lines: [{ id: "il-3", label: "Retainer Scale · novembre", qty: 1, unit_price: 2500, vat_pct: 20 }] },
  { id: "i-3", number: "F-2026-0039", type: "facture", client_id: DEMO_IDS.nova, status: "en_retard", issue_date: day(50), due_date: day(20), paid_at: null, notes: null, created_by: DEMO_IDS.ibra, created_at: ago(50), updated_at: ago(1),
    lines: [{ id: "il-4", label: "Retainer Performance · septembre", qty: 1, unit_price: 3500, vat_pct: 20 }, { id: "il-5", label: "Tournage studio (journée)", qty: 1, unit_price: 1200, vat_pct: 20 }] },
  { id: "i-4", number: "F-2026-0043", type: "facture", client_id: DEMO_IDS.nova, status: "envoyee", issue_date: day(2), due_date: day(-28), paid_at: null, notes: null, created_by: DEMO_IDS.ibra, created_at: ago(2), updated_at: ago(2),
    lines: [{ id: "il-6", label: "Retainer Performance · novembre", qty: 1, unit_price: 3500, vat_pct: 20 }] },
  { id: "i-5", number: "F-2026-0040", type: "facture", client_id: DEMO_IDS.mendo, status: "payee", issue_date: day(33), due_date: day(3), paid_at: ago(4), notes: null, created_by: DEMO_IDS.ibra, created_at: ago(33), updated_at: ago(4),
    lines: [{ id: "il-7", label: "Retainer Starter · octobre", qty: 1, unit_price: 1800, vat_pct: 20 }] },
  { id: "i-6", number: "D-2026-0012", type: "devis", client_id: DEMO_IDS.lea, status: "envoyee", issue_date: day(12), due_date: day(-18), paid_at: null, notes: "Valable 30 jours.", created_by: DEMO_IDS.ibra, created_at: ago(12), updated_at: ago(12),
    lines: [{ id: "il-8", label: "Retainer Scale · 3 mois", qty: 3, unit_price: 2000, vat_pct: 20 }, { id: "il-9", label: "Audit stratégique", qty: 1, unit_price: 900, vat_pct: 20 }] },
  { id: "i-7", number: "F-2026-0044", type: "facture", client_id: DEMO_IDS.mendo, status: "brouillon", issue_date: day(0), due_date: day(-30), paid_at: null, notes: null, created_by: DEMO_IDS.ibra, created_at: ago(0), updated_at: ago(0),
    lines: [{ id: "il-10", label: "Retainer Starter · novembre", qty: 1, unit_price: 1800, vat_pct: 20 }] },
  { id: "i-8", number: "F-2026-0031", type: "facture", client_id: DEMO_IDS.bloom, status: "payee", issue_date: day(75), due_date: day(45), paid_at: ago(44), notes: null, created_by: DEMO_IDS.ibra, created_at: ago(75), updated_at: ago(44),
    lines: [{ id: "il-11", label: "Retainer Performance · août", qty: 1, unit_price: 3000, vat_pct: 20 }, { id: "il-12", label: "Commission performance", qty: 1, unit_price: 2400, vat_pct: 20 }] },
];

export const demoMessages: Message[] = [
  { id: "m-1", client_id: DEMO_IDS.lashea, author_id: DEMO_IDS.ibra, body: "Hello Camille, la V1 « Cils 6 semaines » est prête à valider dans Livrables. On a gardé le hook 2.", created_at: ago(2, 15) },
  { id: "m-2", client_id: DEMO_IDS.lashea, author_id: DEMO_IDS.clientUser, body: "Top ! Je regarde ce soir. Le script Réaction esthéticienne arrive quand ?", created_at: ago(2, 18) },
  { id: "m-3", client_id: DEMO_IDS.lashea, author_id: DEMO_IDS.ibra, body: "Contrôle demain matin, tu l'auras avant midi.", created_at: ago(2, 19) },
  { id: "m-4", client_id: DEMO_IDS.nova, author_id: DEMO_IDS.clientUser, body: "On peut avancer le logo sur la V2 Dermato ? Il apparaît à 6 s.", created_at: ago(3, 11) },
  { id: "m-5", client_id: DEMO_IDS.nova, author_id: DEMO_IDS.mehdi, body: "Oui, V3 en cours avec logo à 1,5 s.", created_at: ago(3, 12) },
];

export const demoActivity: Activity[] = [
  { id: "ac-1", kind: "livrable.status", actor_id: DEMO_IDS.ibra, client_id: DEMO_IDS.lashea, entity_id: "l-01", summary: "Cils 6 semaines · V1 → attente client", created_at: ago(2, 14) },
  { id: "ac-2", kind: "validation", actor_id: DEMO_IDS.clientUser, client_id: DEMO_IDS.nova, entity_id: "l-05", summary: "Correction demandée sur Dermato · V2", created_at: ago(3, 11) },
  { id: "ac-3", kind: "brief.status", actor_id: DEMO_IDS.sarah, client_id: DEMO_IDS.lashea, entity_id: "b-02", summary: "Réaction esthéticienne → contrôle Ibra", created_at: ago(3, 17) },
  { id: "ac-4", kind: "doc.shared", actor_id: DEMO_IDS.ibra, client_id: DEMO_IDS.lashea, entity_id: "d-2", summary: "Compte-rendu du 21/10 partagé avec Lashéa", created_at: ago(9, 16) },
  { id: "ac-5", kind: "invoice.paid", actor_id: null, client_id: DEMO_IDS.lashea, entity_id: "i-1", summary: "Facture F-2026-0041 payée (4 363 € TTC)", created_at: ago(8, 9) },
  { id: "ac-6", kind: "file.uploaded", actor_id: DEMO_IDS.clientUser, client_id: DEMO_IDS.nova, entity_id: "f-9", summary: "Étude clinique déposée par NovaSkin", created_at: ago(12, 10) },
  { id: "ac-7", kind: "client.stage", actor_id: DEMO_IDS.ibra, client_id: DEMO_IDS.lea, entity_id: null, summary: "Léa Fit Academy → onboarding", created_at: ago(10, 9) },
  { id: "ac-8", kind: "task.done", actor_id: DEMO_IDS.mehdi, client_id: DEMO_IDS.nova, entity_id: "t-11", summary: "Sous-titres UGC Inès terminés", created_at: ago(1, 18) },
  { id: "ac-9", kind: "brief.created", actor_id: DEMO_IDS.sarah, client_id: DEMO_IDS.nova, entity_id: "b-07", summary: "Nouveau brief : 3 erreurs skincare après 30 ans", created_at: ago(1, 10) },
  { id: "ac-10", kind: "message", actor_id: DEMO_IDS.clientUser, client_id: DEMO_IDS.lashea, entity_id: "m-2", summary: "Camille a répondu dans la messagerie", created_at: ago(2, 18) },
];

export const demoEvents: CalendarEvent[] = [
  { id: "e-1", title: "Tournage Lashéa · appartement Camille", kind: "tournage", starts_at: inDays(5, 10), ends_at: inDays(5, 13), client_id: DEMO_IDS.lashea, notes: "Micro cravate + réflecteur", created_by: DEMO_IDS.ibra },
  { id: "e-2", title: "Appel stratégie Léa Fit", kind: "appel", starts_at: inDays(2, 10), ends_at: inDays(2, 11), client_id: DEMO_IDS.lea, notes: null, created_by: DEMO_IDS.ibra },
  { id: "e-3", title: "Livraison 6 créatives NovaSkin", kind: "livraison", starts_at: inDays(8, 18), ends_at: null, client_id: DEMO_IDS.nova, notes: null, created_by: DEMO_IDS.sarah },
  { id: "e-4", title: "Deadline scripts Black Friday", kind: "deadline", starts_at: inDays(6, 12), ends_at: null, client_id: DEMO_IDS.lashea, notes: null, created_by: DEMO_IDS.sarah },
  { id: "e-5", title: "Tournage studio Mendo", kind: "tournage", starts_at: inDays(15, 9), ends_at: inDays(15, 17), client_id: DEMO_IDS.mendo, notes: "Studio Bastille", created_by: DEMO_IDS.ibra },
  { id: "e-6", title: "Point équipe hebdo", kind: "interne", starts_at: inDays(1, 9), ends_at: inDays(1, 10), client_id: null, notes: null, created_by: DEMO_IDS.ibra },
  { id: "e-7", title: "Revue perf NovaSkin", kind: "appel", starts_at: inDays(-2, 15), ends_at: inDays(-2, 16), client_id: DEMO_IDS.nova, notes: null, created_by: DEMO_IDS.ibra },
  { id: "e-8", title: "Point équipe hebdo", kind: "interne", starts_at: inDays(8, 9), ends_at: inDays(8, 10), client_id: null, notes: null, created_by: DEMO_IDS.ibra },
];

// 12 semaines de métriques par client actif (hebdo, lundi)
function weeklyMetrics(clientId: string, livrables: string[], base: { spend: number; cpm: number; hook: number; ctr: number; cvr: number; aov: number }, trend: number): Metric[] {
  const rows: Metric[] = [];
  const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let w = 11; w >= 0; w--) {
    const d = new Date(monday); d.setDate(d.getDate() - w * 7);
    const growth = 1 + trend * (11 - w) / 11;
    const spend = Math.round(base.spend * growth * (0.85 + rnd() * 0.3));
    const impressions = Math.round((spend / base.cpm) * 1000);
    const thruplays = Math.round(impressions * base.hook * (0.9 + rnd() * 0.2));
    const clicks = Math.round(impressions * base.ctr * (0.9 + rnd() * 0.2));
    const purchases = Math.round(clicks * base.cvr * (0.85 + rnd() * 0.3));
    rows.push({ id: `mt-${clientId.slice(-2)}-${w}`, client_id: clientId, livrable_id: livrables[w % livrables.length] ?? null, period_start: d.toISOString().slice(0, 10), spend, impressions, clicks, thruplays_3s: thruplays, purchases, revenue: Math.round(purchases * base.aov) });
  }
  return rows;
}

export const demoMetrics: Metric[] = [
  ...weeklyMetrics(DEMO_IDS.lashea, ["l-01", "l-03"], { spend: 4200, cpm: 7.8, hook: 0.36, ctr: 0.021, cvr: 0.062, aov: 54 }, 0.45),
  ...weeklyMetrics(DEMO_IDS.nova, ["l-05", "l-06"], { spend: 7500, cpm: 9.2, hook: 0.31, ctr: 0.017, cvr: 0.048, aov: 68 }, 0.2),
  ...weeklyMetrics(DEMO_IDS.mendo, ["l-07"], { spend: 2100, cpm: 11.5, hook: 0.27, ctr: 0.012, cvr: 0.011, aov: 1650 }, -0.25),
  ...weeklyMetrics(DEMO_IDS.bloom, ["l-08"], { spend: 5800, cpm: 13.1, hook: 0.29, ctr: 0.015, cvr: 0.004, aov: 2900 }, -0.6),
];
