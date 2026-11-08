import type { Metadata } from "next";
import Link from "next/link";
import { Target } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { PROSPECT_STATUS, type ProspectStatus } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { NewProspect } from "./prospects-client";

export const metadata: Metadata = { title: "Prospects" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const tone = (s: ProspectStatus): "success" | "danger" | "info" | "warning" | "neutral" => (s === "converti" ? "success" : s === "perdu" ? "danger" : s === "reserve" ? "info" : s === "relance" ? "warning" : "neutral");

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const store = await requireMarketing("marketing_prospects");
  const status = one(sp.status) as ProspectStatus | "";
  const q = one(sp.q);
  const [settings, prospects] = await Promise.all([store.settings(), store.prospects({ status: status || undefined, q: q || undefined })]);
  const link = (extra: Record<string, string>) => { const p = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...extra }); return `/marketing/prospects?${p.toString()}`; };

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Prospects" description="Les leads de l'agence : opt-ins, relances, réservations." actions={<NewProspect />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/marketing/prospects" className={`rounded-full px-3 py-1.5 text-[13px] transition ${!status ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg"}`}>Tous</Link>
        {(Object.keys(PROSPECT_STATUS) as ProspectStatus[]).map((s) => (
          <Link key={s} href={link({ status: s })} className={`rounded-full px-3 py-1.5 text-[13px] transition ${status === s ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg"}`}>{PROSPECT_STATUS[s]}</Link>
        ))}
        <form className="ml-auto" action="/marketing/prospects"><input type="search" name="q" defaultValue={q} placeholder="Rechercher…" className="h-9 w-48 rounded-full border border-border bg-surface px-3.5 text-[13px] outline-none focus:border-border-strong" />{status ? <input type="hidden" name="status" value={status} /> : null}</form>
      </div>

      {prospects.length === 0 ? (
        <div className="card"><EmptyState icon={Target} title="Aucun prospect" description={q || status ? "Aucun prospect ne correspond à ce filtre." : "Ajoute un prospect à la main, ou branche un formulaire d'opt-in plus tard."} /></div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-border">
            {prospects.map((p) => (
              <li key={p.id}>
                <Link href={`/marketing/prospects/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <Avatar name={p.name ?? p.email ?? "?"} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.name ?? p.email ?? "Prospect"}</p>
                    <p className="truncate text-[12.5px] text-muted">{p.email ?? "sans email"}{p.marque ? ` · ${p.marque}` : ""}{p.source ? ` · ${p.source}` : ""}</p>
                  </div>
                  <span className="hidden text-[12px] text-muted sm:block">{formatDateTimeInZone(p.created_at, settings.timezone)}</span>
                  <Badge tone={tone(p.status)}>{PROSPECT_STATUS[p.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
