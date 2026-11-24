/**
 * Vérification hors ligne de la liaison Google Agenda (lecture seule). Aucun réseau : Google est remplacé
 * par de fausses réponses. Lancer : pnpm dlx tsx scripts/google-selfcheck.ts
 */
import { GoogleAuthError, exchangeCode, getEvent, listCalendars, listEvents, refreshAccess } from "../src/lib/marketing/google/api";
import { GOOGLE_SCOPE, authUrl, mapCalendar, mapEvent, matchAppointment, matchContact } from "../src/lib/marketing/google/core";
import { decrypt, encrypt, readState, signState } from "../src/lib/marketing/google/crypto";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`ÉCHEC ${name} ${extra}`); } };
const SECRET = "une-cle-de-test-de-plus-de-32-caracteres!!";
const cfg = { clientId: "id", clientSecret: "secret", redirectUri: "https://studio.exemple.fr/api/marketing/google/callback" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

(async () => {
  console.log("Jeton chiffré");
  const enc = encrypt("1//jeton-de-renouvellement", SECRET);
  ok("le jeton stocké ne contient pas le jeton en clair", !enc.includes("jeton-de-renouvellement") && enc.startsWith("v1."));
  ok("déchiffrement avec la bonne clé", decrypt(enc, SECRET) === "1//jeton-de-renouvellement");
  let refused = false; try { decrypt(enc, "une-autre-cle-de-plus-de-32-caracteres!!!"); } catch { refused = true; }
  ok("mauvaise clé : refusé", refused);
  refused = false; try { decrypt(enc.slice(0, -4) + "AAAA", SECRET); } catch { refused = true; }
  ok("jeton altéré : refusé", refused);
  refused = false; try { encrypt("x", "trop-court"); } catch { refused = true; }
  ok("clé absente ou trop courte : on ne stocke rien", refused);
  ok("deux chiffrements du même jeton diffèrent", encrypt("a", SECRET) !== encrypt("a", SECRET));

  console.log("État de connexion");
  const now = Date.now(), state = signState({ u: "membre-1", n: "nonce", t: now }, SECRET);
  ok("état relu tel qu'émis", readState(state, SECRET, now)?.u === "membre-1");
  ok("état falsifié : refusé", readState(state.replace(/^./, "X"), SECRET, now) === null && readState(`${state}x`, SECRET, now) === null);
  ok("état de plus de dix minutes : refusé", readState(state, SECRET, now + 11 * 60_000) === null);
  ok("état signé avec une autre clé : refusé", readState(state, "une-autre-cle-de-plus-de-32-caracteres!!!", now) === null);

  console.log("Demande d'accès");
  const url = new URL(authUrl({ clientId: "id", redirectUri: cfg.redirectUri, state: "s", loginHint: "moi@exemple.fr" }));
  ok("seul droit demandé : lire les agendas", url.searchParams.get("scope") === GOOGLE_SCOPE && GOOGLE_SCOPE.endsWith("calendar.readonly"));
  ok("accès hors ligne et consentement (jeton de renouvellement)", url.searchParams.get("access_type") === "offline" && url.searchParams.get("prompt") === "consent");

  console.log("Événements");
  const cal = { id: "moi@exemple.fr", name: "Moi" };
  const rdv = mapEvent({ id: "e1", summary: "Audit Maison J", status: "confirmed", htmlLink: "https://calendar.google.com/x", start: { dateTime: "2026-11-16T10:00:00+01:00" }, end: { dateTime: "2026-11-16T10:30:00+01:00" },
    attendees: [{ email: "moi@exemple.fr", self: true }, { email: "Jean@Exemple.fr" }, { email: "closer@agence.fr" }] }, cal, "moi@exemple.fr")!;
  ok("horaires en UTC, invités sans le propriétaire", rdv.starts_at === "2026-11-16T09:00:00.000Z" && rdv.ends_at === "2026-11-16T09:30:00.000Z" && rdv.attendees.join() === "jean@exemple.fr,closer@agence.fr");
  ok("avec un invité : rendez-vous", rdv.kind === "rdv");
  const block = mapEvent({ id: "e2", summary: "Focus", start: { dateTime: "2026-11-16T14:00:00Z" }, end: { dateTime: "2026-11-16T16:00:00Z" } }, cal, "moi@exemple.fr")!;
  ok("sans invité : créneau bloqué", block.kind === "bloque" && block.attendees.length === 0);
  const day = mapEvent({ id: "e3", summary: "Congé", start: { date: "2026-11-17" }, end: { date: "2026-11-18" } }, cal, null)!;
  ok("journée entière reconnue", day.all_day && day.starts_at === "2026-11-17T00:00:00.000Z");
  ok("événement annulé signalé, événement sans date ignoré", mapEvent({ id: "e4", status: "cancelled", start: { dateTime: "2026-11-16T10:00:00Z" }, end: { dateTime: "2026-11-16T11:00:00Z" } }, cal, null)!.cancelled && mapEvent({ id: "e5" }, cal, null) === null);
  const inv = mapEvent({ id: "serie_20261201T100000Z", recurringEventId: "serie", start: { dateTime: "2026-12-01T10:00:00Z" }, end: { dateTime: "2026-12-01T10:30:00Z" },
    attendees: [{ email: "moi@exemple.fr", self: true, responseStatus: "needsAction" }, { email: "Vendeur@Saas.io", responseStatus: "declined" }, { email: "autre@client.fr", responseStatus: "accepted" }] }, cal, "moi@exemple.fr")!;
  ok("réponse du propriétaire, invités qui ont refusé et série récurrente gardés", inv.self_response === "needsAction" && inv.declined?.join() === "vendeur@saas.io" && inv.recurring_event_id === "serie");
  ok("sans réponse connue : rien", rdv.self_response === null && rdv.declined?.length === 0 && rdv.recurring_event_id === null);
  ok("agenda principal coché par défaut, choix du membre conservé", mapCalendar({ id: "a", summary: "A", primary: true })!.selected && !mapCalendar({ id: "b", summary: "B" })!.selected && mapCalendar({ id: "b", summary: "B" }, [{ id: "b", name: "B", primary: false, selected: true }])!.selected);

  console.log("Rapprochements");
  const contacts = new Map([["jean@exemple.fr", "contact-jean"], ["closer@agence.fr", "contact-closer"]]), team = new Set(["closer@agence.fr", "moi@exemple.fr"]);
  ok("contact reconnu par l'email de l'invité", matchContact(rdv, contacts, team) === "contact-jean");
  ok("un membre de l'équipe invité n'est pas pris pour le contact", matchContact({ attendees: ["closer@agence.fr"] }, contacts, team) === null);
  const appts = [{ id: "rdv-iclosed", starts_at: "2026-11-16T09:02:00.000Z", contact_id: "contact-jean", status: "confirme" }];
  ok("même rendez-vous déjà reçu d'iClosed : reconnu (une seule fois à l'écran)", matchAppointment(rdv, "contact-jean", appts) === "rdv-iclosed");
  ok("autre heure ou autre contact : pas le même rendez-vous", matchAppointment({ starts_at: "2026-11-16T11:00:00.000Z" }, "contact-jean", appts) === null && matchAppointment(rdv, "contact-autre", appts) === null && matchAppointment(rdv, null, appts) === null);
  ok("rendez-vous annulé côté iClosed : pas de rapprochement", matchAppointment(rdv, "contact-jean", [{ ...appts[0], status: "annule" }]) === null);

  console.log("Appels à Google (fausses réponses)");
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fake = (handler: (url: string) => Response) => (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") }); return handler(String(input)); }) as unknown as typeof fetch;
  const tokens = await exchangeCode(cfg, "code", fake(() => json({ access_token: "acces", refresh_token: "renouvellement", scope: GOOGLE_SCOPE })));
  ok("échange du code : accès et jeton de renouvellement", tokens.accessToken === "acces" && tokens.refreshToken === "renouvellement" && calls[0].body.includes("grant_type=authorization_code"));
  ok("renouvellement automatique de l'accès", (await refreshAccess(cfg, "renouvellement", fake(() => json({ access_token: "nouvel-acces" })))) === "nouvel-acces");
  let invalid = false; try { await refreshAccess(cfg, "x", fake(() => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400))); } catch (e) { invalid = e instanceof GoogleAuthError && e.invalid; }
  ok("jeton retiré ou expiré : signalé comme « à reconnecter »", invalid);
  const cals = await listCalendars("acces", [], fake(() => json({ items: [{ id: "equipe@group.calendar.google.com", summary: "Équipe" }, { id: "moi@exemple.fr", summary: "Moi", primary: true }] })));
  ok("agendas lus, le principal en premier", cals.length === 2 && cals[0].primary && cals[0].id === "moi@exemple.fr");
  calls.length = 0;
  const evs = await listEvents("acces", cal, "moi@exemple.fr", { from: "2026-11-01T00:00:00Z", to: "2026-12-15T00:00:00Z" }, fake((u) => json(u.includes("pageToken=p2")
    ? { items: [{ id: "e9", summary: "Page 2", start: { dateTime: "2026-11-20T10:00:00Z" }, end: { dateTime: "2026-11-20T11:00:00Z" } }] }
    : { nextPageToken: "p2", items: [{ id: "e1", summary: "Un", start: { dateTime: "2026-11-16T10:00:00Z" }, end: { dateTime: "2026-11-16T11:00:00Z" } }, { id: "ex", status: "cancelled", start: { dateTime: "2026-11-16T10:00:00Z" }, end: { dateTime: "2026-11-16T11:00:00Z" } }] })));
  ok("événements lus sur plusieurs pages, annulés écartés", evs.events.length === 2 && evs.events[1].title === "Page 2" && !evs.truncated);
  const big = await listEvents("acces", cal, "moi@exemple.fr", { from: "2026-11-01T00:00:00Z", to: "2026-12-15T00:00:00Z" }, fake(() => json({ nextPageToken: "encore", items: [{ id: "e1", start: { dateTime: "2026-11-16T10:00:00Z" }, end: { dateTime: "2026-11-16T11:00:00Z" } }] })));
  ok("plus de quatre pages : lecture signalée comme partielle", big.truncated && big.events.length === 4);
  const one = (status: number, body: unknown = {}) => fake(() => json(body, status));
  ok("relecture d'un événement supprimé (404, 410) ou annulé : « gone »", (await getEvent("acces", cal, null, "e1", one(404))).state === "gone" && (await getEvent("acces", cal, null, "e1", one(410))).state === "gone"
    && (await getEvent("acces", cal, null, "e1", one(200, { id: "e1", status: "cancelled", start: { dateTime: "2026-11-16T10:00:00Z" }, end: { dateTime: "2026-11-16T11:00:00Z" } }))).state === "gone");
  const moved = await getEvent("acces", cal, null, "e1", one(200, { id: "e1", status: "confirmed", start: { dateTime: "2027-02-01T10:00:00Z" }, end: { dateTime: "2027-02-01T11:00:00Z" } }));
  ok("relecture d'un événement déplacé : ses nouvelles heures", moved.state === "present" && moved.event.starts_at === "2027-02-01T10:00:00.000Z");
  let threw = false; try { await getEvent("acces", cal, null, "e1", one(500)); } catch { threw = true; }
  ok("autre réponse de Google : erreur (rien ne sera annulé)", threw);
  ok("uniquement des lectures vers Google Agenda (aucune écriture)", calls.every((c) => c.method === "GET" && c.url.startsWith("https://www.googleapis.com/calendar/v3/")));

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  process.exit(fail ? 1 : 0);
})();
