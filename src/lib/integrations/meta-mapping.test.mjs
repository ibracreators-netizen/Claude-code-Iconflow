/**
 * Tests des fonctions pures Meta Ads (aucun réseau, aucune base).
 *   node --experimental-strip-types --test src/lib/integrations/meta-mapping.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  authorizeUrl, constantTimeEqual, decodeState, encodeState, humanMetaError, insightsUrl, metricsFromInsights, mondayWindow, pickAction, weekStart,
} from "./meta-mapping.ts";
import { frameAllowed, normalizeDashboardUrl } from "./dashboard-url.ts";

const fixture = JSON.parse(readFileSync(new URL("./__fixtures__/meta-insights.json", import.meta.url), "utf8"));
const CLIENT = "10000000-0000-4000-8000-000000000001";
const sign = (s) => `sig-${s.length}-${[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1_000_003, 7)}`;

test("insights → métriques hebdomadaires (lundi, achats sans double compte)", () => {
  const rows = metricsFromInsights(fixture, CLIENT);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.period_start), ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  const first = rows[0];
  assert.equal(first.client_id, CLIENT);
  assert.equal(first.livrable_id, null);
  assert.equal(first.spend, 1234.56);
  assert.equal(first.impressions, 158000);
  assert.equal(first.clicks, 3320);
  assert.equal(first.thruplays_3s, 56880);
  assert.equal(first.purchases, 61, "omni_purchase l'emporte : ni 61+61+58, ni le pixel seul");
  assert.equal(first.revenue, 3294);
  // Semaine sans omni_purchase : on retombe sur « purchase ».
  assert.equal(rows[1].purchases, 40);
  assert.equal(rows[1].revenue, 2160.5);
  // Semaine sans aucune action : zéros, pas de NaN.
  assert.deepEqual([rows[2].purchases, rows[2].revenue, rows[2].thruplays_3s], [0, 0, 0]);
  // Semaine partielle (mercredi) rattachée à son lundi.
  assert.equal(rows[3].period_start, "2026-10-26");
  assert.equal(rows[3].purchases, 17);
});

test("deux lignes de la même semaine sont additionnées", () => {
  const rows = metricsFromInsights([
    { date_start: "2026-10-06", spend: "10.5", impressions: "100", clicks: "5", actions: [{ action_type: "purchase", value: "1" }] },
    { date_start: "2026-10-09", spend: "4.25", impressions: "50", clicks: "1", action_values: [{ action_type: "purchase", value: "30" }] },
  ], CLIENT);
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, { client_id: CLIENT, livrable_id: null, period_start: "2026-10-05", spend: 14.75, impressions: 150, clicks: 6, thruplays_3s: 0, purchases: 1, revenue: 30 });
});

test("valeurs absentes ou invalides → 0", () => {
  assert.equal(pickAction(undefined, ["purchase"]), 0);
  assert.equal(pickAction([{ action_type: "purchase", value: "abc" }], ["purchase"]), 0);
  const [m] = metricsFromInsights([{ date_start: "2026-10-05" }], CLIENT);
  assert.deepEqual([m.spend, m.impressions, m.clicks, m.purchases, m.revenue], [0, 0, 0, 0, 0]);
  assert.deepEqual(metricsFromInsights({ data: undefined }, CLIENT), []);
});

test("weekStart : lundi ISO quel que soit le jour", () => {
  assert.equal(weekStart("2026-10-28"), "2026-10-26"); // mercredi
  assert.equal(weekStart("2026-11-01"), "2026-10-26"); // dimanche
  assert.equal(weekStart("2026-10-26"), "2026-10-26"); // lundi
  assert.equal(weekStart("2026-01-01"), "2025-12-29"); // changement d'année
  assert.throws(() => weekStart("hier"));
});

test("mondayWindow : 13 semaines alignées sur les lundis", () => {
  const w = mondayWindow(new Date("2026-10-31T10:00:00Z"), 13);
  assert.deepEqual(w, { since: "2026-08-03", until: "2026-10-31" });
  assert.equal(weekStart(w.since), w.since);
});

test("URL Graph : insights et autorisation", () => {
  const u = new URL(insightsUrl({ version: "v21.0", accountId: "123456", since: "2026-08-03", until: "2026-10-31" }));
  assert.equal(u.origin + u.pathname, "https://graph.facebook.com/v21.0/act_123456/insights");
  assert.equal(u.searchParams.get("time_increment"), "7");
  assert.deepEqual(JSON.parse(u.searchParams.get("time_range")), { since: "2026-08-03", until: "2026-10-31" });
  assert.match(u.searchParams.get("fields"), /video_thruplay_watched_actions/);
  assert.equal(new URL(insightsUrl({ version: "v21.0", accountId: "act_9", since: "a", until: "b" })).pathname, "/v21.0/act_9/insights");
  const a = new URL(authorizeUrl({ version: "v21.0", appId: "app", redirectUri: "https://studio.icon-flow.fr/api/integrations/meta/callback", state: "s.t" }));
  assert.equal(a.host, "www.facebook.com");
  assert.equal(a.searchParams.get("scope"), "ads_read,business_management");
  assert.equal(a.searchParams.get("redirect_uri"), "https://studio.icon-flow.fr/api/integrations/meta/callback");
  assert.equal(a.searchParams.get("state"), "s.t");
});

test("état OAuth signé : aller-retour, falsification, expiration, cookie", () => {
  const now = 1_800_000_000_000;
  const state = encodeState({ c: CLIENT, u: "user-1", t: now }, sign);
  assert.match(state, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const ok = decodeState(state, sign, { now: now + 1000, cookie: state });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.payload, { c: CLIENT, u: "user-1", t: now });
  assert.equal(decodeState(state.slice(0, -1) + "x", sign, { now }).reason, "signature");
  assert.equal(decodeState(state, sign, { now: now + 11 * 60 * 1000 }).reason, "expire");
  assert.equal(decodeState(state, sign, { now, cookie: null }).reason, "cookie");
  assert.equal(decodeState(state, sign, { now, cookie: "autre" }).reason, "cookie");
  assert.equal(decodeState(null, sign).reason, "absent");
  assert.equal(decodeState("pas-un-etat", sign).reason, "forme");
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "ab"), false);
});

test("erreurs Graph en français", () => {
  assert.match(humanMetaError({ error: { code: 190, message: "x" } }), /expiré/);
  assert.match(humanMetaError({ error: { code: 10, message: "x" } }), /ads_read/);
  assert.match(humanMetaError({ error: { message: "Unsupported get request" } }), /Meta : Unsupported/);
  assert.match(humanMetaError(null, 503), /indisponible/);
});

test("URL de tableau de bord : Looker Studio intégrable, protocoles refusés", () => {
  assert.equal(normalizeDashboardUrl("https://lookerstudio.google.com/reporting/abc-123/page/p_x"), "https://lookerstudio.google.com/embed/reporting/abc-123/page/p_x");
  assert.equal(normalizeDashboardUrl("https://lookerstudio.google.com/u/0/reporting/abc-123"), "https://lookerstudio.google.com/embed/reporting/abc-123");
  assert.equal(normalizeDashboardUrl("https://lookerstudio.google.com/embed/reporting/abc-123"), "https://lookerstudio.google.com/embed/reporting/abc-123");
  assert.equal(normalizeDashboardUrl("  https://metabase.icon-flow.fr/public/dashboard/1  "), "https://metabase.icon-flow.fr/public/dashboard/1");
  assert.equal(normalizeDashboardUrl("javascript:alert(1)"), null);
  assert.equal(normalizeDashboardUrl("pas une url"), null);
  assert.equal(normalizeDashboardUrl(""), null);
  assert.equal(normalizeDashboardUrl(null), null);
});

test("en-têtes de cadre : X-Frame-Options et CSP frame-ancestors", () => {
  const app = "https://studio.icon-flow.fr";
  assert.equal(frameAllowed({}, app), "ok");
  assert.equal(frameAllowed({ xFrameOptions: "DENY" }, app), "refused");
  assert.equal(frameAllowed({ xFrameOptions: "SAMEORIGIN" }, app), "refused");
  assert.equal(frameAllowed({ csp: "default-src 'self'; frame-ancestors 'none'" }, app), "refused");
  assert.equal(frameAllowed({ csp: "frame-ancestors 'self'" }, app), "refused");
  assert.equal(frameAllowed({ csp: "frame-ancestors https://studio.icon-flow.fr" }, app), "ok");
  assert.equal(frameAllowed({ csp: "frame-ancestors *.icon-flow.fr" }, app), "ok");
  assert.equal(frameAllowed({ csp: "frame-ancestors https:" }, app), "ok");
  assert.equal(frameAllowed({ csp: "frame-ancestors https://autre.fr", xFrameOptions: "" }, app), "refused");
  // La CSP l'emporte sur X-Frame-Options.
  assert.equal(frameAllowed({ csp: "frame-ancestors *", xFrameOptions: "DENY" }, app), "ok");
});
