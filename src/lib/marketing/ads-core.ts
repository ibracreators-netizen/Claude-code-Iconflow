/** Lecture Meta Ads au niveau campagne : fonctions pures (adresse de la demande, traduction d'une ligne). */
import { graphBase } from "@/lib/integrations/meta-mapping";
import type { AdInsight } from "./funnel";

export type MetaCampaignRow = { campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string; date_start?: string };
/** Une ligne d'insight Meta (niveau campagne, par jour) → notre forme. null si inexploitable. */
export function mapInsight(r: MetaCampaignRow): AdInsight | null {
  if (!r.campaign_id || !r.date_start) return null;
  return { day: r.date_start, campaign_id: r.campaign_id, campaign_name: r.campaign_name ?? null, spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0 };
}
export function campaignInsightsUrl(p: { version: string; accountId: string; since: string; until: string }): string {
  const id = p.accountId.startsWith("act_") ? p.accountId : `act_${p.accountId}`;
  const u = new URL(`${graphBase(p.version)}/${id}/insights`);
  u.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks");
  u.searchParams.set("level", "campaign"); u.searchParams.set("time_increment", "1");
  u.searchParams.set("time_range", JSON.stringify({ since: p.since, until: p.until })); u.searchParams.set("limit", "500");
  return u.toString();
}

