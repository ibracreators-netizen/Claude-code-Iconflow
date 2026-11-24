/**
 * Vérification hors ligne des liens « à confirmer d'un clic » (invitation, lien de connexion).
 * Lancer : pnpm dlx tsx scripts/auth-confirm-selfcheck.ts
 */
import { afterConfirm, confirmLink, isConfirmType } from "../src/lib/auth/confirm-link";
import { redactSecretPaths } from "../src/instrumentation";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log("ÉCHEC :", label); } };

const hash = "1767d6eb7fd1138e2c33f1b1bbfa8faca23cf950cbc23f1aab3179f4".replace(/./g, (c, i) => (i % 2 ? "a" : c)); // empreinte factice
const raw = "https://exemple.supabase.co/auth/v1/verify?token=x&type=invite&redirect_to=https://studio.iconflow.fr/auth/callback";

const inv = new URL(confirmLink("https://studio.iconflow.fr/", { hashed_token: hash, action_link: raw }, "invite"));
ok("invitation : page de l'app, pas Supabase", inv.origin === "https://studio.iconflow.fr" && inv.pathname === "/auth/confirm");
ok("invitation : empreinte et type dans l'adresse, pas de next par défaut", inv.searchParams.get("token_hash") === hash && inv.searchParams.get("type") === "invite" && !inv.searchParams.has("next"));
const ml = new URL(confirmLink("https://studio.iconflow.fr", { hashed_token: hash, action_link: raw }, "magiclink", "/marketing/kpi"));
ok("lien de connexion : next interne gardé", ml.searchParams.get("next") === "/marketing/kpi" && ml.searchParams.get("type") === "magiclink");
ok("next externe refusé (redirection ouverte)", !new URL(confirmLink("https://studio.iconflow.fr", { hashed_token: hash, action_link: raw }, "magiclink", "//evil.example")).searchParams.has("next"));
ok("sans empreinte : repli sur le lien de Supabase", confirmLink("https://studio.iconflow.fr", { hashed_token: null, action_link: raw }, "invite") === raw);
ok("empreinte bizarre : repli sur le lien de Supabase", confirmLink("https://studio.iconflow.fr", { hashed_token: "a b<script>", action_link: raw }, "invite") === raw);

ok("après une invitation : choix du mot de passe", afterConfirm("invite", "/marketing") === "/bienvenue?next=%2Fmarketing");
ok("après une récupération : choix du mot de passe", afterConfirm("recovery", "/") === "/bienvenue?next=%2F");
ok("après un lien de connexion : page demandée", afterConfirm("magiclink", "/studio/clients") === "/studio/clients");
ok("après un lien de connexion : next externe refusé", afterConfirm("magiclink", "https://evil.example") === "/");
ok("types acceptés seulement", isConfirmType("invite") && isConfirmType("magiclink") && isConfirmType("recovery") && !isConfirmType("signup") && !isConfirmType("email_change") && !isConfirmType(null));

ok("journal : empreinte masquée", redactSecretPaths(`/auth/confirm?token_hash=${hash}&type=invite`) === "/auth/confirm?token_hash=[jeton]&type=invite");
ok("journal : jeton Supabase masqué", redactSecretPaths("/auth/v1/verify?token=abc123&type=invite") === "/auth/v1/verify?token=[jeton]&type=invite");
ok("journal : liens à jeton toujours masqués", redactSecretPaths("/kpi/abcdefghijklmnopqrstuvwxyz012345") === "/kpi/[jeton]");

console.log(`${pass} vérification(s) réussie(s), ${fail} échec(s).`);
if (fail) process.exit(1);
