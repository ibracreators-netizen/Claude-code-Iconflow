import Link from "next/link";
import { ChevronRight, ClipboardList, FileText, LayoutTemplate, LinkIcon, type LucideIcon } from "lucide-react";
import type { PublicDoc } from "@/lib/marketing/onboarding-link-server";
import { RESOURCE_KIND, type ResourceKind } from "@/lib/marketing/resources";

/* Morceaux communs des pages du lien d'onboarding (rendus côté serveur). */

const KIND_ICON: Record<ResourceKind, LucideIcon> = { sop: ClipboardList, template: LayoutTemplate, doc: FileText };
export const CARD = "rounded-[16px] border border-mk-line bg-surface shadow-soft";

/** Page neutre : jeton faux, lien coupé ou changé (la même pour tous les cas), ou indisponible. */
export function Neutral({ title, text }: { title: string; text: string }) {
  return (
    <section className={`${CARD} mt-10 px-5 py-10 text-center`}>
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon" aria-hidden><LinkIcon className="size-6" strokeWidth={1.8} /></span>
      <h1 className="mt-4 text-[20px] font-semibold leading-snug text-mk-strong">{title}</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-mk-sub">{text}</p>
    </section>
  );
}
export const GONE = { title: "Ce lien n'est plus valable.", text: "Demande un nouveau lien à ton responsable." };
export const UNAVAILABLE = { title: "Ton onboarding n'est pas disponible pour le moment.", text: "Réessaie un peu plus tard. Si ça dure, préviens ton responsable." };

export function DocList({ docs, href, empty }: { docs: PublicDoc[]; href: (id: string) => string; empty?: string }) {
  if (!docs.length) return empty ? <p className="px-4 py-4 text-[15px] text-mk-sub sm:px-5">{empty}</p> : null;
  return (
    <ul>
      {docs.map((d) => {
        const Icon = KIND_ICON[d.kind as ResourceKind] ?? FileText;
        return (
          <li key={d.id} className="border-t border-mk-line first:border-t-0">
            <Link href={href(d.id)} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition active:bg-mk-chip sm:px-5 lg:hover:bg-surface-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-2" aria-hidden><Icon className="size-5" strokeWidth={1.8} /></span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-[16px] font-semibold leading-snug text-mk-strong lg:text-[15px]">{d.title}</span>
                <span className="block text-[13px] text-mk-sub">{RESOURCE_KIND[d.kind as ResourceKind] ?? "Document"}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-mk-icon" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

