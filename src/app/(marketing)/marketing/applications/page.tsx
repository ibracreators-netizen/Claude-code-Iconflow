import type { Metadata } from "next";
import { requireMarketingSpace } from "@/lib/marketing/session";
import { appsFor, MK_GROUPS } from "@/lib/marketing/apps";
import { canAccess, hasFullAccess, type ModuleKey } from "@/lib/permissions";
import { AppsView, type AppsGroup } from "./apps-view";

export const metadata: Metadata = { title: "Applications" };

/**
 * Écran « Applications » (onglet du téléphone), comme LeadConnector : toutes les pages que ce compte peut ouvrir,
 * rangées par famille, avec une recherche. Une page non permise n'apparaît jamais.
 */
export default async function ApplicationsPage() {
  const store = await requireMarketingSpace();
  const profile = store.session.profile;
  const apps = appsFor((m: ModuleKey) => canAccess(profile, m), hasFullAccess(profile));
  const groups: AppsGroup[] = MK_GROUPS
    .map((g) => ({ key: g.key, title: g.title, apps: apps.filter((a) => a.group === g.key).map(({ key, label, href, icon, words }) => ({ key, label, href, icon, words: words ?? "" })) }))
    .filter((g) => g.apps.length);
  return (
    <>
      <h1 className="sr-only">Applications</h1>
      <AppsView groups={groups} />
    </>
  );
}
