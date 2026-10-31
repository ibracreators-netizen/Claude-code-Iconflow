"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronDown, Folder, FolderOpen, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export interface ClientFolder { id: string; name: string; logo: string | null; count: number; href: string }

/**
 * Dossiers par client : chaque client est un dossier qui contient ses briefs. « Tous les clients » montre tout.
 * Volet latéral sur grand écran ; barre repliable sur mobile (affiche le dossier courant, se referme après choix).
 */
export function BriefsFolders({ folders, allHref, allCount, active }: { folders: ClientFolder[]; allHref: string; allCount: number; active: string | null }) {
  const [open, setOpen] = React.useState(false);
  const activeName = active ? folders.find((f) => f.id === active)?.name ?? "Client" : "Tous les clients";

  const list = (
    <nav aria-label="Dossiers par client" className="flex flex-col gap-0.5">
      <Link href={allHref} onClick={() => setOpen(false)} aria-current={!active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition ${!active ? "bg-accent-soft font-semibold text-fg" : "text-fg-2 hover:bg-surface-2"}`}>
        <Users className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">Tous les clients</span>
        <span className="tabular text-[12px] text-muted">{allCount}</span>
      </Link>
      <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">Clients</p>
      {folders.map((f) => {
        const on = active === f.id;
        return (
          <Link key={f.id} href={f.href} onClick={() => setOpen(false)} aria-current={on ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition ${on ? "bg-accent-soft font-semibold text-fg" : "text-fg-2 hover:bg-surface-2"}`}>
            {f.logo ? <Avatar name={f.name} src={f.logo} size={20} square /> : on ? <FolderOpen className="size-4 shrink-0 text-accent-2" /> : <Folder className="size-4 shrink-0 text-muted" />}
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="tabular text-[12px] text-muted">{f.count}</span>
          </Link>
        );
      })}
      {folders.length === 0 ? <p className="px-2.5 py-2 text-[12.5px] text-muted-2">Aucun client pour l&apos;instant.</p> : null}
    </nav>
  );

  return (
    <>
      {/* Mobile : barre repliable */}
      <div className="lg:hidden">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] font-medium">
          <Folder className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate text-left">{activeName}</span>
          <ChevronDown className={`size-4 text-muted transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? <div className="mt-2 rounded-xl border border-border bg-surface p-1.5">{list}</div> : null}
      </div>
      {/* Grand écran : volet permanent */}
      <aside className="hidden lg:block">
        <div className="sticky top-[76px] rounded-xl border border-border bg-surface p-2">{list}</div>
      </aside>
    </>
  );
}
